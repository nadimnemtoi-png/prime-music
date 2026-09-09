import crypto from 'crypto';

// ── JWT (aceeasi verificare ca in add-xp.js / streak-bonus.js) ──
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

// Pretul fiecarui joc e stabilit AICI, pe server — clientul trimite doar
// gameId, niciodata pretul, ca sa nu poata fi pacalita o cumparare mai ieftina.
// Cand adaugi un joc nou in magazin, adauga-i pretul si aici (si in ALL_GAMES
// din index.html, ca sa apara cu acelasi pret pe cardul jocului).
const GAME_PRICES = {
  'acorduri-pian': 150,
  'nota-gat': 150,
};

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
  const gameId = String(body.gameId || '');
  const price = GAME_PRICES[gameId];
  if (!price) return res.status(400).json({ error: 'Joc necunoscut' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/buy_game_unlock`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ p_student_id: payload.student_id, p_game_id: gameId, p_price: price }),
    });
    if (!rpcRes.ok) {
      console.error('buy-game: buy_game_unlock failed', rpcRes.status, await rpcRes.text().catch(() => ''));
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const rpcRows = await rpcRes.json();
    const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

    return res.status(200).json({
      success: !!result?.success,
      newCoins: result?.new_coins ?? 0,
      message: result?.message || '',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
