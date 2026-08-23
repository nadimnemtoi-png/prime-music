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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password, magic_token } = req.body || {};

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

  if (!SERVICE_KEY || !JWT_SECRET) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  let query;
  if (magic_token) {
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
