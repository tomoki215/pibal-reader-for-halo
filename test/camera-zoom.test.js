import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_TOTAL_ZOOM, clampZoom, splitZoom, createPinchTracker } from '../src/camera/zoom.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

test('clampZoom keeps the factor within 1 and the total maximum', () => {
  assert.equal(clampZoom(0.3), 1);
  assert.equal(clampZoom(5), 5);
  assert.equal(clampZoom(1000), MAX_TOTAL_ZOOM);
  assert.equal(clampZoom(NaN), 1);
});

test('without hardware zoom everything is digital', () => {
  assert.deepEqual(splitZoom(3, null), { hardware: null, digitalScale: 3 });
  assert.deepEqual(splitZoom(3, { min: 1, max: 1 }), { hardware: null, digitalScale: 3 });
});

test('hardware zoom is used first and the remainder is digital', () => {
  const caps = { min: 1, max: 4, step: 0.1 };
  assert.deepEqual(splitZoom(2, caps), { hardware: 2, digitalScale: 1 });
  const beyond = splitZoom(10, caps);
  near(beyond.hardware, 4);
  near(beyond.digitalScale, 2.5);
});

test('a zoom range that does not start at 1 is normalised to the minimum', () => {
  // 超広角を含む端末は min が 0.5 になる。表示倍率 1 は min に対応する。
  const caps = { min: 0.5, max: 2, step: 0.01 };
  const wide = splitZoom(1, caps);
  near(wide.hardware, 0.5);
  near(wide.digitalScale, 1);
  const max = splitZoom(8, caps);
  near(max.hardware, 2);
  near(max.digitalScale, 2);
});

test('the combined factor always equals the requested zoom', () => {
  const caps = { min: 1, max: 5, step: 0.5 };
  for (const zoom of [1, 1.3, 2.7, 5, 6.2, 20]) {
    const { hardware, digitalScale } = splitZoom(zoom, caps);
    near((hardware / caps.min) * digitalScale, clampZoom(zoom));
  }
});

test('pinching scales the zoom by the change in finger distance', () => {
  const pinch = createPinchTracker();
  pinch.down(1, 0, 0, 2);
  assert.equal(pinch.move(1, 0, 0), null);
  pinch.down(2, 100, 0, 2);
  near(pinch.move(2, 200, 0), 4); // 間隔が 2 倍 → 倍率も 2 倍
  near(pinch.move(2, 50, 0), 1); // 間隔が半分 → 1 まで（下限）
  assert.equal(pinch.pinching, true);
  pinch.up(2);
  assert.equal(pinch.pinching, false);
  assert.equal(pinch.move(1, 10, 10), null);
});

test('a new pinch starts from the current zoom', () => {
  const pinch = createPinchTracker();
  pinch.down(1, 0, 0, 1);
  pinch.down(2, 100, 0, 1);
  near(pinch.move(2, 300, 0), 3);
  pinch.up(1);
  pinch.up(2);
  pinch.down(3, 0, 0, 3);
  pinch.down(4, 50, 0, 3);
  near(pinch.move(4, 100, 0), 6);
});
