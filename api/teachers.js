import { getTeacher } from './_teacher-auth.js';

// Conturile de profesor — DOAR pentru administrator (Nadim):
//   POST { action: 'create', name, email, password }   -> cont nou de profesor
//   POST { action: 'reset', teacher_id, password }      -> parola noua (temporara)
//   POST { action: 'active', teacher_id, active }       -> dezactiveaza / reactiveaza
//   POST { action: 'delete', teacher_id, confirm_students } -> sterge DEFINITIV profesorul
//        (si elevii lui cu toate datele, daca aplicatia a confirmat explicit)
// Contul se creeaza in Supabase Auth (cu cheia service_role, care nu ajunge
// niciodata in browser) + un rand in tabela teachers, legat de cont.
// Statisticile (cati elevi, cati activi, cate lectii) vin din functia SQL
// admin_teacher_stats(), apelata direct din aplicatie.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = '876000h'; // ~100 de ani

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const admin = await getTeacher(SB_URL, SERVICE_KEY, bearer);
  if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Doar administratorul' });

  const sb = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const body = req.body || {};
  const action = String(body.action || '');

  const loadTeacher = async (id) => {
    if (!UUID_RE.test(String(id || ''))) return null;
    const r = await fetch(`${SB_URL}/rest/v1/teachers?id=eq.${id}&select=id,name,email,role,active,auth_user_id&limit=1`, { headers: sb });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  };
  const updateAuthUser = (authId, patch) => fetch(`${SB_URL}/auth/v1/admin/users/${authId}`, {
    method: 'PUT', headers: sb, body: JSON.stringify(patch),
  });

  try {
    if (action === 'create') {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const password = String(body.password || '');
      if (name.length < 2) return res.status(400).json({ error: 'Scrie numele profesorului.' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Emailul nu pare corect.' });
      if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Parola trebuie să aibă între 8 și 72 de caractere.' });

      const ex = await fetch(`${SB_URL}/rest/v1/teachers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { headers: sb });
      if (ex.ok && (await ex.json()).length) return res.status(409).json({ error: 'Există deja un profesor cu acest email.' });

      // 1) contul de logare (emailul e considerat confirmat: il creeaza administratorul)
      const ur = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: sb,
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role: 'teacher' } }),
      });
      const user = await ur.json().catch(() => ({}));
      if (!ur.ok || !user.id) {
        const msg = String(user.msg || user.message || user.error_description || '');
        if (/already|registered|exists/i.test(msg)) return res.status(409).json({ error: 'Există deja un cont cu acest email.' });
        return res.status(502).json({ error: 'Nu am putut crea contul.' });
      }

      // 2) randul din teachers, legat de cont; daca esueaza, stergem contul creat
      const tr = await fetch(`${SB_URL}/rest/v1/teachers`, {
        method: 'POST', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ name, email, role: 'teacher', active: true, auth_user_id: user.id, must_change_password: true }),
      });
      if (!tr.ok) {
        await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: sb }).catch(() => {});
        return res.status(502).json({ error: 'Nu am putut salva profesorul.' });
      }
      const row = (await tr.json())[0];
      return res.status(200).json({ ok: true, teacher: { id: row.id, name: row.name, email: row.email } });
    }

    if (action === 'reset') {
      const t = await loadTeacher(body.teacher_id);
      if (!t || !t.auth_user_id) return res.status(404).json({ error: 'Profesorul nu există.' });
      if (t.role === 'admin') return res.status(400).json({ error: 'Parola ta o schimbi din „Schimbă parola”.' });
      const password = String(body.password || '');
      if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Parola trebuie să aibă între 8 și 72 de caractere.' });
      const r = await updateAuthUser(t.auth_user_id, { password });
      if (!r.ok) return res.status(502).json({ error: 'Nu am putut schimba parola.' });
      await fetch(`${SB_URL}/rest/v1/teachers?id=eq.${t.id}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({ must_change_password: true }),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'active') {
      const t = await loadTeacher(body.teacher_id);
      if (!t || !t.auth_user_id) return res.status(404).json({ error: 'Profesorul nu există.' });
      if (t.role === 'admin') return res.status(400).json({ error: 'Contul de administrator nu poate fi dezactivat.' });
      const active = body.active === true;
      // contul blocat nu se mai poate loga; datele (elevii lui) raman neatinse
      const r = await updateAuthUser(t.auth_user_id, { ban_duration: active ? 'none' : BAN_FOREVER });
      if (!r.ok) return res.status(502).json({ error: 'Nu am putut schimba starea contului.' });
      const p = await fetch(`${SB_URL}/rest/v1/teachers?id=eq.${t.id}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({ active }),
      });
      if (!p.ok) return res.status(502).json({ error: 'Nu am putut salva starea.' });
      return res.status(200).json({ ok: true, active });
    }

    if (action === 'delete') {
      const t = await loadTeacher(body.teacher_id);
      if (!t) return res.status(404).json({ error: 'Profesorul nu există.' });
      if (t.role === 'admin') return res.status(400).json({ error: 'Contul de administrator nu poate fi șters.' });

      // elevii profesorului (inclusiv arhivati)
      const sr = await fetch(`${SB_URL}/rest/v1/students?teacher_id=eq.${t.id}&select=id&limit=10000`, { headers: sb });
      if (!sr.ok) return res.status(502).json({ error: 'Nu am putut verifica elevii profesorului.' });
      const ids = (await sr.json()).map((x) => x.id);
      // daca are elevi, aplicatia trebuie sa fi cerut confirmarea explicita
      if (ids.length && body.confirm_students !== true) {
        return res.status(409).json({ error: `Profesorul are ${ids.length} elevi.`, needs_confirm: true, students: ids.length });
      }

      // fisierele audio/video ale elevilor (le stergem din stocare la final)
      const fileUrls = [];
      for (let i = 0; i < ids.length; i += 100) {
        const inList = `in.(${ids.slice(i, i + 100).join(',')})`;
        for (const tbl of ['recordings', 'practice_logs']) {
          const fr = await fetch(`${SB_URL}/rest/v1/${tbl}?student_id=${inList}&file_url=not.is.null&select=file_url&limit=10000`, { headers: sb });
          if (fr.ok) (await fr.json()).forEach((r) => r.file_url && fileUrls.push(r.file_url));
        }
      }

      // 1) contul de logare (daca nu mai exista, mergem mai departe)
      if (t.auth_user_id) {
        const dr = await fetch(`${SB_URL}/auth/v1/admin/users/${t.auth_user_id}`, { method: 'DELETE', headers: sb });
        if (!dr.ok && dr.status !== 404) return res.status(502).json({ error: 'Nu am putut șterge contul de logare.' });
      }
      // 2) elevii — baza de date sterge automat (in cascada) tot ce tine de ei:
      //    repetitii, inregistrari, lectii, scoruri, notificari, medalii, monede...
      if (ids.length) {
        const dsr = await fetch(`${SB_URL}/rest/v1/students?teacher_id=eq.${t.id}`, { method: 'DELETE', headers: { ...sb, Prefer: 'return=minimal' } });
        if (!dsr.ok) return res.status(502).json({ error: 'Nu am putut șterge elevii profesorului.' });
      }
      // 3) ce mai tine de profesor (orar, venituri, criterii, materiale, lectii ramase)
      for (const tbl of ['schedule_slots', 'weekly_income', 'criteria', 'materials', 'lessons', 'monthly_awards']) {
        await fetch(`${SB_URL}/rest/v1/${tbl}?teacher_id=eq.${t.id}`, { method: 'DELETE', headers: { ...sb, Prefer: 'return=minimal' } }).catch(() => {});
      }
      // 4) randul profesorului
      const tr = await fetch(`${SB_URL}/rest/v1/teachers?id=eq.${t.id}`, { method: 'DELETE', headers: { ...sb, Prefer: 'return=minimal' } });
      if (!tr.ok) return res.status(502).json({ error: 'Nu am putut șterge profesorul.' });

      // 5) fisierele din stocare (fara sa blocam raspunsul daca vreunul nu se sterge)
      let filesDeleted = 0;
      try {
        const byBucket = {};
        fileUrls.forEach((u) => {
          const m = String(u).match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/([^?#]+)/);
          if (m) (byBucket[m[1]] = byBucket[m[1]] || []).push(decodeURIComponent(m[2]));
        });
        for (const [bucket, paths] of Object.entries(byBucket)) {
          for (let i = 0; i < paths.length; i += 100) {
            const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: sb, body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) });
            if (r.ok) filesDeleted += (await r.json().catch(() => [])).length || 0;
          }
        }
      } catch (e) {}

      return res.status(200).json({ ok: true, deleted: true, students: ids.length, files: filesDeleted });
    }

    return res.status(400).json({ error: 'Acțiune necunoscută' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

