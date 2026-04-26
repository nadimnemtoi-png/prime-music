import { useState, useEffect } from "react";
import { db, getYouTubeId } from "../lib/supabase.js";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f0f12; --surface: #18181d; --surface2: #22222a;
    --border: rgba(255,255,255,0.08); --accent: #e8c97e; --accent2: #7ec8e3;
    --success: #7ee8a2; --danger: #e87e7e; --text: #f0ede8; --muted: #7a7a8a;
    --display: 'Lora', serif; --body: 'DM Sans', sans-serif;
    --radius: 20px; --radius-sm: 12px;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--body); min-height: 100vh; }
  .app { max-width: 430px; margin: 0 auto; min-height: 100vh; padding-bottom: 40px; }

  /* Hero */
  .hero { background: linear-gradient(160deg, #1a1408, #0f0f12); padding: 52px 24px 28px; position: relative; overflow: hidden; border-bottom: 1px solid var(--border); }
  .hero::before { content: '♪'; position: absolute; right: 16px; top: 8px; font-size: 100px; color: rgba(232,201,126,0.05); line-height: 1; }
  .hero-logo { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; opacity: 0.8; }
  .hero-greeting { font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  .hero-name { font-family: var(--display); font-size: 26px; color: var(--text); font-weight: 700; }
  .hero-meta { font-size: 12px; color: var(--muted); margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; }
  .hero-chip { padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(232,201,126,0.2); background: rgba(232,201,126,0.05); color: var(--accent); font-size: 11px; }

  /* Tabs */
  .tabs { display: flex; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 20; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { flex-shrink: 0; padding: 13px 16px; font-size: 13px; color: var(--muted); cursor: pointer; border: none; background: transparent; font-family: var(--body); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; transition: all 0.2s; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

  /* Content */
  .content { padding: 20px 20px 40px; }
  .section-title { font-family: var(--display); font-size: 17px; font-weight: 700; margin-bottom: 12px; }

  /* Task card */
  .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 12px; }
  .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .task-from { font-size: 11px; color: var(--muted); }
  .task-date { font-size: 11px; color: var(--muted); }
  .task-text { font-size: 14px; line-height: 1.6; color: var(--text); margin-bottom: 12px; }
  .task-pieces { display: flex; flex-wrap: wrap; gap: 6px; }
  .piece-chip { padding: 4px 12px; background: var(--surface2); border-radius: 20px; font-size: 12px; color: var(--accent); border: 1px solid rgba(232,201,126,0.2); }
  .no-task { text-align: center; padding: 30px 0; color: var(--muted); font-size: 14px; }

  /* Upload */
  .upload-section { margin-top: 20px; }
  .upload-box { background: var(--surface); border: 2px dashed rgba(232,201,126,0.25); border-radius: var(--radius); padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; }
  .upload-box:active { border-color: var(--accent); background: rgba(232,201,126,0.03); }
  .upload-icon { font-size: 40px; margin-bottom: 10px; }
  .upload-title { font-size: 15px; font-weight: 600; color: var(--accent); margin-bottom: 4px; }
  .upload-sub { font-size: 12px; color: var(--muted); line-height: 1.5; }
  .upload-btn { margin-top: 16px; display: inline-block; padding: 12px 28px; background: var(--accent); color: #0d0d0f; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; font-family: var(--body); }
  .file-input { display: none; }

  /* Sent recording */
  .sent-card { background: rgba(126,232,162,0.06); border: 1px solid rgba(126,232,162,0.2); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .sent-info { flex: 1; }
  .sent-name { font-size: 13px; font-weight: 500; color: var(--success); }
  .sent-date { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* Feedback bubble */
  .feedback-card { background: rgba(232,201,126,0.05); border: 1px solid rgba(232,201,126,0.15); border-radius: var(--radius-sm); padding: 14px 16px; margin-top: 8px; }
  .feedback-label { font-size: 10px; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; }
  .feedback-text { font-size: 13px; color: var(--text); line-height: 1.6; font-style: italic; }

  /* Progress */
  .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .score-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; }
  .score-name { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
  .score-val { font-family: var(--display); font-size: 24px; font-weight: 700; color: var(--accent); }
  .score-val span { font-size: 13px; color: var(--muted); font-family: var(--body); font-weight: 400; }
  .score-bar { height: 4px; background: var(--surface2); border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), #f5d98a); }
  .trend-up { font-size: 11px; color: var(--success); margin-top: 4px; }
  .trend-same { font-size: 11px; color: var(--muted); margin-top: 4px; }

  /* Materials */
  .mat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 10px; overflow: hidden; }
  .mat-thumb { width: 100%; height: 150px; object-fit: cover; display: block; }
  .mat-thumb-placeholder { width: 100%; height: 120px; display: flex; align-items: center; justify-content: center; font-size: 36px; }
  .mat-body { padding: 12px 14px; }
  .mat-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .mat-instr { font-size: 12px; color: var(--accent); background: rgba(232,201,126,0.08); padding: 8px 10px; border-radius: 8px; border-left: 2px solid var(--accent); line-height: 1.5; margin-bottom: 10px; }
  .mat-open-btn { width: 100%; padding: 10px; border-radius: var(--radius-sm); background: var(--accent); border: none; color: #0d0d0f; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--body); }
  .mat-open-btn.secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); margin-top: 8px; }

  /* History */
  .history-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 8px; }
  .history-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .history-date { font-size: 12px; color: var(--muted); }
  .history-note { font-size: 13px; line-height: 1.5; }
  .history-scores { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .score-pill { padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(232,201,126,0.1); color: var(--accent); border: 1px solid rgba(232,201,126,0.2); }

  /* Video modal */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 100; display: flex; align-items: flex-end; max-width: 430px; margin: 0 auto; }
  .video-modal { background: #000; border-radius: 24px 24px 0 0; padding: 20px 20px 44px; width: 100%; }
  .video-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .video-title-text { font-size: 14px; font-weight: 600; color: #fff; flex: 1; margin-right: 8px; }
  .video-close { background: rgba(255,255,255,0.1); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .video-frame { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 12px; background: #111; }

  /* Empty & loading */
  .empty { text-align: center; padding: 30px; color: var(--muted); font-size: 14px; }
  .loading { text-align: center; padding: 60px 20px; }
  .loading-icon { font-size: 48px; margin-bottom: 16px; }
  .loading-text { color: var(--muted); font-size: 14px; }

  /* Toast */
  .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--success); color: var(--success); padding: 10px 20px; border-radius: 30px; font-size: 13px; z-index: 999; animation: ta 2.5s ease forwards; white-space: nowrap; }
  @keyframes ta { 0%{opacity:0;top:10px} 12%{opacity:1;top:20px} 80%{opacity:1} 100%{opacity:0} }

  /* Not found */
  .not-found { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; gap: 12px; }
  .not-found-icon { font-size: 60px; }
  .not-found-title { font-family: var(--display); font-size: 22px; font-weight: 700; }
  .not-found-sub { font-size: 14px; color: var(--muted); line-height: 1.6; }
`;

// Mock scores pentru demo
const MOCK_SCORES = {
  beginner: [
    { name: "Poziție", current: 8, prev: 7 },
    { name: "Coordonare", current: 7, prev: 6 },
    { name: "Ritm", current: 8, prev: 7 },
    { name: "Repertoriu", current: 6, prev: 6 },
    { name: "Prezență", current: 9, prev: 8 },
  ],
  intermediate: [
    { name: "Tehnică", current: 8, prev: 7 },
    { name: "Ritm", current: 7, prev: 6 },
    { name: "Teorie", current: 6, prev: 5 },
    { name: "Repertoriu", current: 8, prev: 7 },
    { name: "Memorare", current: 7, prev: 7 },
  ],
  advanced: [
    { name: "Tehnică", current: 9, prev: 8 },
    { name: "Creativitate", current: 7, prev: 6 },
    { name: "Expresivitate", current: 8, prev: 7 },
    { name: "Teorie", current: 8, prev: 8 },
    { name: "Repertoriu", current: 9, prev: 8 },
  ],
};

const MOCK_HISTORY = [
  { date: "21 Apr", note: "Tranziții acorduri Bm→F#m la 60 BPM. Progres bun la ritm.", scores: { Ritm: 8, Tehnică: 7 } },
  { date: "14 Apr", note: "Intro Wonderwall — fingerpicking. Mâna dreaptă.", scores: { Ritm: 7, Tehnică: 7 } },
  { date: "7 Apr",  note: "Scale pentatonice Am. Primă improvizație liberă.", scores: { Ritm: 7, Tehnică: 6 } },
];

const LEVELS = { beginner: "🌱 Începător", intermediate: "🌿 Intermediar", advanced: "🌳 Avansat" };

export default function ElevApp({ token }) {
  const [student, setStudent] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState("tema");
  const [toast, setToast] = useState(null);
  const [videoModal, setVideoModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    const load = async () => {
      try {
        // Găsim elevul după magic_token
        const students = await db.get("students", `?magic_token=eq.${token}&select=*`);
        if (!students || students.length === 0) { setNotFound(true); setLoading(false); return; }
        const s = students[0];
        setStudent(s);

        // Lecții și materiale
        const [lessonData, recData] = await Promise.all([
          db.get("lessons", `?student_id=eq.${s.id}&select=*&order=date.desc&limit=10`),
          db.get("recordings", `?student_id=eq.${s.id}&select=*&order=created_at.desc&limit=5`),
        ]);
        setLessons(lessonData);
        setRecordings(recData);

        // Materiale din student_materials
        try {
          const sm = await db.get("student_materials", `?student_id=eq.${s.id}&select=*,material:material_id(*)`);
          setMaterials(sm);
        } catch { setMaterials([]); }
      } catch (e) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    setUploading(true);
    try {
      // În producție: upload la Supabase Storage
      // Deocamdată simulăm
      await new Promise(r => setTimeout(r, 1500));
      await db.post("recordings", {
        student_id: student.id,
        file_name: file.name,
        file_url: null,
        reviewed: false,
      });
      setUploaded(true);
      showToast("🎵 Înregistrare trimisă profesorului!");
    } catch {
      showToast("❌ Eroare la trimitere");
    } finally {
      setUploading(false);
    }
  };

  const lastLesson = lessons[0];
  const scores = MOCK_SCORES[student?.level || "beginner"];
  const avgScore = scores ? Math.round(scores.reduce((s, c) => s + c.current, 0) / scores.length * 10) / 10 : 0;

  if (loading) return (
    <>
      <style>{css}</style>
      <div className="loading">
        <div className="loading-icon">🎵</div>
        <div className="loading-text">Se încarcă pagina ta...</div>
      </div>
    </>
  );

  if (notFound) return (
    <>
      <style>{css}</style>
      <div className="not-found">
        <div className="not-found-icon">🎸</div>
        <div className="not-found-title">Link invalid</div>
        <div className="not-found-sub">
          Acest link nu este valid sau a expirat.<br />
          Contactează profesorul tău pentru un link nou.
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {toast && <div className="toast">{toast}</div>}

        {/* Hero */}
        <div className="hero">
          <div className="hero-logo">Prime Music</div>
          <div className="hero-greeting">Bună, </div>
          <div className="hero-name">{student.name} 🎵</div>
          <div className="hero-meta">
            <span className="hero-chip">{student.instrument}</span>
            <span className="hero-chip">{LEVELS[student.level]}</span>
            <span className="hero-chip">⭐ {avgScore}/10 medie</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            { id: "tema",      label: "📋 Tema" },
            { id: "repetitie", label: "🎙 Repetiție" },
            { id: "progres",   label: "📈 Progres" },
            { id: "materiale", label: "📂 Materiale" },
            { id: "istoric",   label: "🕐 Istoric" },
          ].map(t => (
            <button key={t.id} className={`tab${tab===t.id?" active":""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="content">

          {/* ── TEMA ── */}
          {tab === "tema" && (
            <>
              <div className="section-title">Tema săptămânii</div>
              {lastLesson ? (
                <div className="task-card">
                  <div className="task-header">
                    <span className="task-from">De la profesor</span>
                    <span className="task-date">📅 {lastLesson.date}</span>
                  </div>
                  <div className="task-text">
                    {lastLesson.notes || "Exersează materialele trimise și pregătește-te pentru lecția viitoare."}
                  </div>
                  {lastLesson.notes && (
                    <div className="task-pieces">
                      <span className="piece-chip">🎵 Exersează zilnic</span>
                      <span className="piece-chip">⏱ Min. 15 min/zi</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-task">
                  <div style={{fontSize:32,marginBottom:8}}>📋</div>
                  <div>Nicio temă momentan.</div>
                  <div style={{fontSize:12,marginTop:4}}>Profesorul va adăuga după lecție.</div>
                </div>
              )}

              <div style={{
                background:"rgba(232,201,126,0.05)", border:"1px solid rgba(232,201,126,0.15)",
                borderRadius:"var(--radius-sm)", padding:"12px 14px", marginTop:8,
                fontSize:13, color:"var(--muted)", lineHeight:1.6
              }}>
                💡 <strong style={{color:"var(--accent)"}}>Sfat:</strong> Exersează câte 15 minute pe zi,
                mai degrabă decât o oră o dată pe săptămână. Creierul asimilează mult mai bine în sesiuni scurte și repetate.
              </div>
            </>
          )}

          {/* ── REPETIȚIE ── */}
          {tab === "repetitie" && (
            <>
              <div className="section-title">Trimite repetiția</div>
              <div style={{fontSize:13, color:"var(--muted)", marginBottom:16, lineHeight:1.6}}>
                Înregistrează-te cum cânți tema și trimite profesorului. Vei primi feedback înainte de lecția viitoare.
              </div>

              {!uploaded ? (
                <div className="upload-box" onClick={() => document.getElementById('file-upload').click()}>
                  <div className="upload-icon">{uploading ? "⏳" : "🎸"}</div>
                  <div className="upload-title">{uploading ? "Se trimite..." : "Înregistrare nouă"}</div>
                  <div className="upload-sub">
                    {uploading
                      ? "Așteaptă, se încarcă fișierul..."
                      : "Audio sau video · Filmează-te cum cânți\nApoiapasă pentru a selecta fișierul"}
                  </div>
                  {!uploading && <button className="upload-btn">📤 Selectează fișier</button>}
                  <input id="file-upload" type="file" className="file-input"
                    accept="audio/*,video/*"
                    onChange={handleUpload} />
                </div>
              ) : (
                <div className="sent-card">
                  <div style={{fontSize:28}}>✅</div>
                  <div className="sent-info">
                    <div className="sent-name">Înregistrare trimisă!</div>
                    <div className="sent-date">Profesorul o va asculta și îți va da feedback în curând.</div>
                  </div>
                </div>
              )}

              {/* Feedback anterior */}
              {recordings.filter(r => r.reviewed && r.feedback).length > 0 && (
                <>
                  <div className="section-title" style={{marginTop:16}}>💬 Feedback anterior</div>
                  {recordings.filter(r => r.reviewed && r.feedback).map(r => (
                    <div key={r.id} style={{marginBottom:12}}>
                      <div style={{fontSize:13, color:"var(--muted)", marginBottom:6}}>
                        🎵 {r.file_name} · {new Date(r.created_at).toLocaleDateString("ro-RO")}
                      </div>
                      <div className="feedback-card">
                        <div className="feedback-label">Feedback profesor</div>
                        <div className="feedback-text">"{r.feedback}"</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Demo feedback dacă nu are */}
              {recordings.filter(r => r.reviewed).length === 0 && (
                <div className="feedback-card" style={{marginTop:8}}>
                  <div className="feedback-label">Exemplu feedback</div>
                  <div className="feedback-text">
                    "Ritmul e mult mai stabil față de săptămâna trecută! Lucrează puțin la tranziția Bm→F#m, se aude o mică pauză între acorduri. Altfel, progres excelent!"
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PROGRES ── */}
          {tab === "progres" && (
            <>
              <div className="section-title">Evoluția ta</div>
              <div className="score-grid">
                {scores.map(s => (
                  <div className="score-card" key={s.name}>
                    <div className="score-name">{s.name}</div>
                    <div className="score-val">{s.current}<span>/10</span></div>
                    <div className="score-bar">
                      <div className="score-bar-fill" style={{width:`${s.current*10}%`}} />
                    </div>
                    {s.current > s.prev
                      ? <div className="trend-up">↑ +{s.current-s.prev} față de săpt. trecută</div>
                      : <div className="trend-same">→ Același nivel</div>}
                  </div>
                ))}
              </div>

              <div style={{
                background:"linear-gradient(135deg,rgba(232,201,126,0.06),rgba(232,201,126,0.02))",
                border:"1px solid rgba(232,201,126,0.15)", borderRadius:"var(--radius-sm)",
                padding:"16px", textAlign:"center"
              }}>
                <div style={{fontFamily:"var(--display)",fontSize:32,fontWeight:700,color:"var(--accent)"}}>
                  {avgScore}
                  <span style={{fontSize:16,color:"var(--muted)",fontFamily:"var(--body)",fontWeight:400}}>/10</span>
                </div>
                <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>Medie generală săptămâna aceasta</div>
                <div style={{fontSize:13,color:"var(--text)",marginTop:10,lineHeight:1.5}}>
                  🏆 În ultimele 4 săptămâni ai crescut cu <strong style={{color:"var(--success)"}}>+1.2 puncte</strong> în medie!
                </div>
              </div>
            </>
          )}

          {/* ── MATERIALE ── */}
          {tab === "materiale" && (
            <>
              <div className="section-title">Materialele tale</div>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>
                Trimise de profesorul tău. Urmărește instrucțiunile de lângă fiecare.
              </div>

              {materials.length === 0 ? (
                // Demo materiale dacă nu are
                <>
                  {[
                    { title:"Acorduri de bază – Chitară", type:"youtube", url:"https://www.youtube.com/watch?v=dQw4w9WgXcQ", instr:"Exersează tranziția G→C→D. Tempo 60 BPM minim 10 minute." },
                    { title:"Partitura – Wonderwall", type:"pdf", url:null, instr:"Citește primele 8 măsuri. Nu te grăbi!" },
                  ].map((m, i) => {
                    const ytId = m.type==="youtube" ? getYouTubeId(m.url) : null;
                    return (
                      <div className="mat-card" key={i}>
                        {ytId
                          ? <img className="mat-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt={m.title} />
                          : <div className="mat-thumb-placeholder" style={{background:"var(--surface2)"}}>
                              {m.type==="pdf"?"📄":"🎬"}
                            </div>
                        }
                        <div className="mat-body">
                          <div className="mat-title">{m.title}</div>
                          <div className="mat-instr">📌 {m.instr}</div>
                          {ytId && (
                            <button className="mat-open-btn" onClick={() => setVideoModal(m)}>
                              ▶ Deschide videoclipul
                            </button>
                          )}
                          {m.type==="pdf" && (
                            <button className="mat-open-btn" onClick={() => showToast("📄 PDF se deschide...")}>
                              📄 Deschide partitura
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                materials.map(sm => {
                  const m = sm.material || sm;
                  const ytId = m.type==="youtube" ? getYouTubeId(m.url) : null;
                  return (
                    <div className="mat-card" key={sm.id}>
                      {ytId
                        ? <img className="mat-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt={m.title} />
                        : <div className="mat-thumb-placeholder" style={{background:"var(--surface2)"}}>
                            {m.type==="pdf"?"📄":"🎬"}
                          </div>
                      }
                      <div className="mat-body">
                        <div className="mat-title">{m.title}</div>
                        {sm.instructions && <div className="mat-instr">📌 {sm.instructions}</div>}
                        <button className="mat-open-btn" onClick={() => ytId ? setVideoModal(m) : showToast("Se deschide...")}>
                          {m.type==="youtube" ? "▶ Urmărește" : m.type==="pdf" ? "📄 Deschide" : "▶ Redă"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── ISTORIC ── */}
          {tab === "istoric" && (
            <>
              <div className="section-title">Lecții anterioare</div>
              {lessons.length === 0 ? (
                <>
                  {MOCK_HISTORY.map((h, i) => (
                    <div className="history-card" key={i}>
                      <div className="history-top">
                        <div className="history-date">📅 {h.date}</div>
                        <div className="history-scores">
                          {Object.entries(h.scores).map(([k,v]) => (
                            <span key={k} className="score-pill">{k}: {v}</span>
                          ))}
                        </div>
                      </div>
                      <div className="history-note">{h.note}</div>
                    </div>
                  ))}
                </>
              ) : (
                lessons.map(l => (
                  <div className="history-card" key={l.id}>
                    <div className="history-top">
                      <div className="history-date">📅 {l.date}</div>
                    </div>
                    <div className="history-note">{l.notes || "Lecție fără note"}</div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Video modal */}
        {videoModal && (
          <div className="overlay" onClick={() => setVideoModal(null)}>
            <div className="video-modal" onClick={e => e.stopPropagation()}>
              <div className="video-header">
                <div className="video-title-text">{videoModal.title}</div>
                <button className="video-close" onClick={() => setVideoModal(null)}>✕</button>
              </div>
              {getYouTubeId(videoModal.url) ? (
                <iframe
                  className="video-frame"
                  src={`https://www.youtube.com/embed/${getYouTubeId(videoModal.url)}?autoplay=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="video-frame" style={{display:"flex",alignItems:"center",justifyContent:"center",color:"#666",fontSize:14,flexDirection:"column",gap:8}}>
                  <span style={{fontSize:40}}>🎬</span>
                  <span>Clipul profesorului</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
