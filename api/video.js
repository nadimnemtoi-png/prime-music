export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || !url.startsWith('https://crmojukeiljterfrzybm.supabase.co/storage')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNybW9qdWtlaWxqdGVyZnJ6eWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTgzODksImV4cCI6MjA5Mjc5NDM4OX0.CMdjxItLRt-o8aDljdpZM2IhHriEfllgkwUMhO7c5Xo',
      }
    });

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: 'Failed to proxy video' });
  }
}
