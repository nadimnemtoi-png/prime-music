import crypto from 'crypto';

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64urlBuffer(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const signature = crypto.createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${base64urlBuffer(signature)}`;
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // refresh:true -> reinnoire: elevul trimite tokenul lui (inca valabil) si
  // primeste unul nou, valabil inca 30 de zile. Aplicatia face asta singura,
  // o data pe zi, ca elevii care o folosesc sa nu mai fie scosi din cont.
  const { username, password, magic_token, refresh } = req.body || {};

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || '').trim();

  if (!SERVICE_KEY || !JWT_SECRET) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  let query;
  if (refresh) {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const current = verifyJWT(bearer, JWT_SECRET);
    if (!current || !current.student_id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    query = `${SB_URL}/rest/v1/students?id=eq.${encodeURIComponent(current.student_id)}&archived=is.false&select=id,name,access_blocked`;
  } else if (magic_token) {
    query = `${SB_URL}/rest/v1/students?magic_token=eq.${encodeURIComponent(magic_token)}&archived=is.false&select=id,name`;
  } else if (username && password) {
    query = `${SB_URL}/rest/v1/students?username=eq.${encodeURIComponent(username)}&elev_password=eq.${encodeURIComponent(password)}&archived=is.false&select=id,name`;
  } else {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try{
    const r = await fetch(query, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    const rows = await r.json();

    if (!Array.isArray(rows) || !rows[0]) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const student = rows[0];
    if (refresh && student.access_blocked) {
      return res.status(403).json({ error: 'Access blocked' });
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      role: 'authenticated',
      student_id: student.id,
      aud: 'authenticated',
      iat: now,
      exp: now + 60 * 60 * 24 * 30, // 30 zile
    };
    const token = signJWT(payload, JWT_SECRET);

    return res.status(200).json({ token, student: { id: student.id, name: student.name } });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
