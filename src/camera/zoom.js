// カメラのズーム制御。ズームは常に画面中央を基準にし、十字線が光軸上から外れないようにする。
// ハードウェアズーム（MediaStreamTrack の zoom）が使えれば上限までそれを使い、
// 超える分や非対応端末（iOS Safari など）ではデジタルズーム（CSS 拡大）で補う。

// 画質が落ちても可能な限り拡大できるようにする、合計倍率の上限。
export const MAX_TOTAL_ZOOM = 100;

export function clampZoom(zoom, max = MAX_TOTAL_ZOOM) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(1, zoom));
}

// 表示倍率（1 が等倍）を、ハードウェアズーム値とデジタル拡大率へ分ける。
// caps は track.getCapabilities().zoom の { min, max, step }。非対応なら null。
export function splitZoom(zoom, caps) {
  const z = clampZoom(zoom);
  if (!caps || !(caps.max > caps.min) || !(caps.min > 0)) {
    return { hardware: null, digitalScale: z };
  }
  const hardwareFactor = Math.min(z, caps.max / caps.min);
  let hardware = caps.min * hardwareFactor;
  if (caps.step > 0) {
    hardware = caps.min + Math.round((hardware - caps.min) / caps.step) * caps.step;
  }
  hardware = Math.min(caps.max, Math.max(caps.min, hardware));
  return { hardware, digitalScale: z / (hardware / caps.min) };
}

// 2 本指のピンチ操作から倍率を求める。指の間隔の比率がそのまま倍率の比率になる。
export function createPinchTracker() {
  const pointers = new Map();
  let startDistance = null;
  let startZoom = 1;

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return {
    down(id, x, y, currentZoom) {
      pointers.set(id, { x, y });
      if (pointers.size === 2) {
        const d = distance();
        startDistance = d > 0 ? d : null;
        startZoom = clampZoom(currentZoom);
      }
    },
    // 2 本指でピンチ中なら新しい倍率、それ以外は null。
    move(id, x, y) {
      if (!pointers.has(id)) return null;
      pointers.set(id, { x, y });
      if (pointers.size !== 2 || startDistance === null) return null;
      return clampZoom(startZoom * (distance() / startDistance));
    },
    up(id) {
      pointers.delete(id);
      startDistance = null;
    },
    get pinching() {
      return pointers.size >= 2;
    }
  };
}
