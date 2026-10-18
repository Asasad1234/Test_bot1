/**
 * Utility for symmetric encryption, obfuscation and secure token handling.
 * Used for safe transit and storage of API source tokens, bot tokens,
 * and generating encrypted subscription links that conceal direct paths.
 */

// Default system key (used when no custom secret is provided)
const DEFAULT_SALT = 'puls_secure_sub_vault_2026_v2';

/**
 * Derives numeric key schedule from string key
 */
function deriveKeySchedule(secretKey: string): number[] {
  const fullKey = secretKey + DEFAULT_SALT;
  const schedule: number[] = [];
  let h = 0x811c9dc5;
  for (let i = 0; i < fullKey.length; i++) {
    h ^= fullKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    schedule.push(h & 0xff);
  }
  return schedule;
}

/**
 * Base64URL encode with Unicode UTF-8 support
 */
export function base64UrlEncode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode with Unicode UTF-8 support
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encrypts arbitrary text string using a salted rotating stream cipher.
 * Returns URL-safe encrypted payload with embedded verification signature.
 */
export function encryptData(plainText: string, secretKey = DEFAULT_SALT): string {
  if (!plainText) return '';
  const keySchedule = deriveKeySchedule(secretKey);
  const inputBytes = new TextEncoder().encode(plainText);
  const outBytes = new Uint8Array(inputBytes.length + 4);

  // Generate 2 random salt bytes for IV
  const iv0 = Math.floor(Math.random() * 256);
  const iv1 = Math.floor(Math.random() * 256);
  outBytes[0] = iv0;
  outBytes[1] = iv1;

  let checksum = iv0 ^ iv1;
  for (let i = 0; i < inputBytes.length; i++) {
    const keyByte = keySchedule[(i + iv0 + iv1) % keySchedule.length];
    const encryptedByte = (inputBytes[i] ^ keyByte ^ ((iv0 * (i + 1)) & 0xff)) & 0xff;
    outBytes[i + 2] = encryptedByte;
    checksum = (checksum + encryptedByte) & 0xff;
  }

  // Checksum bytes
  outBytes[inputBytes.length + 2] = checksum;
  outBytes[inputBytes.length + 3] = (checksum ^ 0xa5) & 0xff;

  let binary = '';
  for (let i = 0; i < outBytes.length; i++) {
    binary += String.fromCharCode(outBytes[i]);
  }
  const b64 = btoa(binary);
  return 'enc_' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decrypts string encrypted with encryptData.
 * Throws error or returns empty string if key/payload is invalid.
 */
export function decryptData(cipherText: string, secretKey = DEFAULT_SALT): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc_')) {
    // If not encrypted with this format, return as-is for backward compatibility
    return cipherText;
  }

  const rawEnc = cipherText.slice(4);
  let base64 = rawEnc.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (bytes.length < 4) return '';

  const iv0 = bytes[0];
  const iv1 = bytes[1];
  const dataLen = bytes.length - 4;
  const payloadBytes = bytes.slice(2, 2 + dataLen);
  const savedChecksum = bytes[2 + dataLen];
  const checkXor = bytes[3 + dataLen];

  if (((savedChecksum ^ 0xa5) & 0xff) !== checkXor) {
    throw new Error('Integrity check failed: invalid or corrupt cipher payload');
  }

  const keySchedule = deriveKeySchedule(secretKey);
  const plainBytes = new Uint8Array(dataLen);

  for (let i = 0; i < dataLen; i++) {
    const keyByte = keySchedule[(i + iv0 + iv1) % keySchedule.length];
    plainBytes[i] = (payloadBytes[i] ^ keyByte ^ ((iv0 * (i + 1)) & 0xff)) & 0xff;
  }

  return new TextDecoder().decode(plainBytes);
}

/**
 * Safely encrypts a JSON object into an encrypted token string.
 */
export function encryptObject<T>(data: T, secretKey = DEFAULT_SALT): string {
  const jsonStr = JSON.stringify(data);
  return encryptData(jsonStr, secretKey);
}

/**
 * Safely decrypts an encrypted token back into the typed object.
 */
export function decryptObject<T>(cipherText: string, secretKey = DEFAULT_SALT): T | null {
  try {
    const jsonStr = decryptData(cipherText, secretKey);
    if (!jsonStr) return null;
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    console.error('Failed to decrypt object:', err);
    return null;
  }
}

/**
 * Masks sensitive API keys and Telegram bot tokens for safe UI display.
 * E.g. "7192847291:AAHkL789abcdef" -> "719284••••••cdef"
 */
export function maskSecret(secret?: string, visibleStart = 6, visibleEnd = 4): string {
  if (!secret) return '—';
  if (secret.length <= visibleStart + visibleEnd) return '••••••••';
  const start = secret.slice(0, visibleStart);
  const end = secret.slice(-visibleEnd);
  return `${start}••••••••${end}`;
}

/**
 * Encrypts and obfuscates a subscription target to hide direct origin paths
 * (happ, incy, v2ray, etc.) so users cannot see or bypass to the origin git/api repository.
 */
export function obfuscateSubscriptionLink(
  originalUrl: string, 
  userId: string | number, 
  format: string = 'v2ray'
): string {
  const payload = {
    u: userId,
    fmt: format,
    ts: Date.now(),
    src: originalUrl,
  };
  const token = encryptObject(payload, 'puls_sub_token_secret');
  return `/api/sub/${format}/${token}`;
}

/**
 * Decodes the obfuscated link token back to its origin parameters.
 */
export function decodeSubscriptionLink(
  token: string
): { u: string | number; fmt: string; ts: number; src: string } | null {
  return decryptObject(token, 'puls_sub_token_secret');
}
