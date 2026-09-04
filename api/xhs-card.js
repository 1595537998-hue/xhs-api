import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 只接受 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: '需要提供小红书链接' });
  }

  try {
    // 如果是短链，先解析
    let finalUrl = url;
    if (url.includes('xhslink.cn')) {
      const response = await fetch(url, { redirect: 'manual' });
      const location = response.headers.get('location');
      if (location) {
        finalUrl = location;
      }
    }

    // 抓取页面
    const response = await fetch(finalUrl);
    const html = await response.text();

    // 提取 __INITIAL_STATE__
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?})\s*<\/script>/s);
    
    if (!match) {
      return res.status(500).json({ error: '无法解析小红书内容' });
    }

    const data = JSON.parse(match[1]);
    const noteMap = data.note?.noteDetailMap;

    if (!noteMap) {
      return res.status(500).json({ error: '找不到笔记数据' });
    }

    const noteId = Object.keys(noteMap)[0];
    const note = noteMap[noteId]?.note;

    if (!note) {
      return res.status(500).json({ error: '找不到笔记内容' });
    }

    // 构造返回数据
    const result = {
      title: note.title || '',
      desc: note.desc || '',
      type: note.type, // "normal" 图文 / "video" 视频
      imageList: note.imageList?.map(img => ({
        url: img.urlDefault || img.url,
        width: img.width,
        height: img.height
      })) || [],
      video: note.video ? {
        url: note.video.consumer?.originVideoKey || note.video.media?.stream?.h264?.[0]?.masterUrl,
        width: note.video.consumer?.width,
        height: note.video.consumer?.height
      } : null,
      user: {
        nickname: note.user?.nickname || '',
        avatar: note.user?.avatar || ''
      },
      interactInfo: {
        likedCount: note.interactInfo?.likedCount || 0,
        collectedCount: note.interactInfo?.collectedCount || 0,
        commentCount: note.interactInfo?.commentCount || 0
      }
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: '抓取失败', details: error.message });
  }
}
