import { useState } from "react";

export default function InstallBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", bottom: 80, left: 16, right: 16,
      background: "#1e1e24", border: "1px solid rgba(232,201,126,0.3)",
      borderRadius: 16, padding: "14px 16px", zIndex: 200,
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontSize: 32, flexShrink: 0 }}>🎵</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#f0ede8" }}>
          Instalează Prime Music
        </div>
        <div style={{ fontSize: 12, color: "#7a7a8a", marginTop: 2 }}>
          Adaugă pe ecranul principal pentru acces rapid
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <button onClick={async () => { await window.installPWA?.(); setVisible(false); }}
          style={{
            padding: "7px 14px", borderRadius: 20, background: "#e8c97e",
            border: "none", color: "#0d0d0f", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>
          Instalează
        </button>
        <button onClick={() => setVisible(false)}
          style={{
            padding: "5px", background: "none", border: "none",
            color: "#7a7a8a", fontSize: 11, cursor: "pointer"
          }}>
          Nu acum
        </button>
      </div>
    </div>
  );
}
