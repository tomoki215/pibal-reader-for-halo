import {
  capabilitiesMessage, HALO_READY, MEASUREMENT_ACCEPTED, MEASUREMENT_COMPLETED,
  MEASUREMENT_REJECTED, PROTOCOL_VERSION
} from './halo-message-types.js';
import { embeddingOrigin, isHaloMessage, normalizeAllowedOrigins, requestedHaloOrigin } from './halo-message-validator.js';

const standaloneMessage = 'HALOへの反映は、HALOの風データ編集画面から開いた場合に利用できます。単独利用時はCSVを出力してください。';

export function createHaloIntegration({ window, document, allowedOrigins, trustEmbeddingOrigin = false, getMeasurement, onStateChange = () => {} }) {
  const origins = normalizeAllowedOrigins(allowedOrigins);
  const haloOrigin = requestedHaloOrigin(window.location, origins) ||
    (trustEmbeddingOrigin ? embeddingOrigin(document) : null);
  const embedded = window.parent !== window;
  let ready = false;
  let pendingMeasurementId = null;

  const emit = (extra = {}) => onStateChange({ canSend: embedded && Boolean(haloOrigin) && ready, ...extra });
  const post = data => window.parent.postMessage(data, haloOrigin);

  function handleMessage(event) {
    if (!embedded || !haloOrigin || event.origin !== haloOrigin || event.source !== window.parent || !isHaloMessage(event.data)) return;
    if (event.data.type === HALO_READY) {
      ready = true;
      post(capabilitiesMessage());
      emit({ message: 'HALOとの接続を確認しました。観測完了後に結果を反映できます。' });
    } else if (event.data.measurementId === pendingMeasurementId && event.data.type === MEASUREMENT_ACCEPTED) {
      pendingMeasurementId = null;
      emit({ status: { text: 'HALOへ送信しました。HALO側で内容を確認してください。', type: 'ok' } });
    } else if (event.data.measurementId === pendingMeasurementId && event.data.type === MEASUREMENT_REJECTED) {
      pendingMeasurementId = null;
      emit({ status: { text: 'HALOが観測結果を拒否しました。CSV出力をご利用ください。', type: 'err' } });
    }
  }

  return {
    start() {
      window.addEventListener('message', handleMessage);
      if (!embedded) emit({ message: standaloneMessage });
      else if (!haloOrigin) emit({ message: '許可されていないHALO originです。CSV出力をご利用ください。' });
      else emit({ message: 'HALOからの接続確認を待っています。' });
    },
    sendMeasurement() {
      if (!embedded || !haloOrigin || !ready) return false;
      const measurement = getMeasurement();
      if (!measurement.layers.length) {
        emit({ status: { text: '送信する観測データがありません。', type: 'warn' } });
        return false;
      }
      pendingMeasurementId = window.crypto.randomUUID();
      post({
        source: 'pibal-reader', type: MEASUREMENT_COMPLETED, protocolVersion: PROTOCOL_VERSION,
        measurementId: pendingMeasurementId, observedAt: measurement.observedAt,
        directionConvention: 'from', altitudeUnit: 'm', speedUnit: 'm/s', layers: measurement.layers
      });
      emit({ status: { text: 'HALOへ送信中…', type: 'info' } });
      return true;
    },
    destroy() { window.removeEventListener('message', handleMessage); }
  };
}
