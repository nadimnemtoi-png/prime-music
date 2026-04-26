import { useState, useEffect } from "react";
import { db, getWhatsAppLink } from "../lib/supabase.js";

const LESSON_PRICE = 100;

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d0f; --surface: #16161a; --surface2: #1e1e24;
    --border: rgba(255,255,255,0.08); --accent: #e8c97e; --accent2: #7ec8e3;
    --danger: #e87e7e; --success: #7ee8a2; --text: #f0ede8; --muted: #7a7a8a;
    --display: 'Playfair Display', serif; --body: 'DM Sans', sans-serif;
    --radius: 18px; --radius-sm: 10px;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--body); }
  .app { max-width: 430px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }

  .header { padding: 52px 20px 0; }
  .logo { font-family: var(--display); font-size: 22px; font-weight: 900; color: var(--accent); }
  .logo span { color: var(--text); }
  .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }

  .stats-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 16px 20px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 12px; }
  .stat-value { font-family: var(--display); font-size: 20px; font-weight: 700; }
  .stat-value.gold { color: var(--accent); }
  .stat-value.blue { color: var(--accent2); }
  .stat-value.red { color: var(--danger); }
  .stat-label { font-size: 10px; color: var(--muted); margin-top: 4px; }

  .nav { display: flex; padding: 0 20px; gap: 6px; margin-bottom: 4px; overflow-x: auto; scrollbar-width: none; }
  .nav::-webkit-scrollbar { display: none; }
  .nav-btn { flex-shrink: 0; padding: 8px 16px; border-radius: 30px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: var(--body); font-size: 13px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
  .nav-btn.active { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 500; }

  .content { flex: 1; padding: 0 20px 100px; }
  .section-title { font-family: var(--display); font-size: 18px; font-weight: 700; margin: 16px 0 10px; display: flex; justify-content: space-between; align-items: center; }
  .add-btn { display: flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 20px; background: var(--accent); border: none; color: var(--bg); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--body); }

  .student-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.2s; }
  .student-card:active { border-color: var(--accent); }
  .student-row { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 44px; height: 44px; border-radius: 12px; background: var(--surface2); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .student-info { flex: 1; min-width: 0; }
  .student-name { font-weight: 500; font-size: 15px; }
  .student-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 500; }
  .badge-danger { background: rgba(232,126,126,0.15); color: var(--danger); border: 1px solid rgba(232,126,126,0.3); }
  .badge-success { background: rgba(126,232,162,0.15); color: var(--success); border: 1px solid rgba(126,232,162,0.3); }
  .badge-gold { background: rgba(232,201,126,0.15); color: var(--accent); border: 1px solid rgba(232,201,126,0.3); }

  .pay-bar-wrap { margin-top: 10px; }
  .pay-bar-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .pay-bar-track { height: 5px; background: var(--surface2); border-radius: 10px; overflow: hidden; }
  .pay-bar-fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg, var(--accent), #f5d98a); transition: width 0.5s; }

  .income-card { background: linear-gradient(135deg, #1a1608, #1e1a08); border: 1px solid rgba(232,201,126,0.2); border-radius: var(--radius); padding: 20px; margin-bottom: 10px; position: relative; overflow: hidden; }
  .income-card::after { content: '♪'; position: absolute; right: 16px; top: 50%; transform: translateY(-50%); font-size: 60px; opacity: 0.05; color: var(--accent); }
  .income-label { font-size: 12px; color: rgba(232,201,126,0.6); margin-bottom: 4px; }
  .income-value { font-family: var(--display); font-size: 32px; font-weight: 900; color: var(--accent); }
  .income-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }

  .lesson-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .lesson-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .lesson-dot.paid { background: var(--success); }
  .lesson-dot.unpaid { background: var(--danger); }
  .lesson-info { flex: 1; }
  .lesson-date { font-size: 12px; color: var(--muted); }
  .lesson-note { font-size: 13px; margin-top: 2px; }
  .pay-btn { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--accent); color: var(--accent); background: transparent; font-size: 12px; cursor: pointer; font-family: var(--body); }

  .mat-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--surface); border-radius: var(--radius-sm); margin-bottom: 8px; border: 1px solid var(--border); }
  .mat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .mat-title { font-size: 13px; font-weight: 500; flex: 1; }
  .mat-cat { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .mat-send-btn { padding: 6px 12px; border-radius: 20px; background: var(--surface2); border: 1px solid var(--border); color: var(--accent); font-size: 12px; cursor: pointer; font-family: var(--body); font-weight: 500; }

  .wa-btn { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: var(--radius-sm); color: #25d166; font-size: 13px; text-decoration: none; font-weight: 500; margin-top: 10px; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 100; display: flex; align-items: flex-end; backdrop-filter: blur(6px); max-width: 430px; margin: 0 auto; }
  .modal { background: var(--surface); border-radius: 24px 24px 0 0; padding: 24px 20px 44px; width: 100%; max-height: 88vh; overflow-y: auto; border-top: 1px solid var(--border); }
  .modal-handle { width: 40px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 20px; }
  .modal-title { font-family: var(--display); font-size: 20px; font-weight: 700; margin-bottom: 16px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
  .field input, .field select, .field textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; color: var(--text); font-family: var(--body); font-size: 14px; outline: none; }
  .field input:focus { border-color: var(--accent); }
  .field textarea { resize: none; height: 80px; }
  .submit-btn { width: 100%; padding: 14px; border-radius: var(--radius-sm); background: var(--accent); border: none; color: var(--bg); font-size: 15px; font-weight: 600; font-family: var(--body); cursor: pointer; margin-top: 6px; }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cancel-btn { width: 100%; padding: 12px; border-radius: var(--radius-sm); background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 14px; font-family: var(--body); cursor: pointer; margin-top: 8px; }

  .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; background: rgba(13,13,15,0.97); border-top: 1px solid var(--border); display: flex; padding: 10px 20px env(safe-area-inset-bottom, 20px); backdrop-filter: blur(10px); z-index: 50; }
  .bn-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; cursor: pointer; padding: 4px; }
  .bn-icon { font-size: 22px; }
  .bn-label { font-size: 10px; color: var(--muted); font-family: var(--body); }
  .bn-btn.active .bn-label { color: var(--accent); }

  .empty { text-align: center; padding: 30px 0; color: var(--muted); font-size: 14px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); }
  .error-box { background: rgba(232,126,126,0.1); border: 1px solid rgba(232,126,126,0.3); border-radius: var(--radius-sm); padding: 14px; color: var(--danger); font-size: 13px; margin-bottom: 12px; line-height: 1.5; }

  .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--success); color: var(--success); padding: 10px 20px; border-radius: 30px; font-size: 13px; z-index: 999; animation: ta 2.5s ease forwards; white-space: nowrap; }
  @keyframes ta { 0%{opacity:0;top:10px} 12%{opacity:1;top:20px} 80%{opacity:1} 100%{opacity:0} }

  .level-badge { display: inline-flex; align-items: center; gap: 3px; }
  select option { background: var(--surface2); }
