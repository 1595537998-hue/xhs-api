// MCP over SSE Server for Vercel
// 部署到 api/sse.js —— Node.js Runtime 版本

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 处理 SSE 连接
  if (req.method === 'GET' && url.pathname === '/api/sse') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 发送 endpoint 事件
    const endpointEvent = {
      jsonrpc: '2.0',
      method: 'endpoint',
      params: {
        endpoint: `https://${req.headers.host}/api/sse`
      }
    };

    res.write(`data: ${JSON.stringify(endpointEvent)}\n\n`);

    // 保持连接
    const keepAlive = setInterval(() => {
      res.write(`: keepalive\n\n`);
    }, 30000);

    // 客户端断开连接时清理
    req.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });

    return;
  }

  // 处理 MCP 消息
  if (req.method === 'POST' && url.pathname === '/api/sse') {
    try {
      const message = req.body;

      // 处理 initialize
      if (message.method === 'initialize') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'xhs-api',
              version: '1.0.0'
            }
          }
        });
      }

      // 处理 tools/list
      if (message.method === 'tools/list') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'xhs_get_card',
                description: '获取小红书笔记的详细信息',
                inputSchema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: '小红书笔记链接' }
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
                      items: { type: 'string' },
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

      // 处理 tools/call
      if (message.method === 'tools/call') {
        const { name, arguments: args } = message.params;
        const baseUrl = `https://${req.headers.host}`;

        try {
          if (name === 'xhs_get_card') {
            const response = await fetch(`${baseUrl}/api/xhs-card`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: args.url })
            });
            const data = await response.json();

            return res.status(200).json({
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
            });
          }

          if (name === 'xhs_get_images') {
            const response = await fetch(`${baseUrl}/api/xhs-images`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: args.urls })
            });
            const data = await response.json();

            return res.status(200).json({
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
            });
          }

          return res.status(400).json({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          });
        } catch (error) {
          return res.status(500).json({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: error.message
            }
          });
        }
      }

      return res.status(400).json({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: `Unknown method: ${message.method}`
        }
      });
    } catch (error) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: `Parse error: ${error.message}`
        }
      });
    }
  }

  res.status(404).json({ error: 'Not Found' });
}
