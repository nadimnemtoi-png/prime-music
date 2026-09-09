import crypto from 'crypto';

// ── JWT (aceeasi verificare ca in add-xp.js / student-of-month.js) ──
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

// La fiecare 7 zile de streak la rand (jucat un joc SAU trimis o inregistrare),
// elevul primeste un bonus de monede, care CRESTE la fiecare prag: 7 zile = 20,
// 14 zile = 25, 21 zile = 30, 28 zile = 35, si tot asa (+STREAK_INCREMENT la
// fiecare 7 zile). Se acorda o singura data per prag, verificat mereu
// server-side — clientul nu poate cere de doua ori acelasi bonus.
const STREAK_BASE_COINS = 20;
const STREAK_INCREMENT = 5;

// ── Ziua locala (Romania), ca streak-ul sa se calculeze pe zile calendaristice
// din perspectiva Romaniei, nu din UTC ──
const TZ = 'Europe/Bucharest';
function ymdInTZ(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(date);
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
    // Recalculam streak-ul din sursele reale (practice_logs + game_scores) —
    // nu avem niciodata incredere in streak-ul calculat de telefonul elevului.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const [prRes, gsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/practice_logs?student_id=eq.${payload.student_id}&select=created_at&created_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&select=played_at&played_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
    ]);
    if (!prRes.ok || !gsRes.ok) {
      console.error('streak-bonus: Supabase query failed', prRes.status, gsRes.status);
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const prRows = await prRes.json();
    const gsRows = await gsRes.json();

    const daySet = new Set();
    prRows.forEach(p => { if (p.created_at) daySet.add(ymdInTZ(new Date(p.created_at))); });
    gsRows.forEach(g => { if (g.played_at) daySet.add(ymdInTZ(new Date(g.played_at))); });

    let curStreak = 0;
    {
      let cursor = new Date();
      let cursorYmd = ymdInTZ(cursor);
      if (!daySet.has(cursorYmd)) {
        cursor = new Date(cursor.getTime() - 24 * 3600 * 1000);
        cursorYmd = ymdInTZ(cursor);
      }
      while (daySet.has(cursorYmd)) {
        curStreak++;
        cursor = new Date(cursor.getTime() - 24 * 3600 * 1000);
        cursorYmd = ymdInTZ(cursor);
      }
    }

    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/award_streak_coins`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        p_student_id: payload.student_id,
        p_current_streak: curStreak,
        p_base_coins: STREAK_BASE_COINS,
        p_increment: STREAK_INCREMENT,
      }),
    });
    if (!rpcRes.ok) {
      console.error('streak-bonus: award_streak_coins failed', rpcRes.status, await rpcRes.text().catch(() => ''));
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const rpcRows = await rpcRes.json();
    const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const awarded = result?.awarded || 0;

    if (awarded > 0) {
      // Notificare pentru elev — de ce a primit monedele, nu doar ca le-a primit.
      fetch(`${SB_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          student_id: payload.student_id,
          title: `🪙 Ai primit ${awarded} monede!`,
          message: `Pentru streak-ul tău de ${curStreak} zile la rând!`,
          icon: '🔥',
        }),
      }).catch(() => {});
    }

    return res.status(200).json({ streak: curStreak, awarded, newCoins: result?.new_coins ?? 0 });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
