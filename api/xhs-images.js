import fetch from 'node-fetch';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

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
      urls.map(async (rawUrl) => {
        try {
          // 补全协议头（如果前端传了 // 开头的）
          let url = rawUrl;
          if (url.startsWith('//')) url = 'https:' + url;

          // 超时控制（10秒）
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(url, {
            headers: { 'User-Agent': MOBILE_UA },
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

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
    console.error('图片下载错误:', error);
    return res.status(500).json({ error: '下载图片失败', details: error.message });
  }
}