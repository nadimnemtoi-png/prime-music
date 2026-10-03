// Verificari comune pentru functiile de server apelate de PROFESOR.
// (fisierele care incep cu "_" nu sunt functii Vercel separate)
//
// Functiile de server folosesc cheia service_role, care OCOLESTE regulile din
// baza de date — de aceea aici verificam de mana cine e profesorul si daca
// elevul cerut e chiar al lui.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Intoarce randul profesorului logat ({ id, name, email, role, active, auth_user_id })
// sau null daca tokenul nu e al unui profesor activ.
export async function getTeacher(SB_URL, SERVICE_KEY, bearer) {
  if (!bearer) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` } });
    if (!r.ok) return null;
    const user = await r.json();
    if (!user || !UUID_RE.test(String(user.id || ''))) return null;
    const t = await fetch(`${SB_URL}/rest/v1/teachers?auth_user_id=eq.${user.id}&active=is.true&select=id,name,email,role,active,auth_user_id&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!t.ok) return null;
    const rows = await t.json();
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

// Elevul apartine profesorului?
export async function ownsStudent(SB_URL, SERVICE_KEY, teacher, studentId) {
  if (!teacher || !UUID_RE.test(String(studentId || ''))) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/students?id=eq.${studentId}&teacher_id=eq.${teacher.id}&select=id&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!r.ok) return false;
    return (await r.json()).length === 1;
  } catch (e) {
    return false;
  }
}

// Id-urile tuturor elevilor profesorului (pentru filtrare).
export async function teacherStudentIds(SB_URL, SERVICE_KEY, teacher) {
  if (!teacher) return new Set();
  const r = await fetch(`${SB_URL}/rest/v1/students?teacher_id=eq.${teacher.id}&select=id&limit=5000`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return new Set();
  return new Set((await r.json()).map((s) => s.id));
}
