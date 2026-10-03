// Calculeaza definitiv locurile 1 pana la 5 (SEPARAT pentru fiecare profesor) pentru luna
// incheiata anterior si le salveaza PERMANENT in tabela monthly_awards — o singura data per luna. Odata salvate, medaliile
// nu se mai schimba niciodata, chiar daca XP-ul elevilor se schimba ulterior.
//
// E sigur de apelat oricand si de oricine (elev sau profesor, la deschiderea aplicatiei):
// daca luna respectiva a fost deja salvata, nu face nimic (raspunde instant).

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

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const now = new Date();
  const L = localParts(now);
  const prevMonth = L.month === 1 ? 12 : L.month - 1;
  const prevYear = L.month === 1 ? L.year - 1 : L.year;
  const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const monthLabel = `${MONTHS[prevMonth - 1]} ${prevYear}`;

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const get = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    return r.json();
  };
  // Supabase limiteaza un singur raspuns la un numar fix de randuri (ex. 1000), chiar
  // daca ceri mai multe cu &limit=. Citim "in bucati" pana nu mai vine nimic nou, ca sa
  // nu pierdem tacut randuri cand exista multe sesiuni de joc / repetitii intr-o luna —
  // important AICI mai ales, pentru ca medaliile salvate aici raman permanente.
  const getAll = async (path) => {
    const sep = path.includes('?') ? '&' : '?';
    const pageSize = 1000;
    let all = [], offset = 0;
    while (true) {
      const page = await get(`${path}${sep}limit=${pageSize}&offset=${offset}`);
      all = all.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  };

  try {
    // Fiecare profesor are clasamentul lui: medaliile se calculeaza separat pe
    // fiecare grupa (elevii aceluiasi profesor). O grupa deja salvata pentru luna
    // asta nu se mai atinge.
    const existing = await getAll(`monthly_awards?year_month=eq.${monthKey}&select=teacher_id&order=id`);
    const doneTeachers = new Set((existing || []).map(e => String(e.teacher_id)));

    const startISO = localMidnightISO(prevYear, prevMonth, 1);
    const endISO = localMidnightISO(L.year, L.month, 1); // exclusiv

    // Filtram repetitiile dupa created_at (cand s-a acordat XP-ul), NU dupa
    // week_start (saptamana repetitiei) — la fel ca la jocuri, ca sa se
    // potriveasca mereu cu XP-ul real al elevului. Important AICI mai ales,
    // pentru ca medaliile salvate aici raman permanente.
    const students = await getAll(`students?archived=is.false&teacher_id=not.is.null&select=id,teacher_id&order=id`);
    const teacherOf = {};
    students.forEach(s => { teacherOf[s.id] = String(s.teacher_id); });
    const pending = new Set(students.map(s => String(s.teacher_id)).filter(t => !doneTeachers.has(t)));
    if (!pending.size) {
      return res.status(200).json({ alreadyFinalized: true, month: monthKey });
    }

    const [practices, scores] = await Promise.all([
      getAll(`practice_logs?created_at=gte.${startISO}&created_at=lt.${endISO}&select=student_id,xp_rating,created_at&order=id`),
      getAll(`game_scores?played_at=gte.${startISO}&played_at=lt.${endISO}&select=student_id,xp_gained,played_at&order=id`),
    ]);

    const rep = {}, game = {}, lastTime = {};
    const bump = (id, t) => {
      const ts = new Date(t).getTime();
      if (!lastTime[id] || ts > lastTime[id]) lastTime[id] = ts;
    };

    (practices || []).forEach(p => {
      if (!teacherOf[p.student_id]) return;
      if (p.xp_rating > 0) {
        rep[p.student_id] = (rep[p.student_id] || 0) + p.xp_rating;
        bump(p.student_id, p.created_at);
      }
    });
    (scores || []).forEach(g => {
      if (!teacherOf[g.student_id]) return;
      if (g.xp_gained > 0) {
        game[g.student_id] = (game[g.student_id] || 0) + g.xp_gained;
        bump(g.student_id, g.played_at);
      }
    });

    // XP mai mare = loc mai bun. La egalitate: cine a ajuns primul la acel scor
    // (adica ultima lui actiune care a contribuit la XP a fost mai devreme in timp).
    const all = [...new Set([...Object.keys(rep), ...Object.keys(game)])]
      .map(id => ({ id, teacher: teacherOf[id], xp: (rep[id] || 0) + (game[id] || 0), lastTime: lastTime[id] || 0 }))
      .filter(x => x.xp > 0 && pending.has(x.teacher))
      .sort((a, b) => b.xp - a.xp || a.lastTime - b.lastTime);

    // Top 5 pe fiecare profesor
    const rows = [];
    const perTeacher = {};
    all.forEach(r => {
      const n = perTeacher[r.teacher] = (perTeacher[r.teacher] || 0) + 1;
      if (n <= 5) rows.push({
        student_id: r.id,
        teacher_id: r.teacher,
        year_month: monthKey,
        month_label: monthLabel,
        rank: n,
        xp: r.xp,
      });
    });

    if (!rows.length) {
      return res.status(200).json({ finalized: false, reason: 'no_activity', month: monthKey });
    }

    const saveRes = await fetch(`${SB_URL}/rest/v1/monthly_awards?on_conflict=teacher_id,year_month,rank`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!saveRes.ok) {
      const errText = await saveRes.text().catch(() => '');
      console.error('monthly_awards insert failed', saveRes.status, errText);
      return res.status(500).json({ error: 'save_failed', status: saveRes.status, month: monthKey });
    }

    return res.status(200).json({ finalized: true, month: monthKey, count: rows.length, teachers: Object.keys(perTeacher).length });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
