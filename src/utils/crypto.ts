import crypto from 'crypto';
import { env } from '../config/env';

// Return the 32-byte Buffer for a given key version
function getKeyForVersion(version: string): Buffer {
  if (version === 'v1') {
    return Buffer.from(env.PHI_ENCRYPTION_KEY_V1, 'hex');
  }
  throw new Error(`Unsupported PHI encryption key version: ${version}`);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: v<version>:<hex(iv)>:<hex(authTag)>:<hex(ciphertext)>
 */
export function encryptPHI(plaintext: string): string {
  if (!plaintext) return plaintext;

  const version = env.ACTIVE_PHI_KEY_VERSION;
  const key = getKeyForVersion(version);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${version}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext envelope.
 * Input format: v<version>:<hex(iv)>:<hex(authTag)>:<hex(ciphertext)>
 */
export function decryptPHI(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    // If not in envelope format, return raw string
    return ciphertext;
  }

  const [version, ivHex, authTagHex, encryptedHex] = parts;
  const key = getKeyForVersion(version);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
