import { HALO_READY, MEASUREMENT_ACCEPTED, MEASUREMENT_REJECTED, PROTOCOL_VERSION } from './halo-message-types.js';

export function normalizeAllowedOrigins(origins) {
  return new Set(origins.flatMap(value => {
    try {
      const url = new URL(value);
      return url.origin === value && ['https:', 'http:'].includes(url.protocol) ? [url.origin] : [];
    } catch {
      return [];
    }
  }));
}

export function requestedHaloOrigin(location, allowedOrigins) {
  const value = new URLSearchParams(location.search).get('haloOrigin');
  return value && allowedOrigins.has(value) ? value : null;
}

export function isHaloMessage(data) {
  return data !== null && typeof data === 'object' && data.source === 'halo' &&
    data.protocolVersion === PROTOCOL_VERSION &&
    [HALO_READY, MEASUREMENT_ACCEPTED, MEASUREMENT_REJECTED].includes(data.type);
}
