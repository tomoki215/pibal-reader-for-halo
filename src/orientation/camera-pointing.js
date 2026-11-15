// 背面カメラの光軸（端末の -Z 軸）が指す方位・仰角を DeviceOrientation から求める。
// W3C の回転順序 R = Rz(alpha) · Rx(beta) · Ry(gamma) で、地球座標は x=東, y=北, z=上。
// 光軸は画面の向き（縦横）に依存しないため、画面回転の補正は不要。

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

// -180〜180 の範囲へ折り返した角度差。
function wrapSigned(value) {
  return normalizeDegrees(value + 180) - 180;
}

// 光軸の単位ベクトル（東・北・上）。
export function cameraAxis(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * RAD, b = betaDeg * RAD, g = gammaDeg * RAD;
  return {
    east: -(Math.sin(g) * Math.cos(a) + Math.cos(g) * Math.sin(b) * Math.sin(a)),
    north: -(Math.sin(g) * Math.sin(a) - Math.cos(g) * Math.sin(b) * Math.cos(a)),
    up: -Math.cos(g) * Math.cos(b)
  };
}

// 光軸の方位（alpha の基準系、0〜360）と仰角（-90〜90）。
export function cameraPointing(alphaDeg, betaDeg, gammaDeg) {
  const axis = cameraAxis(alphaDeg, betaDeg, gammaDeg);
  return {
    azimuth: normalizeDegrees(Math.atan2(axis.east, axis.north) * DEG),
    elevation: Math.asin(Math.max(-1, Math.min(1, axis.up))) * DEG
  };
}

// 仰角がこの範囲外では水平成分が小さく方位が不安定なため、iOS のコンパス補正値を更新しない。
const CALIBRATION_MIN_ELEVATION = -30;
const CALIBRATION_MAX_ELEVATION = 60;
const CALIBRATION_WEIGHT = 0.1;

// イベントを順に渡すと、光軸の方位・仰角を返す。無効なイベントは null。
// - Android: deviceorientationabsolute の alpha（磁北基準）をそのまま使う。
// - iOS: alpha は任意基準のため、webkitCompassHeading との差を滑らかに追従する補正値にする。
//   iOS のコンパスは端末を立てた状態でカメラの向きを指す前提（実機での確認が必要）。
export function createPointingTracker() {
  let compassOffset = null;
  let sawAbsolute = false;

  return {
    update(event) {
      const { alpha, beta, gamma } = event;
      if (![alpha, beta, gamma].every(Number.isFinite)) return null;

      const { azimuth, elevation } = cameraPointing(alpha, beta, gamma);
      const compass = event.webkitCompassHeading;

      if (Number.isFinite(compass) && !(event.webkitCompassAccuracy < 0)) {
        const sample = normalizeDegrees(compass - azimuth);
        if (compassOffset === null) {
          compassOffset = sample;
        } else if (elevation >= CALIBRATION_MIN_ELEVATION && elevation <= CALIBRATION_MAX_ELEVATION) {
          compassOffset = normalizeDegrees(compassOffset + CALIBRATION_WEIGHT * wrapSigned(sample - compassOffset));
        }
        return { heading: normalizeDegrees(azimuth + compassOffset), elevation, absolute: true };
      }

      if (event.type === 'deviceorientationabsolute' || event.absolute === true) {
        sawAbsolute = true;
        return { heading: azimuth, elevation, absolute: true };
      }

      // 絶対方位が得られる端末では、相対値のイベントが混ざらないよう無視する。
      if (sawAbsolute) return null;
      return { heading: azimuth, elevation, absolute: false };
    }
  };
}
