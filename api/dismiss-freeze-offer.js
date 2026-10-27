import crypto from 'crypto';

// Supabase intoarce cel mult 1000 de randuri pe cerere. Un elev care joaca mult
// (180+ jocuri pe zi) depaseste usor limita in 90 de zile, iar zilele mai vechi
// ar lipsi din streak. Citim pe pagini, cele mai noi primele.
async function pagedFetch(url, headers) {
  let rows = [];
  for (let off = 0; off < 50000; off += 1000) {
    const r = await fetch(`${url}&order=played_at.desc&limit=1000&offset=${off}`, { headers });
    if (!r.ok) return { ok: false, status: r.status, json: async () => [] };
    const page = await r.json();
    rows = rows.concat(page);
    if (page.length < 1000) break;
  }
  return { ok: true, status: 200, json: async () => rows };
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
      pagedFetch(`${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&select=played_at&played_at=gte.${since.toISOString()}`, sbHeaders),
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
    // Cea mai recenta zi acoperita, INDIFERENT daca lantul curent e intrerupt
    // intre ea si azi — vezi acelasi bug/fix in api/streak-bonus.js
    // (mostRecentCoveredDay) si api/use-freeze.js: bucla veche se oprea la
    // prima zi neacoperita pornind de la azi, deci intr-un gap vechi (streak
    // deja pierdut, exact cazul in care se respinge oferta) intorcea mereu
    // null — PATCH-ul salva freeze_offer_dismissed_for_day=null, deci
    // respingerea nu tinea minte nimic si oferta reaparea la fiecare
    // deschidere a aplicatiei.
    let lastCoveredDay = null;
    {
      let cursorYmd = todayYmd;
      for (let i = 0; i < 90; i++) {
        if (daySet.has(cursorYmd)) { lastCoveredDay = cursorYmd; break; }
        cursorYmd = addDaysYmd(cursorYmd, -1);
      }
    }
    // Ziua de dinaintea pauzei: dacă elevul a jucat deja AZI (dar nu și ieri), pauza e
    // între ultima zi acoperită de dinainte de azi și azi. Înainte, după prima activitate
    // de azi pauza nu mai era văzută deloc — elevul care intra direct într-un joc pierdea
    // seria fără să fie întrebat de Freeze (ex. Levi Grosu, 27.10.2026).
    if (lastCoveredDay === todayYmd && !daySet.has(addDaysYmd(todayYmd, -1))) {
      lastCoveredDay = null;
      let c = addDaysYmd(todayYmd, -2);
      for (let i = 0; i < 90; i++) { if (daySet.has(c)) { lastCoveredDay = c; break; } c = addDaysYmd(c, -1); }
    }

    // „Salvează seria mai târziu”: ținem minte zilele ratate (de după ultima zi
    // acoperită până ieri) și termenul (sfârșitul zilei de mâine). DOAR dacă în
    // acest moment elevul are destule Freeze-uri pentru toată pauza — Freeze-urile
    // câștigate după ce a pierdut seria nu mai pot acoperi pauza asta.
    const yesterdayYmd = addDaysYmd(todayYmd, -1);
    const gapDates = [];
    if (lastCoveredDay && lastCoveredDay < yesterdayYmd) {
      let d = addDaysYmd(lastCoveredDay, 1);
      while (d <= yesterdayYmd) { gapDates.push(d); d = addDaysYmd(d, 1); }
    }
    let freezeCount = 0;
    try {
      const sRes = await fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}&select=freeze_count`, { headers: sbHeaders });
      const sRows = await sRes.json();
      freezeCount = (Array.isArray(sRows) && sRows[0] && sRows[0].freeze_count) || 0;
    } catch (e) { /* fara info -> fara salvare ulterioara */ }
    const canRescue = gapDates.length > 0 && freezeCount >= gapDates.length;

    const patchRes = await fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        freeze_offer_dismissed_for_day: lastCoveredDay,
        freeze_rescue_dates: canRescue ? gapDates : null,
        freeze_rescue_until: canRescue ? addDaysYmd(todayYmd, 1) : null,
      }),
    });
    if (!patchRes.ok) {
      return res.status(502).json({ error: 'Supabase request failed' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
