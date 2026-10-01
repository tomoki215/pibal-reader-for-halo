import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 実際の観測画面の計算・変換を実行し、表示の丸めと送信値のずれを検出する。
function observation() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const fields = new Map();
  const context = {
    window: { addEventListener() {} },
    document: { getElementById: id => {
      if (!fields.has(id)) fields.set(id, { value: '', textContent: '', style: {}, classList: { add() {}, remove() {} } });
      return fields.get(id);
    } },
    navigator: {}, console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  vm.runInContext('updateTable = () => {}; drawChart = () => {}; setStatus = () => {}; manualMode = true; isRecording = true;', context);
  fields.set('ascentRate', { value: '200' });
  fields.set('interval', { value: '30' });
  fields.set('manElev', { value: '45' });
  fields.set('obsTime', { value: '14:30' });
  return { context, fields, capture: heading => {
    fields.set('manHeading', { value: String(heading) });
    vm.runInContext('capturePoint()', context);
    return JSON.parse(JSON.stringify(context.window.getHaloMeasurement()));
  } };
}

test('real observation exports meteorological From direction, m/s and layer bounds', () => {
  const app = observation();
  const measurement = app.capture(90);
  assert.deepEqual(measurement.layers, [{ lowerAltitude: 0, upperAltitude: 100, direction: 270, speed: 3.3 }]);
  assert.match(measurement.observedAt, /Z$/);
  assert.equal(new Date(measurement.observedAt).getHours(), 14);
  assert.equal(new Date(measurement.observedAt).getMinutes(), 30);
});

test('rounding at north produces 0 instead of an invalid 360', () => {
  const app = observation();
  assert.equal(app.capture(179.99).layers[0].direction, 0);
});

test('calm and unavailable layers are omitted rather than fabricated', () => {
  const app = observation();
  app.fields.set('manElev', { value: '90' });
  assert.deepEqual(app.capture(90).layers, []);
});
