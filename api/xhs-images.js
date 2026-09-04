import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: '需要提供图片 URL 数组' });
  }

  try {
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url);
          const buffer = await response.buffer();
          const base64 = buffer.toString('base64');
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          
          return {
            success: true,
            data: `data:${contentType};base64,${base64}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      })
    );

    return res.status(200).json({ images: results });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: '下载图片失败', details: error.message });
  }
}
