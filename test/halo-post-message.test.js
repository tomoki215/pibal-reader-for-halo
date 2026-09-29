import assert from 'node:assert/strict';
import test from 'node:test';
import { createHaloIntegration } from '../src/integrations/halo/halo-post-message.js';

const haloOrigin = 'https://halo.example.com';

function fixture({ search = `?haloOrigin=${encodeURIComponent(haloOrigin)}`, embedded = true } = {}) {
  const listeners = new Map();
  const sent = [];
  const parent = { postMessage: (data, targetOrigin) => sent.push({ data, targetOrigin }) };
  let uuid = 0;
  const fakeWindow = {
    location: { search }, parent: embedded ? parent : null,
    crypto: { randomUUID: () => `measurement-${++uuid}` },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => listeners.get(type) === listener && listeners.delete(type)
  };
  if (!embedded) fakeWindow.parent = fakeWindow;
  const states = [];
  const integration = createHaloIntegration({
    window: fakeWindow, allowedOrigins: [haloOrigin],
    getMeasurement: () => ({ observedAt: '2026-09-29T14:30:00+09:00', layers: [{ lowerAltitude: 0, upperAltitude: 100, direction: 90.5, speed: 5.4 }] }),
    onStateChange: state => states.push(state)
  });
  integration.start();
  const ready = (overrides = {}) => listeners.get('message')?.({
    origin: haloOrigin, source: parent,
    data: { source: 'halo', type: 'pibal.integration.ready', protocolVersion: 1 }, ...overrides
  });
  return { integration, fakeWindow, listeners, parent, ready, sent, states };
}

test('handshake enables sending and sends a versioned measurement to the exact origin', () => {
  const app = fixture();
  app.ready();
  assert.equal(app.sent[0].data.type, 'pibal.integration.capabilities');
  assert.equal(app.integration.sendMeasurement(), true);
  assert.equal(app.sent[1].targetOrigin, haloOrigin);
  assert.equal(app.sent[1].data.protocolVersion, 1);
  assert.equal(app.sent[1].data.measurementId, 'measurement-1');
  assert.deepEqual(app.sent[1].data.layers[0], { lowerAltitude: 0, upperAltitude: 100, direction: 90.5, speed: 5.4 });
});

test('a new measurement id is generated for every send', () => {
  const app = fixture();
  app.ready();
  app.integration.sendMeasurement();
  app.integration.sendMeasurement();
  assert.notEqual(app.sent[1].data.measurementId, app.sent[2].data.measurementId);
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

test('messages from another window or origin are ignored and listener is removed', () => {
  const app = fixture();
  app.ready({ source: {} });
  app.ready({ origin: 'https://evil.example' });
  assert.equal(app.integration.sendMeasurement(), false);
  app.integration.destroy();
  assert.equal(app.listeners.has('message'), false);
});