`;

const LEVELS = { beginner: "🌱 Începător", intermediate: "🌿 Intermediar", advanced: "🌳 Avansat" };

export default function ProfesorApp() {
  const [tab, setTab] = useState("acasa");
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  // Modals
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);

  // Forms
  const [newStudent, setNewStudent] = useState({ name: "", instrument: "Chitară", level: "beginner", phone: "" });
  const [newLesson, setNewLesson] = useState({ student_id: "", date: new Date().toISOString().split("T")[0], notes: "", price: LESSON_PRICE });
  const [newMat, setNewMat] = useState({ title: "", type: "youtube", url: "", description: "" });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [s, l, m] = await Promise.all([
        db.get("students", "?select=*&order=created_at.desc"),
        db.get("lessons", "?select=*&order=date.desc"),
        db.get("materials", "?select=*&order=created_at.desc"),
      ]);
      setStudents(s); setLessons(l); setMaterials(m);
    } catch (e) {
      setError("Nu mă pot conecta. Verifică că ai rulat schema SQL în Supabase.");
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  // Helpers
  const getStudentLessons = (sid) => lessons.filter(l => l.student_id === sid);
  const getUnpaid = (sid) => getStudentLessons(sid).filter(l => !l.paid).length;
  const getPaid = (sid) => getStudentLessons(sid).filter(l => l.paid).length;
  const totalEarned = lessons.filter(l => l.paid).reduce((s, l) => s + (l.price || LESSON_PRICE), 0);
  const totalUnpaid = lessons.filter(l => !l.paid).reduce((s, l) => s + (l.price || LESSON_PRICE), 0);
  const studentsWithDebt = students.filter(s => getUnpaid(s.id) > 0);

  // Actions
  const addStudent = async () => {
    if (!newStudent.name.trim()) return;
    setSaving(true);
    try {
      const avatar = newStudent.instrument === "Chitară" ? "🎸" : "🎹";
      const result = await db.post("students", { ...newStudent, avatar });
      setStudents(prev => [result[0], ...prev]);
      setNewStudent({ name: "", instrument: "Chitară", level: "beginner", phone: "" });
      setShowAddStudent(false);
      showToast("🎵 Elev adăugat!");
    } catch { showToast("❌ Eroare la salvare"); }
    finally { setSaving(false); }
  };

  const addLesson = async () => {
    if (!newLesson.student_id || !newLesson.date) return;
    setSaving(true);
    try {
      const result = await db.post("lessons", { ...newLesson, paid: false });
      setLessons(prev => [result[0], ...prev]);
      setNewLesson({ student_id: "", date: new Date().toISOString().split("T")[0], notes: "", price: LESSON_PRICE });
      setShowAddLesson(false);
      showToast("📚 Lecție adăugată!");
    } catch { showToast("❌ Eroare la salvare"); }
    finally { setSaving(false); }
  };

  const addMaterial = async () => {
    if (!newMat.title.trim()) return;
    setSaving(true);
    try {
      const result = await db.post("materials", { ...newMat });
      setMaterials(prev => [result[0], ...prev]);
      setNewMat({ title: "", type: "youtube", url: "", description: "" });
      setShowAddMaterial(false);
      showToast("📂 Material adăugat!");
    } catch { showToast("❌ Eroare la salvare"); }
    finally { setSaving(false); }
  };

  const markAllPaid = async (studentId) => {
    const unpaid = lessons.filter(l => l.student_id === studentId && !l.paid);
    try {
      await Promise.all(unpaid.map(l => db.patch("lessons", l.id, { paid: true })));
      setLessons(prev => prev.map(l => l.student_id === studentId ? { ...l, paid: true } : l));
      showToast(`✅ ${unpaid.length} lecții marcate plătite!`);
    } catch { showToast("❌ Eroare"); }
  };

  const markLessonPaid = async (id) => {
    try {
      await db.patch("lessons", id, { paid: true });
      setLessons(prev => prev.map(l => l.id === id ? { ...l, paid: true } : l));
      showToast("✅ Marcat ca plătit!");
    } catch { showToast("❌ Eroare"); }
  };

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, background:"#0d0d0f" }}>
        <div style={{ fontSize:48 }}>🎵</div>
        <div style={{ color:"#7a7a8a", fontSize:14 }}>Se încarcă Prime Music...</div>
      </div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {toast && <div className="toast">{toast}</div>}

        <div className="header">
          <div className="logo">Prime<span>Music</span></div>
          <div className="subtitle">Panou profesor</div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value gold">{students.length}</div>
            <div className="stat-label">Elevi</div>
          </div>
          <div className="stat-card">
            <div className="stat-value blue">{totalEarned.toLocaleString()}</div>
            <div className="stat-label">Încasat RON</div>
          </div>
          <div className="stat-card">
            <div className="stat-value red">{totalUnpaid.toLocaleString()}</div>
            <div className="stat-label">Restanțe RON</div>
          </div>
        </div>

        <div className="nav">
          {[
            { id:"acasa", label:"📊 Acasă" },
            { id:"elevi", label:"🎓 Elevi" },
            { id:"lectii", label:"📚 Lecții" },
            { id:"materiale", label:"📂 Materiale" },
          ].map(t => (
            <button key={t.id} className={`nav-btn${tab===t.id?" active":""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="content">
          {error && <div className="error-box">⚠️ {error}</div>}

          {/* ── ACASĂ ── */}
          {tab === "acasa" && (
            <>
              <div className="income-card">
                <div className="income-label">Total încasat</div>
                <div className="income-value">{totalEarned.toLocaleString()} RON</div>
                <div className="income-sub">{lessons.filter(l=>l.paid).length} lecții plătite · {LESSON_PRICE} RON/lec</div>
              </div>
              <div className="section-title">Restanțe</div>
              {studentsWithDebt.length === 0
                ? <div className="empty">🎉 Nicio restanță!</div>
                : studentsWithDebt.map(s => (
                  <div className="student-card" key={s.id}>
                    <div className="student-row">
                      <div className="avatar">{s.avatar}</div>
                      <div className="student-info">
                        <div className="student-name">{s.name}</div>
                        <div className="student-meta">{s.instrument}</div>
                      </div>
                      <span className="badge badge-danger">{getUnpaid(s.id) * LESSON_PRICE} RON</span>
                    </div>
                    <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                      <button className="pay-btn" onClick={() => markAllPaid(s.id)}>✓ Marchează plătit</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* ── ELEVI ── */}
          {tab === "elevi" && (
            <>
              <div className="section-title">
                Elevi ({students.length})
                <button className="add-btn" onClick={() => setShowAddStudent(true)}>+ Adaugă</button>
              </div>
              {students.length === 0
                ? <div className="empty">Niciun elev. Apasă + pentru a adăuga.</div>
                : students.map(s => {
                  const total = getStudentLessons(s.id).length;
                  const paid = getPaid(s.id);
                  const pct = total ? Math.round((paid/total)*100) : 100;
                  return (
                    <div className="student-card" key={s.id} onClick={() => setSelectedStudent(s)}>
                      <div className="student-row">
                        <div className="avatar">{s.avatar}</div>
                        <div className="student-info">
                          <div className="student-name">{s.name}</div>
                          <div className="student-meta">{s.instrument} · {LEVELS[s.level]}</div>
                        </div>
                        {getUnpaid(s.id) > 0
                          ? <span className="badge badge-danger">{getUnpaid(s.id)} neplătite</span>
                          : <span className="badge badge-success">La zi</span>}
                      </div>
                      <div className="pay-bar-wrap">
                        <div className="pay-bar-label">
                          <span>{paid}/{total} plătite</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="pay-bar-track">
                          <div className="pay-bar-fill" style={{width:`${pct}%`}} />
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </>
          )}

          {/* ── LECȚII ── */}
          {tab === "lectii" && (
            <>
              <div className="section-title">
                Lecții
                <button className="add-btn" onClick={() => setShowAddLesson(true)}>+ Adaugă</button>
              </div>
              {lessons.map(l => {
                const s = students.find(st => st.id === l.student_id);
                return (
                  <div className="lesson-row" key={l.id}>
                    <div className={`lesson-dot ${l.paid?"paid":"unpaid"}`} />
                    <div className="lesson-info">
                      <div className="lesson-date">{l.date} · {s?.name || "—"}</div>
                      <div className="lesson-note">{l.notes || "Fără note"}</div>
                    </div>
                    {!l.paid && <button className="pay-btn" onClick={() => markLessonPaid(l.id)}>Plătit</button>}
                  </div>
                );
              })}
            </>
          )}

          {/* ── MATERIALE ── */}
          {tab === "materiale" && (
            <>
              <div className="section-title">
                Biblioteca
                <button className="add-btn" onClick={() => setShowAddMaterial(true)}>+ Adaugă</button>
              </div>
              {materials.length === 0
                ? <div className="empty">Niciun material. Adaugă primul.</div>
                : materials.map(m => (
                  <div className="mat-row" key={m.id}>
                    <div className="mat-icon" style={{background: m.type==="youtube"?"rgba(255,80,80,0.1)":m.type==="pdf"?"rgba(232,126,126,0.1)":"rgba(126,200,227,0.1)"}}>
                      {m.type==="youtube"?"▶️":m.type==="pdf"?"📄":"🎬"}
                    </div>
                    <div style={{flex:1}}>
                      <div className="mat-title">{m.title}</div>
                      <div className="mat-cat">{m.type === "youtube" ? "YouTube" : m.type === "pdf" ? "PDF" : "Clipul meu"}</div>
                    </div>
                    <button className="mat-send-btn" onClick={() => showToast("🔗 Copiază linkul și trimite elevului")}>
                      Trimite
                    </button>
                  </div>
                ))
              }
            </>
          )}
        </div>

        {/* Bottom nav */}
        <div className="bottom-nav">
          {[
            {id:"acasa",icon:"📊",label:"Acasă"},
            {id:"elevi",icon:"🎓",label:"Elevi"},
            {id:"lectii",icon:"📚",label:"Lecții"},
            {id:"materiale",icon:"📂",label:"Materiale"},
          ].map(b => (
            <button key={b.id} className={`bn-btn${tab===b.id?" active":""}`} onClick={() => setTab(b.id)}>
              <span className="bn-icon">{b.icon}</span>
              <span className="bn-label">{b.label}</span>
            </button>
          ))}
        </div>

        {/* Modal: Student detail */}
        {selectedStudent && (
          <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
                <div className="avatar" style={{width:50,height:50,fontSize:26}}>{selectedStudent.avatar}</div>
                <div>
                  <div style={{fontFamily:"var(--display)",fontSize:18,fontWeight:700}}>{selectedStudent.name}</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>{selectedStudent.instrument} · {LEVELS[selectedStudent.level]}</div>
                </div>
              </div>
              {selectedStudent.phone && (
                <a className="wa-btn" href={getWhatsAppLink(selectedStudent)} target="_blank" rel="noreferrer">
                  📲 Trimite link magic pe WhatsApp
                </a>
              )}
              {getUnpaid(selectedStudent.id) > 0 && (
                <button className="submit-btn" style={{marginTop:12}} onClick={() => { markAllPaid(selectedStudent.id); setSelectedStudent(null); }}>
                  ✓ Marchează toate plătite ({getUnpaid(selectedStudent.id) * LESSON_PRICE} RON)
                </button>
              )}
              <div style={{fontFamily:"var(--display)",fontSize:15,fontWeight:700,margin:"16px 0 10px"}}>Lecții</div>
              {getStudentLessons(selectedStudent.id).length === 0
                ? <div className="empty" style={{padding:"10px 0"}}>Nicio lecție</div>
                : getStudentLessons(selectedStudent.id).slice(0, 10).map(l => (
                  <div className="lesson-row" key={l.id}>
                    <div className={`lesson-dot ${l.paid?"paid":"unpaid"}`} />
                    <div className="lesson-info">
                      <div className="lesson-date">{l.date}</div>
                      <div className="lesson-note">{l.notes || "—"}</div>
                    </div>
                    {!l.paid && <button className="pay-btn" onClick={() => markLessonPaid(l.id)}>Plătit</button>}
                  </div>
                ))
              }
              <button className="submit-btn" style={{marginTop:16,background:"var(--surface2)",color:"var(--text)",border:"1px solid var(--border)"}}
                onClick={() => { setNewLesson({...newLesson, student_id: selectedStudent.id}); setSelectedStudent(null); setShowAddLesson(true); }}>
                + Lecție nouă
              </button>
              <button className="cancel-btn" onClick={() => setSelectedStudent(null)}>Închide</button>
            </div>
          </div>
        )}

        {/* Modal: Add student */}
        {showAddStudent && (
          <div className="modal-overlay" onClick={() => setShowAddStudent(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div className="modal-title">Elev nou</div>
              <div className="field"><label>Nume complet</label>
                <input value={newStudent.name} onChange={e => setNewStudent({...newStudent,name:e.target.value})} placeholder="ex: Ion Popescu" />
              </div>
              <div className="field"><label>Instrument</label>
                <select value={newStudent.instrument} onChange={e => setNewStudent({...newStudent,instrument:e.target.value})}>
                  <option>Chitară</option><option>Pian</option>
                </select>
              </div>
              <div className="field"><label>Nivel</label>
                <select value={newStudent.level} onChange={e => setNewStudent({...newStudent,level:e.target.value})}>
                  <option value="beginner">🌱 Începător</option>
                  <option value="intermediate">🌿 Intermediar</option>
                  <option value="advanced">🌳 Avansat</option>
                </select>
              </div>
              <div className="field"><label>Telefon WhatsApp</label>
                <input value={newStudent.phone} onChange={e => setNewStudent({...newStudent,phone:e.target.value})} placeholder="07xx xxx xxx" />
              </div>
              <button className="submit-btn" onClick={addStudent} disabled={saving}>
                {saving ? "Se salvează..." : "Adaugă elev"}
              </button>
              <button className="cancel-btn" onClick={() => setShowAddStudent(false)}>Anulează</button>
            </div>
          </div>
        )}

        {/* Modal: Add lesson */}
        {showAddLesson && (
          <div className="modal-overlay" onClick={() => setShowAddLesson(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div className="modal-title">Lecție nouă</div>
              <div className="field"><label>Elev</label>
                <select value={newLesson.student_id} onChange={e => setNewLesson({...newLesson,student_id:e.target.value})}>
                  <option value="">Selectează...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Data</label>
                <input type="date" value={newLesson.date} onChange={e => setNewLesson({...newLesson,date:e.target.value})} />
              </div>
              <div className="field"><label>Ce am predat</label>
                <textarea value={newLesson.notes} onChange={e => setNewLesson({...newLesson,notes:e.target.value})} placeholder="ex: Acorduri Bm, F#m — tranziții la 60 BPM..." />
              </div>
              <div className="field"><label>Preț (RON)</label>
                <input type="number" value={newLesson.price} onChange={e => setNewLesson({...newLesson,price:parseInt(e.target.value)})} />
              </div>
              <button className="submit-btn" onClick={addLesson} disabled={saving}>
                {saving ? "Se salvează..." : "Salvează lecția"}
              </button>
              <button className="cancel-btn" onClick={() => setShowAddLesson(false)}>Anulează</button>
            </div>
          </div>
        )}

        {/* Modal: Add material */}
        {showAddMaterial && (
          <div className="modal-overlay" onClick={() => setShowAddMaterial(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div className="modal-title">Material nou</div>
              <div className="field"><label>Tip</label>
                <select value={newMat.type} onChange={e => setNewMat({...newMat,type:e.target.value})}>
                  <option value="youtube">▶️ YouTube</option>
                  <option value="pdf">📄 PDF</option>
                  <option value="personal">🎬 Clipul meu</option>
                </select>
              </div>
              <div className="field"><label>Titlu</label>
                <input value={newMat.title} onChange={e => setNewMat({...newMat,title:e.target.value})} placeholder="ex: Acorduri de bază chitară" />
              </div>
              {newMat.type === "youtube" && (
                <div className="field"><label>Link YouTube</label>
                  <input value={newMat.url} onChange={e => setNewMat({...newMat,url:e.target.value})} placeholder="https://youtube.com/watch?v=..." />
                </div>
              )}
              <div className="field"><label>Descriere</label>
                <textarea value={newMat.description} onChange={e => setNewMat({...newMat,description:e.target.value})} placeholder="Ce conține, pentru cine e..." />
              </div>
              <button className="submit-btn" onClick={addMaterial} disabled={saving}>
                {saving ? "Se salvează..." : "Adaugă în bibliotecă"}
              </button>
              <button className="cancel-btn" onClick={() => setShowAddMaterial(false)}>Anulează</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
