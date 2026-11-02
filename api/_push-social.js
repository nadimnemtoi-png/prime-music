import crypto from 'crypto';
import { pushConfig, sendToSubscriptions, isQuietHoursRO } from './_webpush.js';

// Notificări pe telefon pentru Prieteni și dueluri (POST /api/push?a=social, cu tokenul ELEVULUI).
// Cardul din clopoțel îl scrie deja baza de date (funcțiile soc_*); aici trimitem doar notificarea
// de pe telefon. Aplicația spune DOAR ce s-a întâmplat (tip + id); serverul verifică în baza de
// date că s-a întâmplat cu adevărat, acum, și că elevul cu tokenul ăsta e cel care a făcut-o —
// așa nimeni nu poate trimite notificări inventate altor elevi.
//   kind = "duel"      {duel_id}  → adversarul: „X te-a provocat la duel!”
//   kind = "duel_done" {duel_id}  → celălalt: „Rezultatul duelului cu X e gata!”
//   kind = "friend"    {to}       → „X vrea să fie prietenul tău”
//   kind = "friend_ok" {to}       → „X a acceptat cererea ta”
// Între 22:00 și 07:00 intră în push_queue și pleacă la 07:00, ca celelalte.

function b64u(buf) { return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function verifyJWT(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = b64u(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload; try { payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 10 * 60 * 1000;   // doar pentru ce s-a întâmplat în ultimele 10 minute
const fresh = (iso) => !!iso && Date.now() - Date.parse(iso) < FRESH_MS;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!SERVICE_KEY || !JWT_SECRET) return res.status(500).json({ error: 'Server not configured' });
  const payload = verifyJWT((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), JWT_SECRET);
  const me = payload && String(payload.student_id || '');
  if (!UUID_RE.test(me || '')) return res.status(401).json({ error: 'Invalid token' });
  const cfg = pushConfig();
  if (!cfg) return res.status(200).json({ skipped: 'not_configured' });

  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const get = async (path) => { const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: h }); if (!r.ok) throw new Error('sb'); return r.json(); };
  const body = req.body || {};
  const kind = String(body.kind || '');
  try {
    const [meRow] = await get(`students?id=eq.${me}&select=name`);
    const myName = String((meRow && meRow.name) || 'Un coleg').replace(/\s+/g, ' ').trim();
    let to = null, msg = null;

    if (kind === 'duel' || kind === 'duel_done') {
      const id = parseInt(body.duel_id, 10);
      if (!(id > 0)) return res.status(400).json({ error: 'Invalid' });
      const [d] = await get(`duels?id=eq.${id}&select=id,challenger,opponent,status,created_at,c_done,o_done`);
      if (!d || (d.challenger !== me && d.opponent !== me)) return res.status(403).json({ error: 'Not yours' });
      if (kind === 'duel') {
        if (d.challenger !== me || d.status !== 'open' || !fresh(d.created_at)) return res.status(200).json({ sent: 0 });
        to = d.opponent;
        msg = { title: `⚔️ ${myName} te-a provocat la duel!`, body: 'Ai 24 de ore. Apasă aici ca să joci!', tag: `duel-${id}`, url: `/?soc=duel&d=${id}` };
      } else {
        const myDone = d.challenger === me ? d.c_done : d.o_done;
        if (d.status !== 'done' || !fresh(myDone)) return res.status(200).json({ sent: 0 });
        to = d.challenger === me ? d.opponent : d.challenger;
        msg = { title: `⚔️ Rezultatul duelului cu ${myName} e gata!`, body: 'Apasă aici ca să vezi cine a câștigat.', tag: `duel-${id}`, url: `/?soc=res&d=${id}` };
      }
    } else if (kind === 'friend' || kind === 'friend_ok') {
      const other = String(body.to || '');
      if (!UUID_RE.test(other)) return res.status(400).json({ error: 'Invalid' });
      if (kind === 'friend') {
        const [f] = await get(`friendships?requester=eq.${me}&addressee=eq.${other}&status=eq.pending&select=created_at`);
        if (!f || !fresh(f.created_at)) return res.status(200).json({ sent: 0 });
        msg = { title: `👥 ${myName} vrea să fie prietenul tău`, body: 'Apasă aici ca să accepți.', tag: 'friend', url: '/?soc=friends' };
      } else {
        const [f] = await get(`friendships?requester=eq.${other}&addressee=eq.${me}&status=eq.accepted&select=accepted_at`);
        if (!f || !fresh(f.accepted_at)) return res.status(200).json({ sent: 0 });
        msg = { title: `🤝 ${myName} a acceptat cererea ta`, body: 'Acum vă puteți provoca la duel!', tag: 'friend', url: '/?soc=friends' };
      }
      to = other;
    } else return res.status(400).json({ error: 'Invalid kind' });

    if (isQuietHoursRO()) {
      await fetch(`${SB_URL}/rest/v1/push_queue?student_id=eq.${to}&tag=eq.${encodeURIComponent(msg.tag)}`, { method: 'DELETE', headers: { ...h, Prefer: 'return=minimal' } });
      await fetch(`${SB_URL}/rest/v1/push_queue`, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ student_id: to, title: msg.title, body: msg.body, tag: msg.tag, url: msg.url }) });
      return res.status(200).json({ queued: true });
    }
    const subs = await get(`push_subscriptions?student_id=eq.${to}&select=id,endpoint,p256dh,auth`);
    if (!subs.length) return res.status(200).json({ sent: 0 });
    return res.status(200).json(await sendToSubscriptions(subs, msg, { SB_URL, sbHeaders: h, cfg, ttlSeconds: 12 * 3600 }));
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
