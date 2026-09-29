// Trimiterea notificarilor pe telefon (Web Push), fara nicio librarie externa —
// doar cu modulul "crypto" din Node, ca sa nu depindem de pachete instalate pe
// Vercel. Implementeaza cele doua standarde folosite de toate browserele
// (Chrome/Android, Safari/iPhone, Firefox):
//   - RFC 8291: criptarea mesajului pentru telefonul elevului (aes128gcm)
//   - RFC 8292: VAPID — "semnatura" serverului nostru, ca serviciul de push
//     (Google / Apple / Mozilla) sa stie ca mesajul vine de la noi.
// Fisierul incepe cu "_", deci Vercel NU il transforma intr-un endpoint public;
// e doar importat de celelalte functii din /api.

import crypto from 'crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function vapidAuthHeader(endpoint, subject, publicKey, privateKey) {
  const { protocol, host } = new URL(endpoint);
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({
    aud: `${protocol}//${host}`,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }));
  const unsigned = `${header}.${payload}`;
  const pub = fromB64u(publicKey); // 65 octeti: 0x04 || x || y
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
}

// Cripteaza textul notificarii astfel incat doar telefonul elevului sa-l poata citi.
export function encryptPayload(text, p256dh, auth) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const plaintext = Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export function pushConfig() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'https://primeschool.ro').trim();
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

// Trimite o notificare unui singur dispozitiv. Intoarce { ok, gone }:
// gone=true inseamna ca abonamentul nu mai exista (elevul a dezinstalat
// aplicatia, a oprit notificarile etc.) si trebuie sters din baza de date.
export async function sendPush(sub, message, cfg, ttlSeconds = 12 * 3600) {
  try {
    const body = encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthHeader(sub.endpoint, cfg.subject, cfg.publicKey, cfg.privateKey),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'normal',
      },
      body,
    });
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch (e) {
    return { ok: false, gone: false, status: 0 };
  }
}

// Trimite acelasi mesaj pe toate dispozitivele unui elev (sau mai multor elevi)
// si curata abonamentele expirate.
export async function sendToSubscriptions(subs, message, { SB_URL, sbHeaders, cfg, ttlSeconds }) {
  const results = await Promise.all(subs.map((s) => sendPush(s, message, cfg, ttlSeconds)));
  const goneIds = subs.filter((s, i) => results[i].gone).map((s) => s.id);
  const okIds = subs.filter((s, i) => results[i].ok).map((s) => s.id);
  const writes = [];
  if (goneIds.length) {
    writes.push(fetch(`${SB_URL}/rest/v1/push_subscriptions?id=in.(${goneIds.join(',')})`, {
      method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
    }).catch(() => {}));
  }
  if (okIds.length) {
    writes.push(fetch(`${SB_URL}/rest/v1/push_subscriptions?id=in.(${okIds.join(',')})`, {
      method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
    }).catch(() => {}));
  }
  if (writes.length) await Promise.all(writes);
  return { sent: okIds.length, removed: goneIds.length };
}

// Ora curenta in Romania (0–23), corecta si la ora de vara/iarna.
export function hourRO(date = new Date()) {
  return +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(date) % 24;
}

// Liniste noaptea: intre 22:00 si 07:00 (ora Romaniei) nu trimitem nimic pe
// telefon. Ce apare in intervalul asta se pune la coada (push_queue) si pleaca
// la 07:00 — cand elevii se trezesc pentru scoala (vezi push-morning.js).
export const QUIET_START = 22;
export const QUIET_END = 7;
export function isQuietHoursRO(date = new Date()) {
  const h = hourRO(date);
  return h >= QUIET_START || h < QUIET_END;
}
