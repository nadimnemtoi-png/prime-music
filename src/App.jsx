import { useState, useEffect } from "react";
import ProfesorApp from "./pages/ProfesorApp.jsx";
import ElevApp from "./pages/ElevApp.jsx";
import InstallBanner from "./components/InstallBanner.jsx";

export default function App() {
  const [route, setRoute] = useState(null);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    // Detect route: /elev/:token or /profesor
    const path = window.location.pathname;
    const elevMatch = path.match(/^\/elev\/(.+)$/);
    if (elevMatch) {
      setRoute({ type: "elev", token: elevMatch[1] });
    } else {
      setRoute({ type: "profesor" });
    }

    // PWA install
    window.addEventListener('pwa-installable', () => setInstallable(true));
  }, []);

  if (!route) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0d0d0f", flexDirection: "column", gap: 16
    }}>
      <div style={{ fontSize: 48 }}>🎵</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: "#7a7a8a", fontSize: 14 }}>
        Se încarcă Prime Music...
      </div>
    </div>
  );

  return (
    <>
      {installable && <InstallBanner />}
      {route.type === "elev"
        ? <ElevApp token={route.token} />
        : <ProfesorApp />
      }
    </>
  );
}
