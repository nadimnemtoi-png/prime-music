import crypto from 'crypto';

// ── SPIN-ul se deblocheaza abia dupa ce elevul a castigat azi cel putin 50 XP din
// jocuri (ora Romaniei) — ca sa nu intre doar pentru roata, fara sa exerseze.
const SPIN_XP_NEEDED = 50;
const TZ = 'Europe/Bucharest';
function tzOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}
function todayStartISO() {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(new Date()).map(x => [x.type, x.value]));
  const naive = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  let utc = naive;
  for (let i = 0; i < 2; i++) utc = naive - tzOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

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
    // Conditia de deblocare: XP din jocuri azi
    let xpToday = 0;
    try {
      const gs = await fetch(`${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&played_at=gte.${encodeURIComponent(todayStartISO())}&select=xp_gained&limit=1000`, { headers: sbHeaders });
      const rows = gs.ok ? await gs.json() : [];
      if (Array.isArray(rows)) xpToday = rows.reduce((a, r) => a + (r.xp_gained || 0), 0);
    } catch (e) { xpToday = 0; }
    if (xpToday < SPIN_XP_NEEDED) {
      return res.status(200).json({
        success: false,
        locked: true,
        xpToday,
        needed: SPIN_XP_NEEDED,
        message: `Mai joacă puțin: SPIN-ul se deblochează după ${SPIN_XP_NEEDED} XP din jocuri azi (ai ${xpToday}).`,
      });
    }

    // Premiul e ales integral in baza de date (do_daily_spin), niciodata pe client.
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/do_daily_spin`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ p_student_id: payload.student_id }),
    });
    if (!rpcRes.ok) {
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const rpcRows = await rpcRes.json();
    const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

    if (!result?.success) {
      return res.status(200).json({
        success: false,
        message: result?.message || 'Nu s-a putut roti',
        newCoins: result?.new_coins ?? 0,
        newFreezeCount: result?.new_freeze_count ?? 0,
      });
    }

    const outcomeType = result.outcome_type;
    const amount = result.amount || 0;

    if (outcomeType === 'coin' || outcomeType === 'freeze') {
      // Numele elevului e nevoie doar pentru mesajul catre profesor.
      const nameRes = await fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}&select=name`, { headers: sbHeaders }).catch(() => null);
      const nameRows = nameRes && nameRes.ok ? await nameRes.json().catch(() => []) : [];
      const studentName = (Array.isArray(nameRows) && nameRows[0] && nameRows[0].name) || 'Un elev';

      // Important: AsteptAm (await) aceste cereri inainte sa raspundem — pe
      // Vercel, functia se poate "inghesa"/opri chiar dupa ce trimitem
      // raspunsul, iar cererile pornite dar neasteptate ("fire and forget")
      // pot sa nu mai apuce sa ajunga la Supabase. De-aia notificarea catre
      // profesor lipsea uneori.
      if (outcomeType === 'coin') {
        await Promise.all([
          fetch(`${SB_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              student_id: payload.student_id,
              title: `🎡 Ai câștigat ${amount} ${amount === 1 ? 'monedă' : 'monede'} la SPIN!`,
              message: 'Continuă și mâine pentru un SPIN nou.',
              icon: '🪙',
            }),
          }).catch(() => {}),
        ]);
      } else if (outcomeType === 'freeze') {
        await Promise.all([
          fetch(`${SB_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              student_id: payload.student_id,
              title: '🎡 Ai câștigat un Freeze la SPIN!',
              message: 'Îl poți folosi ca să-ți salvezi streak-ul într-o zi liberă.',
              icon: '❄️',
            }),
          }).catch(() => {}),
        ]);
      }
    }

    return res.status(200).json({
      success: true,
      outcomeType,
      amount,
      subIndex: result.sub_index || 0,
      newCoins: result.new_coins ?? 0,
      newFreezeCount: result.new_freeze_count ?? 0,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
