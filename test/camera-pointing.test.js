import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraPointing, createPointingTracker } from '../src/orientation/camera-pointing.js';

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} expected ${expected}, got ${actual}`);

test('upright phone with alpha=0 points the camera north at the horizon', () => {
  const p = cameraPointing(0, 90, 0);
  near(p.azimuth, 0);
  near(p.elevation, 0);
});

test('tilting the top edge back raises the camera elevation by beta - 90', () => {
  near(cameraPointing(0, 120, 0).elevation, 30);
  near(cameraPointing(0, 90, 0).elevation, 0);
  near(cameraPointing(0, 180, 0).elevation, 90);
});

test('alpha rotates counter-clockwise, so the camera azimuth is 360 - alpha', () => {
  near(cameraPointing(90, 90, 0).azimuth, 270);
  near(cameraPointing(270, 90, 0).azimuth, 90);
  near(cameraPointing(180, 90, 0).azimuth, 180);
});

test('elevation and azimuth stay consistent with gamma roll', () => {
  // beta=0, gamma=90 は横持ち相当。カメラは水平で、方位は 270 度になる。
  const landscape = cameraPointing(0, 0, 90);
  near(landscape.elevation, 0);
  near(landscape.azimuth, 270);
  // 端末を地面と水平に置くと背面カメラは真下を向く。
  near(cameraPointing(0, 0, 0).elevation, -90);
});

test('Android absolute events provide the heading directly and relative events are ignored afterwards', () => {
  const tracker = createPointingTracker();
  const absolute = tracker.update({ type: 'deviceorientationabsolute', alpha: 90, beta: 120, gamma: 0 });
  near(absolute.heading, 270);
  near(absolute.elevation, 30);
  assert.equal(absolute.absolute, true);
  assert.equal(tracker.update({ type: 'deviceorientation', absolute: false, alpha: 10, beta: 100, gamma: 0 }), null);
});

test('relative-only events are reported as not absolute', () => {
  const tracker = createPointingTracker();
  const result = tracker.update({ type: 'deviceorientation', absolute: false, alpha: 0, beta: 90, gamma: 0 });
  assert.equal(result.absolute, false);
});

test('iOS compass heading calibrates the arbitrary alpha reference', () => {
  const tracker = createPointingTracker();
  // alpha の基準が任意（ここでは 40 度ずれ）でも、コンパス方位 100 度に合わせる。
  const first = tracker.update({ alpha: 40, beta: 100, gamma: 0, webkitCompassHeading: 100 });
  near(first.heading, 100);
  // 同じ基準のまま端末を 30 度右（時計回り）へ回す: alpha は 30 減る。
  const turned = tracker.update({ alpha: 10, beta: 100, gamma: 0, webkitCompassHeading: 130 });
  near(turned.heading, 130);
});

test('iOS offset is frozen when the camera points steeply upward', () => {
  const tracker = createPointingTracker();
  tracker.update({ alpha: 0, beta: 100, gamma: 0, webkitCompassHeading: 0 });
  // ほぼ真上を向くとコンパス値が不安定になるため、補正は更新せずジャイロの変化で追従する。
  const steep = tracker.update({ alpha: 0, beta: 170, gamma: 0, webkitCompassHeading: 77 });
  assert.ok(steep.elevation > 60);
  near(steep.heading, 0);
});

test('events with missing angles are rejected', () => {
  const tracker = createPointingTracker();
  assert.equal(tracker.update({ alpha: null, beta: 90, gamma: 0 }), null);
});
