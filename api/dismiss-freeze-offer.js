import crypto from 'crypto';

function base64urlBuffer(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function verifyJWT(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = base64urlBuffer(
    crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest()
  );
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

const TZ = 'Europe/Bucharest';
function ymdInTZ(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(date);
}
function addDaysYmd(ymd, days) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!SERVICE_KEY || !JWT_SECRET) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyJWT(bearer, JWT_SECRET);
  if (!payload || !payload.student_id) return res.status(401).json({ error: 'Invalid token' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    // Recalculam noi "ultima zi acoperita", nu avem incredere in ce trimite clientul.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const [prRes, gsRes, fzRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/practice_logs?student_id=eq.${payload.student_id}&select=created_at&created_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&select=played_at&played_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/streak_freezes?student_id=eq.${payload.student_id}&select=date`, { headers: sbHeaders }),
    ]);
    if (!prRes.ok || !gsRes.ok || !fzRes.ok) {
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const prRows = await prRes.json();
    const gsRows = await gsRes.json();
    const fzRows = await fzRes.json();

    const daySet = new Set();
    prRows.forEach(p => { if (p.created_at) daySet.add(ymdInTZ(new Date(p.created_at))); });
    gsRows.forEach(g => { if (g.played_at) daySet.add(ymdInTZ(new Date(g.played_at))); });
    fzRows.forEach(f => { if (f.date) daySet.add(f.date); });

    const todayYmd = ymdInTZ(new Date());
    let lastCoveredDay = null;
    {
      let cursorYmd = todayYmd;
      if (!daySet.has(cursorYmd)) cursorYmd = addDaysYmd(cursorYmd, -1);
      while (daySet.has(cursorYmd)) {
        lastCoveredDay = cursorYmd;
        cursorYmd = addDaysYmd(cursorYmd, -1);
      }
    }

    const patchRes = await fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ freeze_offer_dismissed_for_day: lastCoveredDay }),
    });
    if (!patchRes.ok) {
      return res.status(502).json({ error: 'Supabase request failed' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
