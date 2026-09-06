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
            endpoint: `${baseUrl}/api/sse/message`
          }
        };
        
        controller.enqueue(
          encoder.encode(`event: endpoint
data: ${JSON.stringify(endpointEvent)}

`)
        );
        
        // 保持连接打开
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive

'));
          } catch (e) {
            clearInterval(keepAlive);
          }
        }, 30000);
        
        // 当连接关闭时清理
        req.signal.addEventListener('abort', () => {
          clearInterval(keepAlive);
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
  
  // 处理客户端消息
  if (req.method === 'POST' && url.pathname === '/api/sse/message') {
    const message = await req.json();
    
    // 处理 initialize 请求
    if (message.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'xhs-mcp-server',
            version: '1.0.0'
          },
          capabilities: {
            tools: {}
          }
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 处理 tools/list 请求
    if (message.method === 'tools/list') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'xhs_get_card',
              description: '获取小红书笔记卡片信息',
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
              description: '获取小红书笔记图片',
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
            }
          ]
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 处理 tools/call 请求
    if (message.method === 'tools/call') {
      const { name, arguments: args } = message.params;
      
      try {
        if (name === 'xhs_get_card') {
          // ✅ 改为 POST 请求，带 JSON body
          const response = await fetch(`${baseUrl}/api/xhs-card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: args.url })
          });
          const data = await response.json();
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ]
            }
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (name === 'xhs_get_images') {
          // ✅ 改为 POST 请求，带 JSON body
          const response = await fetch(`${baseUrl}/api/xhs-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [args.url] })  // 注意这里用 urls 数组，如果你希望只传一个url需要调整，但你的接口原设计是 urls 数组，所以按你的接口格式来
          });
          const data = await response.json();
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ]
            }
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: 'Tool not found'
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: error.message
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 未知方法
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('Method not allowed', { status: 405 });
}
