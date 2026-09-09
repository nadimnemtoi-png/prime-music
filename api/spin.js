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

    if (outcomeType === 'coin') {
      fetch(`${SB_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          student_id: payload.student_id,
          title: `🎡 Ai câștigat ${amount} ${amount === 1 ? 'monedă' : 'monede'} la SPIN!`,
          message: 'Continuă și mâine pentru un SPIN nou.',
          icon: '🪙',
        }),
      }).catch(() => {});
    } else if (outcomeType === 'freeze') {
      fetch(`${SB_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          student_id: payload.student_id,
          title: '🎡 Ai câștigat un Freeze la SPIN!',
          message: 'Îl poți folosi ca să-ți salvezi streak-ul într-o zi liberă.',
          icon: '❄️',
        }),
      }).catch(() => {});
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
