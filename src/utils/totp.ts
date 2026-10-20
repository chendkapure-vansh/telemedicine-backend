import crypto from 'crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Generate a cryptographically secure random base32 secret (160 bits / 20 bytes)
export function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20);
  let secret = '';
  for (let i = 0; i < buffer.length; i++) {
    secret += BASE32_CHARS[buffer[i] % 32];
  }
  return secret;
}

// Decode base32 string to Buffer
function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// Generate 6-digit TOTP code for a specific time step (RFC 6238)
export function generateTotpCode(secret: string, timeStep: number): string {
  const key = base32ToBuffer(secret);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

// Verify a 6-digit TOTP code with +-1 time-step window tolerance (30-second steps)
export function verifyTotpCode(secret: string, code: string): boolean {
  if (!code || code.length !== 6) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);

  // Check current step, previous step (-1), and next step (+1) for clock drift
  for (let i = -1; i <= 1; i++) {
    const expected = generateTotpCode(secret, currentStep + i);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return true;
    }
  }

  return false;
}

// Generate standard otpauth URI for authenticator apps (Google / Authy)
export function getTotpUri(secret: string, email: string): string {
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/Telemedicine:${encodedEmail}?secret=${secret}&issuer=Telemedicine&algorithm=SHA1&digits=6&period=30`;
}
