export const config = {
  runtime: 'edge',
};

// MCP 协议常量
const JSONRPC_VERSION = '2.0';
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'xhs-api';
const SERVER_VERSION = '1.0.0';

// 工具定义
const TOOLS = [
  {
    name: 'xhs_get_note',
    description: '获取小红书笔记的详细内容，包括标题、作者、正文、图片等',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '小红书笔记链接（完整的 URL）'
        }
      },
      required: ['url']
    }
  }
];

export default async function handler(req) {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control'
      }
    });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // SSE 头
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      function send(data) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      }

      function sendEndpoint() {
        send({
          jsonrpc: JSONRPC_VERSION,
          method: 'endpoint',
          params: { endpoint: '/api/sse' }
        });
      }

      try {
        // 1. 发送 endpoint
        sendEndpoint();

        // 2. 等客户端的消息（从 POST body 读）
        if (req.method === 'POST') {
          const body = await req.json();
          
          if (body.method === 'initialize') {
            // 返回服务器能力
            send({
              jsonrpc: JSONRPC_VERSION,
              id: body.id,
              result: {
                protocolVersion: PROTOCOL_VERSION,
                serverInfo: {
                  name: SERVER_NAME,
                  version: SERVER_VERSION
                },
                capabilities: {
                  tools: {}
                }
              }
            });
          } else if (body.method === 'tools/list') {
            // 返回工具列表
            send({
              jsonrpc: JSONRPC_VERSION,
              id: body.id,
              result: { tools: TOOLS }
            });
          } else if (body.method === 'tools/call') {
            // 调用工具
            const { name, arguments: args } = body.params;
            
            if (name === 'xhs_get_note') {
              try {
                // 调用你的 /api/xhs-card
                const baseUrl = req.headers.get('host') || 'xhs-api-opal.vercel.app';
                const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
                
                const cardRes = await fetch(`${protocol}://${baseUrl}/api/xhs-card`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: args.url })
                });
                
                const cardData = await cardRes.json();
                
                if (!cardData.ok) {
                  throw new Error(cardData.error || '获取笔记失败');
                }
                
                // 下载图片转 base64
                let images = [];
                if (cardData.note.images && cardData.note.images.length > 0) {
                  const imgRes = await fetch(`${protocol}://${baseUrl}/api/xhs-images`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: cardData.note.images })
                  });
                  
                  const imgData = await imgRes.json();
                  images = imgData.images.filter(img => img.success).map(img => img.data);
                }
                
                // 返回结果
                send({
                  jsonrpc: JSONRPC_VERSION,
                  id: body.id,
                  result: {
                    content: [
                      {
                        type: 'text',
                        text: `# ${cardData.note.title}\n\n**作者**: ${cardData.note.author}\n\n${cardData.note.desc}\n\n**数据**: 👍 ${cardData.note.likedCount} | 💬 ${cardData.note.commentCount} | ⭐ ${cardData.note.collectedCount}`
                      },
                      ...images.map(base64 => ({
                        type: 'image',
                        data: base64.split(',')[1],
                        mimeType: base64.match(/data:(.*?);/)[1]
                      }))
                    ]
                  }
                });
              } catch (error) {
                send({
                  jsonrpc: JSONRPC_VERSION,
                  id: body.id,
                  error: {
                    code: -32603,
                    message: error.message
                  }
                });
              }
            } else {
              send({
                jsonrpc: JSONRPC_VERSION,
                id: body.id,
                error: {
                  code: -32601,
                  message: `Unknown tool: ${name}`
                }
              });
            }
          } else {
            send({
              jsonrpc: JSONRPC_VERSION,
              id: body.id,
              error: {
                code: -32601,
                message: `Unknown method: ${body.method}`
              }
            });
          }
        }
        
        controller.close();
      } catch (error) {
        console.error('SSE error:', error);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
