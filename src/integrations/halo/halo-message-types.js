export const PROTOCOL_VERSION = 1;
export const PIBAL_REQUEST = 'pibal.integration.request';
export const HALO_READY = 'pibal.integration.ready';
export const PIBAL_CAPABILITIES = 'pibal.integration.capabilities';
export const MEASUREMENT_COMPLETED = 'pibal.measurement.completed';
export const MEASUREMENT_ACCEPTED = 'pibal.measurement.accepted';
export const MEASUREMENT_REJECTED = 'pibal.measurement.rejected';

export function capabilitiesMessage() {
  return {
    source: 'pibal-reader',
    type: PIBAL_CAPABILITIES,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ['measurement.completed']
  };
}
