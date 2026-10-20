import assert from 'assert';
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  getTotpUri,
} from '../../src/utils/totp';

export async function runTotpTests(): Promise<void> {
  console.log('  [TEST] Running RFC 6238 TOTP MFA tests...');

  // 1. Secret generation
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16, 'Generated Base32 secret must be at least 16 characters long');
  assert.match(secret, /^[A-Z2-7]+$/, 'Secret must contain only valid RFC 3548 Base32 characters');

  // 2. Code generation
  const currentCounter = Math.floor(Date.now() / 30000);
  const code = generateTotpCode(secret, currentCounter);
  assert.strictEqual(code.length, 6, 'Generated TOTP code must be exactly 6 digits');
  assert.match(code, /^\d{6}$/, 'TOTP code must be strictly numeric');

  // 3. Verification of current code
  const isValid = verifyTotpCode(secret, code);
  assert.strictEqual(isValid, true, 'Current valid TOTP code must pass verification');

  // 4. Verification with +-1 drift window tolerance
  const pastCode = generateTotpCode(secret, currentCounter - 1);
  assert.strictEqual(verifyTotpCode(secret, pastCode), true, 'Code from -30s window must pass verification');

  const futureCode = generateTotpCode(secret, currentCounter + 1);
  assert.strictEqual(verifyTotpCode(secret, futureCode), true, 'Code from +30s window must pass verification');

  // 5. Rejection of invalid codes
  assert.strictEqual(verifyTotpCode(secret, '000000' === code ? '999999' : '000000'), false, 'Wrong code must be rejected');
  assert.strictEqual(verifyTotpCode(secret, '123'), false, 'Malformed short code must be rejected');

  // 6. OTPAuth URI formatting
  const uri = getTotpUri(secret, 'doctor@telemedicine.internal');
  assert.ok(uri.startsWith('otpauth://totp/'), 'URI must begin with otpauth scheme');
  assert.ok(uri.includes(secret), 'URI must encode secret');
  assert.ok(uri.includes('issuer=Telemedicine'), 'URI must include platform issuer');

  console.log('  [PASS] RFC 6238 TOTP MFA tests passed (6/6 assertions)');
}
