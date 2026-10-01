// randomUUIDが使えない環境でも、暗号学的乱数でUUID v4を生成する。
export function createMeasurementId(crypto) {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('ブラウザの乱数機能が利用できません。');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
  return [hexadecimal.slice(0, 4), hexadecimal.slice(4, 6), hexadecimal.slice(6, 8),
    hexadecimal.slice(8, 10), hexadecimal.slice(10)].map(part => part.join('')).join('-');
}
