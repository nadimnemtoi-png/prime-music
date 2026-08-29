// Verificam tokenul de profesor intreband direct Supabase Auth daca e valid —
// mai sigur decat sa verificam noi semnatura, pentru ca Supabase poate semna
// aceste conturi altfel decat token-urile custom de elev.
async function verifyTeacher(SB_URL, SERVICE_KEY, bearer) {
  if (!bearer) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${bearer}` },
    });
    if (!r.ok) return false;
    const user = await r.json();
    return !!(user && user.id);
  } catch (e) {
    return false;
  }
}

// Parcurge recursiv bucket-ul de inregistrari si insumeaza dimensiunea fisierelor
async function getRecordingsBytes(SB_URL, headers, bucket) {
  let total = 0;

  async function listFolder(prefix) {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const res = await fetch(`${SB_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (!res.ok) break;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) break;
      for (const item of items) {
        if (item.id === null || item.id === undefined) {
          // e un "folder" (fara id/metadata) — intram in el
          await listFolder(prefix ? `${prefix}/${item.name}` : item.name);
        } else {
          total += (item.metadata && item.metadata.size) || 0;
        }
      }
      if (items.length < limit) break;
      offset += limit;
    }
  }

  await listFolder('');
  return total;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL || 'https://crmojukeiljterfrzybm.supabase.co';
  const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const isTeacher = await verifyTeacher(SB_URL, SERVICE_KEY, bearer);
  if (!isTeacher) return res.status(401).json({ error: 'Unauthorized' });

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  try {
    const [storageUsedBytes, dbUsedBytes] = await Promise.all([
      getRecordingsBytes(SB_URL, sbHeaders, 'recordings'),
      fetch(`${SB_URL}/rest/v1/rpc/get_db_size`, {
        method: 'POST',
        headers: sbHeaders,
        body: '{}',
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    return res.status(200).json({
      storageUsedBytes,
      storageLimitBytes: 1024 * 1024 * 1024,       // 1 GB — limita planului Free Supabase
      dbUsedBytes: typeof dbUsedBytes === 'number' ? dbUsedBytes : null,
      dbLimitBytes: 500 * 1024 * 1024,              // 500 MB — limita planului Free Supabase
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
