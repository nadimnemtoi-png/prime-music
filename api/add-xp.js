import crypto from 'crypto';

// ── JWT (aceeasi verificare ca in student-of-month.js / student-login.js) ──
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

// XP-ul maxim per joc e fix, stabilit de server — clientul nu poate cere mai mult.
const MAX_XP_PER_GAME = 15;
const ALLOWED_GAMES = new Set(['durate', 'ritm', 'siruri', 'acorduri', 'tab', 'note']);
const MAX_ATTEMPTS = 300; // limita de bun-simt, ca sa nu se poata trimite numere absurde

function currentXpPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Plafon zilnic de XP din jocuri, in functie de XP-ul total deja acumulat —
// elevii de la inceput progreseaza mai repede, cei ajunsi sus mai incet.
function dailyCapFor(totalGameXp) {
  if (totalGameXp < 4000) return 500;
  if (totalGameXp < 10000) return 200;
  return 100;
}

// ── Ziua locala (Romania), ca plafonul sa se resetteze la miezul noptii local ──
const TZ = 'Europe/Bucharest';
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
function localMidnightISO(year, month, day) {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utc = naive;
  for (let i = 0; i < 2; i++) utc = naive - tzOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc).toISOString();
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

  const body = req.body || {};
  const gameType = String(body.gameType || '');
  const correct = Math.max(0, Math.min(MAX_ATTEMPTS, parseInt(body.correct, 10) || 0));
  const wrong = Math.max(0, Math.min(MAX_ATTEMPTS, parseInt(body.wrong, 10) || 0));
  const durationSec = Math.max(0, Math.min(3600 * 4, parseInt(body.durationSec, 10) || 0));

  if (!ALLOWED_GAMES.has(gameType)) return res.status(400).json({ error: 'Invalid game type' });

  const total = correct + wrong;
  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    // Citim elevul direct din baza de date, in acest moment — niciodata nu avem
    // incredere in XP-ul trimis de pe telefonul/calculatorul elevului.
    const sRes = await fetch(
      `${SB_URL}/rest/v1/students?id=eq.${payload.student_id}&archived=is.false&select=id,game_xp,monthly_xp,xp_period,access_blocked`,
      { headers: sbHeaders }
    );
    if (!sRes.ok) {
      // Nu confundam "elevul nu exista" cu "Supabase a refuzat cererea" (ex. cheie
      // service_role gresita/expirata) — altfel eroarea reala ramane ascunsa.
      const errText = await sRes.text().catch(() => '');
      console.error('add-xp: Supabase students query failed', sRes.status, errText);
      // TEMPORAR: trimitem si textul erorii catre client, ca sa vedem exact ce spune
      // Supabase, fara sa fie nevoie sa ne uitam in log-urile Vercel. Se scoate dupa.
      return res.status(502).json({ error: 'Supabase request failed', supabaseStatus: sRes.status, supabaseError: errText.slice(0, 500), studentIdSeen: payload.student_id });
    }
    const rows = await sRes.json();
    const student = Array.isArray(rows) && rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.access_blocked) return res.status(403).json({ error: 'Access blocked' });

    if (total <= 0) {
      return res.status(200).json({ xpGained: 0, newXp: student.game_xp || 0, monthlyXp: student.monthly_xp || 0 });
    }

    const rawXpGained = Math.round(MAX_XP_PER_GAME * (correct / total));

    // Plafon zilnic — vedem cat a mai castigat elevul azi (ora Romaniei) din jocuri
    const now = new Date();
    const L = localParts(now);
    const todayStartISO = localMidnightISO(L.year, L.month, L.day);
    const tmr = localParts(new Date(now.getTime() + 24 * 3600 * 1000));
    const todayEndISO = localMidnightISO(tmr.year, tmr.month, tmr.day);

    const cap = dailyCapFor(student.game_xp || 0);
    let earnedToday = 0;
    try {
      const todayRes = await fetch(
        `${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&played_at=gte.${encodeURIComponent(todayStartISO)}&played_at=lt.${encodeURIComponent(todayEndISO)}&select=xp_gained`,
        { headers: sbHeaders }
      );
      const todayRows = await todayRes.json();
      if (Array.isArray(todayRows)) earnedToday = todayRows.reduce((sum, r) => sum + (r.xp_gained || 0), 0);
    } catch (e) { /* daca esueaza, tratam ca 0 castigat azi — mai bine generos decat blocat */ }

    const remainingToday = Math.max(0, cap - earnedToday);
    const xpGained = Math.min(rawXpGained, remainingToday);
    const capped = xpGained < rawXpGained;

    // Inregistram sesiunea de joc — cu XP-ul REAL acordat (dupa plafon), nu cel brut,
    // ca nici clasamentul lunar sa nu poata fi ocolit prin platoful zilnic.
    await fetch(`${SB_URL}/rest/v1/game_scores`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        student_id: payload.student_id,
        game_type: gameType,
        xp_gained: xpGained,
        correct, wrong,
        duration_sec: durationSec,
        played_at: new Date().toISOString(),
      }),
    });

    if (xpGained <= 0) {
      return res.status(200).json({ xpGained: 0, capped, dailyCap: cap, newXp: student.game_xp || 0, monthlyXp: student.monthly_xp || 0 });
    }

    const oldXp = student.game_xp || 0;
    const newXp = oldXp + xpGained;
    const period = currentXpPeriod();
    const monthlyBase = (student.xp_period === period) ? (student.monthly_xp || 0) : 0;
    const newMonthlyXp = Math.max(0, monthlyBase + xpGained);

    await fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ game_xp: newXp, monthly_xp: newMonthlyXp, xp_period: period }),
    });

    return res.status(200).json({ xpGained, capped, dailyCap: cap, newXp, monthlyXp: newMonthlyXp });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
