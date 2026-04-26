# 🎵 Prime Music — PWA

Aplicație de management pentru școala ta de muzică privată.

## Structura proiectului

```
prime-music/
├── public/
│   ├── manifest.json     ← PWA manifest
│   └── sw.js            ← Service Worker (offline support)
├── src/
│   ├── lib/
│   │   └── supabase.js  ← Conexiune bază de date
│   ├── components/
│   │   └── InstallBanner.jsx ← Banner "Instalează aplicația"
│   ├── pages/
│   │   ├── ProfesorApp.jsx  ← Dashboard profesor
│   │   └── ElevApp.jsx      ← Pagina elevului (link magic)
│   ├── App.jsx          ← Router principal
│   └── main.jsx         ← Entry point
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Pași pentru lansare

### 1. Pregătire bază de date Supabase
- Mergi pe supabase.com → proiectul tău
- SQL Editor → copiază și rulează `prime-music-schema.sql`

### 2. Instalare dependențe locale (opțional, pentru testare)
```bash
npm install
npm run dev
```

### 3. Deploy pe Vercel (GRATUIT)
1. Mergi pe **github.com** → creează cont gratuit
2. Creează un repository nou numit `prime-music`
3. Încarcă toate fișierele
4. Mergi pe **vercel.com** → conectează GitHub
5. Selectează repository-ul → Deploy
6. Aplicația va fi live la: `prime-music.vercel.app`

### 4. Testare link magic elev
După ce adaugi un elev în aplicație:
- Apasă pe elev → "Trimite link magic pe WhatsApp"
- Elevul primește: `prime-music.vercel.app/elev/TOKEN`
- Intră direct în pagina lui, fără parolă

## Rutare

| URL | Cine vede |
|-----|-----------|
| `/` | Dashboard profesor |
| `/elev/:token` | Pagina elevului |

## Tehnologii

- **React 18** + **Vite** — frontend rapid
- **Supabase** — bază de date + auth
- **Vercel** — hosting gratuit
- **PWA** — instalabil pe telefon ca aplicație

## Costuri

| Serviciu | Cost |
|---------|------|
| Vercel hosting | Gratuit |
| Supabase (până la 500MB) | Gratuit |
| Domeniu .vercel.app | Gratuit |
| **Total** | **0 RON/lună** |

Când vrei domeniu propriu (ex: primemusic.ro): ~50 RON/an
