import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// At-rest encryption for per-user secrets (currently: DeepSeek API keys).
//
// Algorithm: AES-256-GCM.  Key is derived from SESSION_SECRET via SHA-256
// with domain separation ("deepseek-key-kek").  Ciphertext format:
//     base64url( iv(12) || ciphertext || tag(16) )
//
// Scope: defeats a casual read of `data/users.json`.  Does NOT defeat a root
// attacker on the server (they can read SESSION_SECRET and decrypt).  That's
// the right threat model for a local-only deployment.
// ---------------------------------------------------------------------------

const IV_LEN = 12;
const TAG_LEN = 16;

function kek(): Buffer {
  const secret = process.env['SESSION_SECRET'];
  if (!secret) {
    // Use the same dev fallback as session-cookie.ts so the behavior is
    // consistent.  Warn once.
    if (!process.env['__COC_KEK_WARNED']) {
      process.env['__COC_KEK_WARNED'] = '1';
      // eslint-disable-next-line no-console
      console.warn('[crypto] SESSION_SECRET not set; using insecure dev KEK');
    }
    return createHash('sha256')
      .update('insecure-dev-secret-change-me-in-production-please::deepseek-key-kek')
      .digest();
  }
  return createHash('sha256').update(secret + '::deepseek-key-kek').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', kek(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64url');
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, 'base64url');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const d = createDecipheriv('aes-256-gcm', kek(), iv);
  d.setAuthTag(tag);
  const pt = Buffer.concat([d.update(ct), d.final()]);
  return pt.toString('utf8');
}
