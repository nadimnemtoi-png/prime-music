import { pushConfig, sendToSubscriptions, isQuietHoursRO } from './_webpush.js';

// Notificari trimise "pe loc", declansate de profesor din aplicatie:
//   kind = "xp"       -> a primit XP pe o inregistrare
//   kind = "feedback" -> profesorul i-a lasat o parere
//   kind = "tema"     -> tema noua la lectia de azi
// Textul se construieste AICI, pe server, din tipul notificarii — din
// aplicatie vin doar tipul si cateva valori (XP-ul, textul temei).
// Intre 22:00 si 07:00 nu trimitem: mesajul intra in push_queue si pleaca la
// 07:00 (push-morning.js). Din acelasi tip pastram doar ultimul mesaj pe elev,
// ca dimineata sa nu primeasca, de ex., trei notificari de XP la rand.

async function verifyTeacher(SB_URL, SERVICE_KEY, bearer) {
  if (!bearer) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` } });
    if (!r.ok) return false;
    const user = await r.json();
    return !!(user && user.id);
  } catch (e) {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildMessage(kind, body) {
  if (kind === 'xp') {
    const xp = Math.max(0, Math.min(1000, parseInt(body.xp, 10) || 0));
    if (!xp) return null;
    return { title: `⭐ Ai primit ${xp} XP!`, body: 'Profesorul ți-a ascultat înregistrarea. Intră să vezi.', tag: 'xp', url: '/' };
  }
  if (kind === 'feedback') {
    return { title: '💬 Părere nouă de la profesor', body: 'Ți-a lăsat o părere despre înregistrare. Intră să o citești.', tag: 'feedback', url: '/' };
  }
  if (kind === 'tema') {
    const tema = String(body.tema || '').replace(/\s+/g, ' ').trim();
    if (!tema) return null;
    return { title: '📌 Temă nouă', body: tema.length > 110 ? tema.slice(0, 107) + '…' : tema, tag: 'tema', url: '/' };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyTeacher(SB_URL, SERVICE_KEY, bearer))) return res.status(401).json({ error: 'Unauthorized' });

  const cfg = pushConfig();
  if (!cfg) return res.status(200).json({ skipped: 'not_configured' });

  const body = req.body || {};
  const studentId = String(body.student_id || '');
  if (!UUID_RE.test(studentId)) return res.status(400).json({ error: 'Invalid student' });
  const message = buildMessage(String(body.kind || ''), body);
  if (!message) return res.status(400).json({ error: 'Invalid kind' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?student_id=eq.${studentId}&select=id,endpoint,p256dh,auth`, { headers: sbHeaders });
    if (!r.ok) return res.status(502).json({ error: 'Supabase request failed' });
    const subs = await r.json();
    if (!subs.length) return res.status(200).json({ sent: 0 });

    if (isQuietHoursRO()) {
      await fetch(`${SB_URL}/rest/v1/push_queue?student_id=eq.${studentId}&tag=eq.${message.tag}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      const q = await fetch(`${SB_URL}/rest/v1/push_queue`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ student_id: studentId, title: message.title, body: message.body, tag: message.tag, url: message.url }),
      });
      if (!q.ok) return res.status(502).json({ error: 'queue_failed' });
      return res.status(200).json({ queued: true });
    }

    const result = await sendToSubscriptions(subs, message, { SB_URL, sbHeaders, cfg, ttlSeconds: 12 * 3600 });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
