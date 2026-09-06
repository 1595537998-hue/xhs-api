// MCP over SSE Server for Vercel
// 部署到 api/sse.js

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  
  // 获取当前域名
  const baseUrl = `https://${req.headers.get('host')}`;

  // 处理 SSE 连接
  if (req.method === 'GET' && url.pathname === '/api/sse') {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        // 发送 endpoint 事件
        const endpointEvent = {
          jsonrpc: '2.0',
          method: 'endpoint',
          params: {
            endpoint: `${baseUrl}/api/mcp-message`
          }
        };
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(endpointEvent)}

`));

        // 保持连接（每30秒发送一次）
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive

`));
          } catch (e) {
            clearInterval(keepalive);
          }
        }, 30000);

        // 连接关闭时清理
        req.signal.addEventListener('abort', () => {
          clearInterval(keepalive);
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // 处理客户端消息（通过单独的 POST 请求）
  if (req.method === 'POST' && url.pathname === '/api/mcp-message') {
    try {
      const request = await req.json();
      
      // 初始化响应
      if (request.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'xhs-api-server',
              version: '1.0.0'
            }
          }
        });
      }

      // 列出工具
      if (request.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'xhs_get_card',
                description: '获取小红书笔记的详细信息',
                inputSchema: {
                  type: 'object',
                  properties: {
                    url: {
                      type: 'string',
                      description: '小红书笔记链接'
                    }
                  },
                  required: ['url']
                }
              },
              {
                name: 'xhs_get_images',
                description: '下载小红书笔记的图片并转为 base64',
                inputSchema: {
                  type: 'object',
                  properties: {
                    urls: {
                      type: 'array',
                      items: {
                        type: 'string'
                      },
                      description: '图片 URL 数组'
                    }
                  },
                  required: ['urls']
                }
              }
            ]
          }
        });
      }

      // 调用工具
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;

        if (name === 'xhs_get_card') {
          const response = await fetch(`${baseUrl}/api/xhs-card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: args.url })
          });
          
          const data = await response.json();
          
          return Response.json({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ]
            }
          });
        }

        if (name === 'xhs_get_images') {
          const response = await fetch(`${baseUrl}/api/xhs-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: args.urls })
          });
          
          const data = await response.json();
          
          return Response.json({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ]
            }
          });
        }

        // 未知工具
        return Response.json({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        });
      }

      // 未知方法
      return Response.json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Unknown method: ${request.method}`
        }
      });

    } catch (error) {
      return Response.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: error.message
        }
      });
    }
  }

  return new Response('Not Found', { status: 404 });
}
