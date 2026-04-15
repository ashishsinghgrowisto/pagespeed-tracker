/**
 * HS256 JWT auth using Web Crypto API.
 * No external dependencies — works natively in Cloudflare Workers.
 */

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function objB64url(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function generateToken(payload, secret) {
  const header = objB64url({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = objB64url({ ...payload, iat: now, exp: now + 86400 }); // 24 h
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

/**
 * Verifies a Bearer JWT from the Authorization header.
 * Returns the decoded payload on success, null on failure.
 */
export async function verifyToken(request, secret) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  try {
    const key = await getHmacKey(secret);
    const sigBytes = Uint8Array.from(fromB64url(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes, new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;
    const payload = JSON.parse(fromB64url(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
