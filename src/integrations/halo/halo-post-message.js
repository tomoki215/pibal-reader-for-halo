import {
  capabilitiesMessage, HALO_READY, MEASUREMENT_ACCEPTED, MEASUREMENT_COMPLETED,
  PIBAL_REQUEST, PROTOCOL_VERSION
} from './halo-message-types.js';
import { createMeasurementId } from './halo-measurement-id.js';
import { embeddingOrigin, isHaloMessage, normalizeAllowedOrigins, requestedHaloOrigin } from './halo-message-validator.js';

const standaloneMessage = 'HALOへの反映は、HALOの風情報画面の「追加」から開いた場合に利用できます。単独利用時はCSVを出力してください。';

export function createHaloIntegration({ window, document, allowedOrigins, trustEmbeddingOrigin = false,
  getMeasurement, onStateChange = () => {}, acknowledgementTimeoutMs = 10000 }) {
  const origins = normalizeAllowedOrigins(allowedOrigins);
  const parentOrigin = embeddingOrigin(document);
  // 許可リストがある配信では、埋め込み元の信頼によって制限を迂回させない。
  const haloOrigin = requestedHaloOrigin(window.location, origins) ||
    (origins.has(parentOrigin) || (allowedOrigins.length === 0 && trustEmbeddingOrigin) ? parentOrigin : null);
  const embedded = window.parent !== window;
  let started = false;
  let ready = false;
  let pendingMeasurementId = null;
  let acknowledgementTimer = null;

  const emit = (extra = {}) => onStateChange({
    canSend: started && embedded && Boolean(haloOrigin) && ready && pendingMeasurementId === null,
    ...extra
  });
  const post = data => window.parent.postMessage(data, haloOrigin);
  const clearPending = () => {
    if (acknowledgementTimer !== null) window.clearTimeout(acknowledgementTimer);
    acknowledgementTimer = null;
    pendingMeasurementId = null;
  };

  function handleMessage(event) {
    if (!embedded || !haloOrigin || event.origin !== haloOrigin || event.source !== window.parent || !isHaloMessage(event.data)) return;
    if (event.data.type === HALO_READY) {
      ready = true;
      post(capabilitiesMessage());
      emit({ message: 'HALOとの接続を確認しました。観測完了後に結果を反映できます。' });
    } else if (pendingMeasurementId !== null && event.data.measurementId === pendingMeasurementId) {
      clearPending();
      const accepted = event.data.type === MEASUREMENT_ACCEPTED;
      emit({ status: {
        text: accepted ? 'HALOへ送信しました。追加画面で内容を確認し、「OK」で保存してください。' :
          'HALOが観測結果を受け取れませんでした。内容を確認するかCSV出力をご利用ください。',
        type: accepted ? 'ok' : 'err'
      } });
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      window.addEventListener('message', handleMessage);
      if (!embedded) emit({ message: standaloneMessage });
      else if (!haloOrigin) emit({ message: 'HALOとの接続を確認できません。HALOの「追加」から開き直すか、CSVを出力してください。' });
      else {
        emit({ message: 'HALOとの接続を確認しています。' });
        // iframe の load 通知より遅く初期化された場合も接続する。
        post({ source: 'pibal-reader', type: PIBAL_REQUEST, protocolVersion: PROTOCOL_VERSION });
      }
    },
    sendMeasurement() {
      if (!started || !embedded || !haloOrigin || !ready || pendingMeasurementId !== null) return false;
      try {
        const measurement = getMeasurement();
        if (!measurement.layers.length) {
          emit({ status: { text: '送信する観測データがありません。', type: 'warn' } });
          return false;
        }
        const observedAt = new Date(measurement.observedAt).toISOString();
        pendingMeasurementId = createMeasurementId(window.crypto);
        acknowledgementTimer = window.setTimeout(() => {
          clearPending();
          emit({ status: { text: 'HALOから応答がありません。接続を確認して再度反映するか、CSVを出力してください。', type: 'err' } });
        }, acknowledgementTimeoutMs);
        emit({ status: { text: 'HALOへ送信中…', type: 'info' } });
        post({
          source: 'pibal-reader', type: MEASUREMENT_COMPLETED, protocolVersion: PROTOCOL_VERSION,
          measurementId: pendingMeasurementId, observedAt,
          directionConvention: 'from', altitudeUnit: 'm', speedUnit: 'm/s', layers: measurement.layers
        });
        return true;
      } catch {
        clearPending();
        emit({ status: { text: '観測結果を送信できませんでした。観測内容とブラウザの設定を確認し、再度反映するかCSVを出力してください。', type: 'err' } });
        return false;
      }
    },
    destroy() {
      window.removeEventListener('message', handleMessage);
      clearPending();
      ready = false;
      started = false;
    }
  };
}
