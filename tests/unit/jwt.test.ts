import assert from 'assert';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/utils/jwt';

export async function runJwtTests(): Promise<void> {
  console.log('  [TEST] Running JWT Token Lifecycle & Security Pinning tests...');

  const userId = '11111111-2222-3333-4444-555555555555';
  const email = 'patient@telemedicine.internal';

  // 1. Access token generation & verification
  const accessToken = generateAccessToken({
    sub: userId,
    email,
    role: 'PATIENT',
    mfa_enabled: false,
  });
  assert.ok(typeof accessToken === 'string' && accessToken.length > 20, 'Access token must be a signed string');

  const decodedAccess = verifyAccessToken(accessToken);
  assert.strictEqual(decodedAccess.sub, userId, 'Decoded access token sub must match user ID');
  assert.strictEqual(decodedAccess.role, 'PATIENT', 'Decoded role must match PATIENT');
  assert.strictEqual(decodedAccess.type, 'access', 'Access token must carry type claim "access"');

  // 2. Refresh token generation & verification
  const refreshToken = generateRefreshToken(userId);
  assert.ok(typeof refreshToken === 'string' && refreshToken.length > 20, 'Refresh token must be a signed string');

  const decodedRefresh = verifyRefreshToken(refreshToken);
  assert.strictEqual(decodedRefresh.sub, userId, 'Decoded refresh token sub must match user ID');
  assert.strictEqual(decodedRefresh.type, 'refresh', 'Refresh token must carry type claim "refresh"');

  // 3. Token confusion rejection (Access token presented as Refresh token)
  assert.throws(
    () => verifyRefreshToken(accessToken),
    /invalid signature|Invalid token type|jwt/i,
    'Presenting an access token as a refresh token must be rejected'
  );

  // 4. Token confusion rejection (Refresh token presented as Access token)
  assert.throws(
    () => verifyAccessToken(refreshToken),
    /invalid signature|Invalid token type|jwt/i,
    'Presenting a refresh token as an access token must be rejected'
  );

  // 5. Tampered signature rejection
  const tamperedToken = accessToken.slice(0, -5) + 'xxxxx';
  assert.throws(
    () => verifyAccessToken(tamperedToken),
    /invalid signature|jwt/i,
    'Tampered signature must be rejected'
  );

  console.log('  [PASS] JWT Token tests passed (5/5 assertions)');
}
