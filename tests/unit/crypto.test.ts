import assert from 'assert';
import { encryptPHI, decryptPHI } from '../../src/utils/crypto';

export async function runCryptoTests(): Promise<void> {
  console.log('  [TEST] Running AES-256-GCM Field-Level PHI Encryption tests...');

  // 1. Valid roundtrip encryption & decryption
  const secretData = 'Patient has a history of asthma and mild hypertension.';
  const encrypted = encryptPHI(secretData);

  assert.ok(encrypted.startsWith('v1:'), 'Ciphertext envelope must start with active key version prefix "v1:"');
  const parts = encrypted.split(':');
  assert.strictEqual(parts.length, 4, 'Ciphertext envelope must contain exactly 4 segments: version:iv:tag:ciphertext');

  const decrypted = decryptPHI(encrypted);
  assert.strictEqual(decrypted, secretData, 'Decrypted payload must match original plaintext exactly');

  // 2. Ciphertext tampering detection
  const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}aa`;
  assert.throws(
    () => decryptPHI(tamperedCiphertext),
    /Unsupported state or unable to authenticate data|bad decrypt/i,
    'Decryption must fail with an authentication error when ciphertext is tampered with'
  );

  // 3. Auth tag tampering detection
  const tamperedTag = `${parts[0]}:${parts[1]}:00112233445566778899aabbccddeeff:${parts[3]}`;
  assert.throws(
    () => decryptPHI(tamperedTag),
    /Unsupported state or unable to authenticate data|bad decrypt/i,
    'Decryption must fail with an authentication error when auth tag is tampered with'
  );

  // 4. Invalid envelope format rejection
  assert.throws(
    () => decryptPHI('invalid_envelope_format'),
    /Invalid ciphertext envelope format/,
    'Decryption must reject malformed envelope formats'
  );

  console.log('  [PASS] AES-256-GCM PHI tests passed (4/4 assertions)');
}
