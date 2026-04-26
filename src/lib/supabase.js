// ── Supabase config ────────────────────────────────────────
export const SUPABASE_URL = "https://crmojukeiljterfrzybm.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNybW9qdWtlaWxqdGVyZnJ6eWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTgzODksImV4cCI6MjA5Mjc5NDM4OX0.CMdjxItLRt-o8aDljdpZM2IhHriEfllgkwUMhO7c5Xo";

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

export const db = {
  async get(table, query = "") {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async patch(table, id, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers: HEADERS,
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },
};

// Upload fișier în Supabase Storage
export async function uploadFile(bucket, path, file) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": file.type,
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export function getPublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export function getYouTubeId(url) {
  const match = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

export function getWhatsAppLink(student, baseUrl = "https://primemusic.vercel.app") {
  const url = `${baseUrl}/elev/${student.magic_token}`;
  const msg = encodeURIComponent(`Bună ${student.name}! 🎵\nAccesează pagina ta Prime Music:\n${url}`);
  const phone = student.phone?.replace(/\D/g, "");
  return phone ? `https://wa.me/${phone}?text=${msg}` : null;
}
