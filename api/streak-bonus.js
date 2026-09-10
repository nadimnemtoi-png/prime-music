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

// La fiecare 7 zile de streak la rand (jucat un joc SAU trimis o inregistrare,
// SAU o zi acoperita cu un Freeze), elevul primeste un bonus de monede, care
// CRESTE la fiecare prag: 7 zile = 20, 14 zile = 25, 21 zile = 30, 28 zile = 35,
// si tot asa (+STREAK_INCREMENT la fiecare 7 zile). Se acorda o singura data
// per prag, verificat mereu server-side.
const STREAK_BASE_COINS = 20;
const STREAK_INCREMENT = 5;

// ── Ziua locala (Romania), ca streak-ul sa se calculeze pe zile calendaristice
// din perspectiva Romaniei, nu din UTC ──
const TZ = 'Europe/Bucharest';
function ymdInTZ(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(date);
}
function addDaysYmd(ymd, days) {
  const d = new Date(ymd + 'T12:00:00Z'); // amiaza UTC, ca sa evitam probleme de DST la +/- o zi
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
    // Recalculam streak-ul din sursele reale (practice_logs + game_scores +
    // zilele acoperite cu Freeze) — nu avem niciodata incredere in ce trimite
    // telefonul elevului.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const [prRes, gsRes, fzRes, stRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/practice_logs?student_id=eq.${payload.student_id}&select=created_at&created_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/game_scores?student_id=eq.${payload.student_id}&select=played_at&played_at=gte.${since.toISOString()}`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/streak_freezes?student_id=eq.${payload.student_id}&select=date`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/students?id=eq.${payload.student_id}&select=name,freeze_count,freeze_offer_dismissed_for_day,in_top5,monthly_xp`, { headers: sbHeaders }),
    ]);
    if (!prRes.ok || !gsRes.ok || !fzRes.ok || !stRes.ok) {
      console.error('streak-bonus: Supabase query failed', prRes.status, gsRes.status, fzRes.status, stRes.status);
      return res.status(502).json({ error: 'Supabase request failed' });
    }
    const prRows = await prRes.json();
    const gsRows = await gsRes.json();
    const fzRows = await fzRes.json();
    const stRows = await stRes.json();
    const student = Array.isArray(stRows) ? stRows[0] : null;
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const daySet = new Set();
    prRows.forEach(p => { if (p.created_at) daySet.add(ymdInTZ(new Date(p.created_at))); });
    gsRows.forEach(g => { if (g.played_at) daySet.add(ymdInTZ(new Date(g.played_at))); });
    fzRows.forEach(f => { if (f.date) daySet.add(f.date); });

    const todayYmd = ymdInTZ(new Date());
    const yesterdayYmd = addDaysYmd(todayYmd, -1);

    let curStreak = 0;
    let lastCoveredDay = null; // ultima zi (din trecut spre azi) care e in daySet, pe lantul curent
    {
      let cursorYmd = todayYmd;
      if (!daySet.has(cursorYmd)) cursorYmd = addDaysYmd(cursorYmd, -1);
      while (daySet.has(cursorYmd)) {
        curStreak++;
        lastCoveredDay = cursorYmd;
        cursorYmd = addDaysYmd(cursorYmd, -1);
      }
    }

    // Gap-ul = zile ratate, complet trecute (nu include azi), de dupa ultima
    // zi acoperita. Daca elevul e activ azi sau a fost activ ieri, nu exista
    // niciun gap de propus.
    let gapDays = 0;
    let gapStartDay = null;
    if (lastCoveredDay && lastCoveredDay < yesterdayYmd) {
      gapStartDay = addDaysYmd(lastCoveredDay, 1);
      let d = gapStartDay;
      while (d <= yesterdayYmd) { gapDays++; d = addDaysYmd(d, 1); }
    } else if (!lastCoveredDay) {
      // Nu are nicio activitate deloc inregistrata — nimic de oferit.
      gapDays = 0;
    }

    const freezeCount = student.freeze_count || 0;
    const alreadyDismissedForThisGap = student.freeze_offer_dismissed_for_day && lastCoveredDay && student.freeze_offer_dismissed_for_day === lastCoveredDay;
    const showGapOffer = gapDays > 0 && freezeCount >= gapDays && !alreadyDismissedForThisGap;

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

    // Important: asteptam (await) toate cererile de notificare de mai jos
    // inainte sa raspundem — pe Vercel, functia se poate "inghesa"/opri chiar
    // dupa ce trimitem raspunsul, iar cererile pornite dar neasteptate
    // ("fire and forget") pot sa nu mai apuce sa ajunga la Supabase. De-aia
    // notificarea catre profesor lipsea uneori.
    if (awarded > 0) {
      await Promise.all([
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
        }).catch(() => {}),
        // Si profesorul afla ca elevul a atins un prag de streak.
        fetch(`${SB_URL}/rest/v1/teacher_activity`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            type: 'streak_milestone',
            student_id: payload.student_id,
            message: `${student.name || 'Un elev'} a atins un streak de ${curStreak} zile!`,
            icon: '🔥',
          }),
        }).catch(() => {}),
      ]);
    }

    // ── Top 5 (dupa monthly_xp) — anuntam profesorul DOAR cand cineva e
    // scos din top 5 de altcineva ("X a fost înlocuit de Y"), NU la simpla
    // schimbare de pozitie in interiorul celor 5 (zgomot) si nici la simpla
    // intrare (asta genera notificari si cand cineva doar isi schimba locul,
    // fara sa iasa nimeni din top 5 — de-aia s-a renuntat la ea). Folosim
    // coloana students.in_top5 ca sa stim cine era in top 5 DATA TRECUTA
    // (nu are nevoie de un tabel separat de "istoric").
    try {
      const [rankRes, prevTop5Res] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/students?archived=is.false&access_blocked=is.false&select=id&order=monthly_xp.desc.nullslast&limit=5`, { headers: sbHeaders }),
        fetch(`${SB_URL}/rest/v1/students?in_top5=is.true&select=id,name`, { headers: sbHeaders }),
      ]);
      if (rankRes.ok && prevTop5Res.ok) {
        const newTop5Rows = await rankRes.json();
        const prevTop5Rows = await prevTop5Res.json();
        const newIds = Array.isArray(newTop5Rows) ? newTop5Rows.map(r => r.id) : [];
        const prevIds = Array.isArray(prevTop5Rows) ? prevTop5Rows.map(r => r.id) : [];
        const droppedIds = prevIds.filter(id => !newIds.includes(id));
        const enteredIds = newIds.filter(id => !prevIds.includes(id));
        const writes = [];
        // Trimitem mesajul de "inlocuire" doar cand numarul de iesiri si
        // intrari coincide (un swap clar) — daca nu coincid (ex: abia acum
        // se populeaza top 5-ul prima data, sau lipsesc date), actualizam
        // tacit lista, fara sa ghicim cine pe cine a inlocuit.
        if (droppedIds.length > 0 && droppedIds.length === enteredIds.length) {
          const droppedNames = {};
          prevTop5Rows.forEach(r => { droppedNames[r.id] = r.name; });
          let enteredNames = {};
          const enteredRes = await fetch(`${SB_URL}/rest/v1/students?id=in.(${enteredIds.join(',')})&select=id,name`, { headers: sbHeaders }).catch(() => null);
          if (enteredRes && enteredRes.ok) {
            const rows = await enteredRes.json();
            rows.forEach(r => { enteredNames[r.id] = r.name; });
          }
          droppedIds.forEach((droppedId, i) => {
            const enteredId = enteredIds[i];
            const droppedName = droppedNames[droppedId] || 'Un elev';
            const enteredName = enteredNames[enteredId] || 'un elev';
            writes.push(fetch(`${SB_URL}/rest/v1/teacher_activity`, {
              method: 'POST',
              headers: { ...sbHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({
                type: 'top5_swap',
                student_id: enteredId,
                message: `${droppedName} a fost înlocuit de ${enteredName} în top 5!`,
                icon: '🔁',
              }),
            }).catch(() => {}));
          });
        }
        if (droppedIds.length > 0) {
          writes.push(fetch(`${SB_URL}/rest/v1/students?id=in.(${droppedIds.join(',')})`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ in_top5: false }),
          }).catch(() => {}));
        }
        if (enteredIds.length > 0) {
          writes.push(fetch(`${SB_URL}/rest/v1/students?id=in.(${enteredIds.join(',')})`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ in_top5: true }),
          }).catch(() => {}));
        }
        if (writes.length) await Promise.all(writes);
      }
    } catch (e) { /* neesential — nu blocam raspunsul principal daca rankingul esueaza */ }

    return res.status(200).json({
      streak: curStreak,
      awarded,
      newCoins: result?.new_coins ?? 0,
      freezeCount,
      gapOffer: showGapOffer ? { gapDays, gapStartDay, potentialStreak: curStreak + gapDays } : null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
