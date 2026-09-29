import crypto from 'crypto';

// Abonarea telefonului unui elev la notificari (apelat prin /api/push):
//   GET  ?a=key          -> cheia publica VAPID (necesara telefonului ca sa se aboneze)
//   POST ?a=subscribe    -> salveaza abonamentul telefonului pentru elevul din token
//   POST ?a=unsubscribe  -> sterge abonamentul (la "Ieși din cont")
// Tabela push_subscriptions nu are nicio regula RLS publica — doar functiile
// de pe server (cu cheia service_role) o pot citi sau scrie.

function base64urlBuffer(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function verifyJWT(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = base64urlBuffer(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch (e) { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function platformOf(ua) {
  const s = String(ua || '');
  if (/iPad/i.test(s) || (/Macintosh/i.test(s) && /Mobile\//i.test(s))) return 'iPad';
  if (/iPhone|iPod/i.test(s)) return 'iPhone';
  if (/Android/i.test(s)) return 'Android';
  if (/Windows/i.test(s)) return 'calculator (Windows)';
  if (/Macintosh/i.test(s)) return 'Mac';
  return 'un dispozitiv';
}

const isB64u =(s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s);

export default async function handler(req, res) {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();

  const action = String((req.query && req.query.a) || '');
  if (action === 'key') {
    if (!publicKey) return res.status(503).json({ error: 'Push not configured' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ publicKey });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const removing = action === 'unsubscribe';

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!SERVICE_KEY || !JWT_SECRET) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyJWT(bearer, JWT_SECRET);
  if (!payload || !payload.student_id) return res.status(401).json({ error: 'Invalid token' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const body = req.body || {};

  try {
    if (removing) {
      const endpoint = String(body.endpoint || '');
      if (!endpoint.startsWith('https://')) return res.status(400).json({ error: 'Invalid endpoint' });
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&student_id=eq.${payload.student_id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      return res.status(200).json({ removed: true });
    }

    const sub = body.subscription || {};
    const endpoint = String(sub.endpoint || '');
    const keys = sub.keys || {};
    if (!endpoint.startsWith('https://') || endpoint.length > 1000) return res.status(400).json({ error: 'Invalid endpoint' });
    if (!isB64u(keys.p256dh, 80, 100) || !isB64u(keys.auth, 16, 30)) return res.status(400).json({ error: 'Invalid keys' });

    // E un dispozitiv nou pentru elevul acesta? (sincronizarea zilnica a
    // aceluiasi telefon NU trebuie sa-l anunte pe profesor din nou)
    let isNewDevice = false;
    try {
      const ex = await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&student_id=eq.${payload.student_id}&select=id`, { headers: sbHeaders });
      if (ex.ok) isNewDevice = (await ex.json()).length === 0;
    } catch (e) {}

    // Daca acelasi telefon era abonat pe alt elev (ex. frati pe acelasi
    // telefon), abonamentul trece pe elevul care e logat acum.
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        student_id: payload.student_id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
        last_seen_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      console.error('push-subscribe: save failed', r.status, await r.text().catch(() => ''));
      return res.status(502).json({ error: 'save_failed' });
    }

    // Profesorul afla (Notificări → Activitate) cand un elev porneste
    // notificarile pe un dispozitiv nou. Asteptam cererea: pe Vercel functia
    // se poate opri imediat dupa raspuns.
    if (isNewDevice) {
      try {
        const [stR, cntR] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}&select=name`, { headers: sbHeaders }),
          fetch(`${SB_URL}/rest/v1/push_subscriptions?student_id=eq.${payload.student_id}&select=id`, { headers: sbHeaders }),
        ]);
        const st = stR.ok ? (await stR.json())[0] : null;
        const devices = cntR.ok ? (await cntR.json()).length : 1;
        const name = (st && st.name) || 'Un elev';
        const extra = devices > 1 ? ` (acum pe ${devices} dispozitive)` : '';
        await fetch(`${SB_URL}/rest/v1/teacher_activity`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            type: 'push_on',
            student_id: payload.student_id,
            message: `${name} a activat notificările pe ${platformOf(req.headers['user-agent'])}${extra}`,
            icon: '🔔',
          }),
        });
      } catch (e) {}
    }
    return res.status(200).json({ saved: true, new_device: isNewDevice });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
