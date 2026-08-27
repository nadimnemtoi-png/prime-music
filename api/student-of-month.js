import crypto from 'crypto';

// ── Config ──
const TZ = 'Europe/Bucharest';
const WINDOW_DAYS = 3; // titlul e vizibil in primele 3 zile ale lunii noi

// ── JWT (aceeasi semnatura ca in student-login.js) ──
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

// ── Timp local (Romania), ca luna sa se incheie fix la 00:00 ora locala ──
function tzOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}
function localParts(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: (+p.hour) % 24 };
}
// Miezul noptii local -> instant UTC (ISO), corectat pentru ora de vara
function localMidnightISO(year, month, day) {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utc = naive;
  for (let i = 0; i < 2; i++) utc = naive - tzOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!SERVICE_KEY || !JWT_SECRET) return res.status(500).json({ error: 'Server not configured' });

  const body = req.body || {};
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyJWT(body.token || bearer, JWT_SECRET);
  if (!payload || !payload.student_id) return res.status(401).json({ error: 'Invalid token' });

  const now = new Date();
  const L = localParts(now);

  // Luna incheiata = luna precedenta celei curente (competitia s-a inchis la 00:00, ziua 1)
  const prevMonth = L.month === 1 ? 12 : L.month - 1;
  const prevYear = L.month === 1 ? L.year - 1 : L.year;

  // Fereastra: primele WINDOW_DAYS zile ale lunii noi
  if (L.day > WINDOW_DAYS) {
    return res.status(200).json({ active: false, reason: 'window_closed' });
  }

  const startISO = localMidnightISO(prevYear, prevMonth, 1);
  const endISO = localMidnightISO(L.year, L.month, 1); // exclusiv: fix 00:00 in prima zi a lunii noi
  const startDate = startISO.slice(0, 10);
  const endDate = new Date(new Date(endISO).getTime() - 1000).toISOString().slice(0, 10);

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const get = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    return r.json();
  };

  try {
    const [practices, scores, students] = await Promise.all([
      get(`practices?week_start=gte.${startDate}&week_start=lte.${endDate}&select=student_id,xp_rating,type`),
      get(`game_scores?played_at=gte.${startISO}&played_at=lt.${endISO}&select=student_id,xp_gained`),
      get(`students?archived=is.false&select=id,name`),
    ]);

    const activeIds = new Set(students.map(s => s.id));
    const rep = {}, game = {}, clips = {};

    (practices || []).forEach(p => {
      if (!activeIds.has(p.student_id)) return;
      if (p.xp_rating > 0) rep[p.student_id] = (rep[p.student_id] || 0) + p.xp_rating;
      if (p.type === 'clip') clips[p.student_id] = (clips[p.student_id] || 0) + 1;
    });
    (scores || []).forEach(g => {
      if (!activeIds.has(g.student_id)) return;
      game[g.student_id] = (game[g.student_id] || 0) + (g.xp_gained || 0);
    });

    const ranked = [...new Set([...Object.keys(rep), ...Object.keys(game)])]
      .map(id => ({
        id,
        xpRep: rep[id] || 0,
        xpGame: game[id] || 0,
        xp: (rep[id] || 0) + (game[id] || 0),
        clips: clips[id] || 0,
      }))
      .filter(x => x.xp > 0)
      .sort((a, b) => b.xp - a.xp);

    const monthLabel = `${MONTHS[prevMonth - 1]} ${prevYear}`;
    const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    if (!ranked.length) {
      return res.status(200).json({ active: false, reason: 'no_winner', month: monthKey, monthLabel });
    }

    const winner = ranked[0];
    const isWinner = winner.id === payload.student_id;

    // Nu expunem numele sau punctajul altui elev.
    return res.status(200).json({
      active: isWinner,
      isWinner,
      month: monthKey,
      monthLabel,
      daysLeft: Math.max(0, WINDOW_DAYS - L.day + 1),
      ...(isWinner ? { xp: winner.xp, xpRep: winner.xpRep, xpGame: winner.xpGame, clips: winner.clips } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
