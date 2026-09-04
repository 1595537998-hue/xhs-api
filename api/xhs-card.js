import fetch from 'node-fetch';

// 固定的手机 UA（iPhone Safari）
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: '需要提供小红书链接' });
  }

  try {
    // 1. 抓取页面（必须带手机 UA）
    const response = await fetch(url, {
      headers: { 'User-Agent': MOBILE_UA },
      redirect: 'follow' // 默认跟随短链跳转，不用手动处理
    });
    const html = await response.text();

    // 2. 稳健提取 __INITIAL_STATE__（找起始和结束位置，避免正则截断）
    const startMarker = 'window.__INITIAL_STATE__ = ';
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) {
      return res.status(500).json({ error: '未找到 __INITIAL_STATE__' });
    }
    // 从标记末尾开始，找到第一个 }; 注意小红书后面通常跟 ;</script>
    const jsonStart = startIdx + startMarker.length;
    let braceCount = 0;
    let endIdx = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') braceCount++;
      if (html[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    const jsonStr = html.substring(jsonStart, endIdx);
    const data = JSON.parse(jsonStr);

    // 3. 兼容两种数据结构（教程提示的路径）
    let noteData = null;
    // 路径1: note.noteDetailMap
    if (data?.note?.noteDetailMap) {
      const noteId = Object.keys(data.note.noteDetailMap)[0];
      noteData = data.note.noteDetailMap[noteId]?.note;
    }
    // 路径2: noteData.data.noteData
    if (!noteData && data?.noteData?.data?.noteData) {
      noteData = data.noteData.data.noteData;
    }
    // 路径3: noteData.normalNotePreloadData
    if (!noteData && data?.noteData?.normalNotePreloadData) {
      noteData = data.noteData.normalNotePreloadData;
    }

    if (!noteData) {
      return res.status(500).json({ error: '解析笔记数据失败，请检查页面结构' });
    }

    // 4. 处理图片 URL（修复 \u002F 转义 + 补全 https:）
    const imageList = (noteData.imageList || []).map(img => {
      let rawUrl = img.urlDefault || img.url || '';
      rawUrl = rawUrl.replace(/\\u002F/g, '/');
      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      return rawUrl;
    });

    // 5. 组装返回数据（完全对齐教程的字段）
    const result = {
      ok: true,
      note: {
        title: noteData.title || '',
        author: noteData.user?.nickname || '',
        desc: noteData.desc || '',
        images: imageList,          // 字符串数组，方便前端直接用
        imageCount: imageList.length,
        likedCount: noteData.interactInfo?.likedCount || 0,
        commentCount: noteData.interactInfo?.commentCount || 0,
        collectedCount: noteData.interactInfo?.collectedCount || 0,
        // 评论列表（取首屏，如果有）
        comments: (noteData.comments || []).slice(0, 10).map(c => ({
          user: c.user?.nickname || '用户',
          content: c.content || '',
          ipLocation: c.ipLocation || ''
        })),
        url: url
      }
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('抓取错误:', error);
    return res.status(500).json({ error: '抓取失败', details: error.message });
  }
}