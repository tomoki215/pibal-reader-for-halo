import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHaloIntegration } from '../src/integrations/halo/halo-post-message.js';

const haloOrigin = 'https://halo.example.com';

function fixture({ search = `?haloOrigin=${encodeURIComponent(haloOrigin)}`, embedded = true,
  allowedOrigins = [haloOrigin], trustEmbeddingOrigin = false, referrer = '', layers, crypto, getMeasurement } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const sent = [];
  const parent = { postMessage: (data, targetOrigin) => sent.push({ data, targetOrigin }) };
  let uuid = 0;
  const fakeWindow = {
    location: { search }, parent: embedded ? parent : null,
    crypto: crypto ?? { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    setTimeout: callback => { const id = Symbol(); timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => listeners.get(type) === listener && listeners.delete(type)
  };
  if (!embedded) fakeWindow.parent = fakeWindow;
  const states = [];
  const integration = createHaloIntegration({
    window: fakeWindow, document: { referrer }, allowedOrigins, trustEmbeddingOrigin,
    getMeasurement: getMeasurement ?? (() => ({ observedAt: '2026-09-29T14:30:00+09:00', layers: layers ?? [{ lowerAltitude: 0, upperAltitude: 100, direction: 90.5, speed: 5.4 }] })),
    onStateChange: state => states.push(state)
  });
  integration.start();
  const message = (data, overrides = {}) => listeners.get('message')?.({ origin: haloOrigin, source: parent, data, ...overrides });
  const ready = (overrides = {}) => message({ source: 'halo', type: 'pibal.integration.ready', protocolVersion: 1 }, overrides);
  const acknowledge = (type = 'pibal.measurement.accepted', measurementId = sent.at(-1).data.measurementId, overrides = {}) =>
    message({ source: 'halo', type, protocolVersion: 1, measurementId }, overrides);
  return { integration, fakeWindow, listeners, parent, ready, acknowledge, message, sent, states, timers };
}

test('reader requests handshake at startup and sends a versioned measurement to the exact origin', () => {
  const app = fixture();
  assert.equal(app.sent[0].data.type, 'pibal.integration.request');
  assert.equal(app.integration.sendMeasurement(), false);
  app.ready();
  assert.equal(app.sent[1].data.type, 'pibal.integration.capabilities');
  assert.equal(app.integration.sendMeasurement(), true);
  assert.equal(app.sent[2].targetOrigin, haloOrigin);
  assert.equal(app.sent[2].data.protocolVersion, 1);
  assert.equal(app.sent[2].data.measurementId, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(app.sent[2].data.layers[0], { lowerAltitude: 0, upperAltitude: 100, direction: 90.5, speed: 5.4 });
});

test('pending transfer disables repeated sends until matching acknowledgement', () => {
  const app = fixture();
  app.ready();
  app.integration.sendMeasurement();
  const firstId = app.sent.at(-1).data.measurementId;
  assert.equal(app.states.at(-1).canSend, false);
  assert.equal(app.integration.sendMeasurement(), false);
  app.acknowledge('pibal.measurement.accepted', 'wrong-id');
  app.acknowledge('pibal.measurement.accepted', firstId, { origin: 'https://evil.example' });
  app.acknowledge('pibal.measurement.accepted', firstId, { source: {} });
  assert.equal(app.integration.sendMeasurement(), false);
  app.acknowledge('pibal.measurement.accepted', firstId);
  assert.equal(app.timers.size, 0);
  assert.equal(app.states.at(-1).canSend, true);
  assert.equal(app.integration.sendMeasurement(), true);
  assert.notEqual(firstId, app.sent.at(-1).data.measurementId);
});

test('rejection and timeout both allow retry and display actionable errors', () => {
  const app = fixture();
  app.ready();
  app.integration.sendMeasurement();
  app.acknowledge('pibal.measurement.rejected');
  assert.equal(app.states.at(-1).status.type, 'err');
  assert.equal(app.states.at(-1).canSend, true);
  app.integration.sendMeasurement();
  [...app.timers.values()][0]();
  assert.equal(app.states.at(-1).canSend, true);
  assert.match(app.states.at(-1).status.text, /応答がありません/);
});

test('unlisted origins and standalone tabs cannot send', () => {
  const invalid = fixture({ search: '?haloOrigin=https%3A%2F%2Fevil.example' });
  invalid.ready();
  assert.equal(invalid.integration.sendMeasurement(), false);
  assert.equal(invalid.sent.length, 0);
  const standalone = fixture({ embedded: false });
  standalone.ready();
  assert.equal(standalone.integration.sendMeasurement(), false);
  assert.equal(standalone.sent.length, 0);
});

test('messages from another window, origin, source or protocol are ignored', () => {
  const app = fixture();
  app.ready({ source: {} });
  app.ready({ origin: 'https://evil.example' });
  app.ready({ data: { source: 'other', type: 'pibal.integration.ready', protocolVersion: 1 } });
  app.ready({ data: { source: 'halo', type: 'pibal.integration.ready', protocolVersion: 2 } });
  assert.equal(app.integration.sendMeasurement(), false);
});

test('destroy cleans listeners and pending timers and permits restoring a cached page', () => {
  const app = fixture();
  app.ready();
  app.integration.sendMeasurement();
  app.integration.destroy();
  assert.equal(app.listeners.size, 0);
  assert.equal(app.timers.size, 0);
  assert.equal(app.integration.sendMeasurement(), false);
  app.integration.start();
  app.integration.start();
  assert.equal(app.listeners.size, 1);
  assert.equal(app.sent.at(-1).data.type, 'pibal.integration.request');
  app.ready();
  assert.equal(app.integration.sendMeasurement(), true);
});

test('deployed configuration enables exact referrer mode without publishing a HALO origin', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../halo-config.js', import.meta.url), 'utf8'), context);
  assert.equal(context.window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN, true);
  assert.equal(context.window.PIBAL_HALO_ALLOWED_ORIGINS.length, 0);
  const app = fixture({ search: '', allowedOrigins: [], trustEmbeddingOrigin: context.window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN, referrer: `${haloOrigin}/wind/edit/42` });
  app.ready();
  assert.equal(app.integration.sendMeasurement(), true);
  assert.equal(app.sent.at(-1).targetOrigin, haloOrigin);
});

test('allowlist accepts an approved referrer without a query and never falls back to an unlisted embedder', () => {
  const approved = fixture({ search: '', referrer: `${haloOrigin}/wind` });
  approved.ready();
  assert.equal(approved.integration.sendMeasurement(), true);
  const rejected = fixture({ search: '', trustEmbeddingOrigin: true, referrer: 'https://evil.example/wind' });
  rejected.ready({ origin: 'https://evil.example' });
  assert.equal(rejected.integration.sendMeasurement(), false);
  assert.equal(rejected.sent.length, 0);
});

test('a malformed nonempty allowlist never enables unrestricted trust', () => {
  const app = fixture({ search: '', allowedOrigins: ['https://halo.example.com/path'], trustEmbeddingOrigin: true, referrer: `${haloOrigin}/wind` });
  app.ready();
  assert.equal(app.integration.sendMeasurement(), false);
  assert.equal(app.sent.length, 0);
});

test('referrer mode rejects missing and non-HTTP referrers', () => {
  for (const referrer of ['', 'file:///tmp/halo.html', 'not a URL']) {
    const app = fixture({ search: '', allowedOrigins: [], trustEmbeddingOrigin: true, referrer });
    app.ready();
    assert.equal(app.integration.sendMeasurement(), false);
    assert.equal(app.sent.length, 0);
  }
});

test('an empty observation does not send or enter pending state', () => {
  const app = fixture({ layers: [] });
  app.ready();
  assert.equal(app.integration.sendMeasurement(), false);
  assert.equal(app.timers.size, 0);
  assert.equal(app.states.at(-1).status.type, 'warn');
});


test('an insecure embedding context without randomUUID sends a secure UUID v4', () => {
  let sequence = 0;
  const crypto = { getRandomValues: bytes => { bytes.fill(++sequence); return bytes; } };
  const app = fixture({ crypto });
  app.ready();
  assert.equal(app.integration.sendMeasurement(), true);
  const firstId = app.sent.at(-1).data.measurementId;
  assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  app.acknowledge();
  assert.equal(app.integration.sendMeasurement(), true);
  assert.notEqual(app.sent.at(-1).data.measurementId, firstId);
});

test('unavailable randomness and invalid observations show errors without leaving a pending transfer', () => {
  for (const options of [
    { crypto: {} },
    { getMeasurement: () => { throw new Error('observation failure'); } },
    { getMeasurement: () => ({ observedAt: 'invalid', layers: [{}] }) }
  ]) {
    const app = fixture(options);
    app.ready();
    const initialMessages = app.sent.length;
    assert.equal(app.integration.sendMeasurement(), false);
    assert.equal(app.sent.length, initialMessages);
    assert.equal(app.timers.size, 0);
    assert.equal(app.states.at(-1).canSend, true);
    assert.equal(app.states.at(-1).status.type, 'err');
    assert.match(app.states.at(-1).status.text, /送信できませんでした/);
  }
});
