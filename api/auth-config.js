// Endpoint dezactivat.
// Versiunea anterioara returna ADMIN_EMAIL si ADMIN_PASS in clar, fara
// nicio autentificare, catre oricine deschidea /api/auth-config.
// Nimic din aplicatie nu foloseste acest endpoint — login-ul profesorului
// se face prin Supabase Auth (vezi doLogin in index.html).
// Fisierul poate fi sters complet.
export default function handler(req, res) {
  res.status(404).json({ error: 'Not found' });
}
