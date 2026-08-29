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
    const rows = await sRes.json();
    const student = Array.isArray(rows) && rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.access_blocked) return res.status(403).json({ error: 'Access blocked' });

    if (total <= 0) {
      return res.status(200).json({ xpGained: 0, newXp: student.game_xp || 0, monthlyXp: student.monthly_xp || 0 });
    }

    const xpGained = Math.round(MAX_XP_PER_GAME * (correct / total));

    // Inregistram sesiunea de joc
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
      return res.status(200).json({ xpGained: 0, newXp: student.game_xp || 0, monthlyXp: student.monthly_xp || 0 });
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

    return res.status(200).json({ xpGained, newXp, monthlyXp: newMonthlyXp });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
