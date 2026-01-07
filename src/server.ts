/**
 * SuperSDR - Servidor Express
 * 
 * Servidor HTTP para desenvolvimento e testes locais.
 * Execute com: npm run dev
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebhookHandler } from './handlers/WebhookHandler';
import { RequestContext } from './types';

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'supersdr_verify';

const webhookHandler = new WebhookHandler();

/**
 * Extrai query params da URL
 */
function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  
  if (queryStart === -1) return params;
  
  const queryString = url.slice(queryStart + 1);
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  
  return params;
}

/**
 * Lê body da requisição
 */
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        resolve(body);
      }
    });
    
    req.on('error', reject);
  });
}

/**
 * Envia resposta JSON
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

/**
 * Handler principal
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';
  const method = req.method || 'GET';
  
  console.log(`[Server] ${method} ${url}`);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Health check
  if (url === '/health' || url === '/') {
    sendJson(res, 200, { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
    return;
  }

  // Webhook endpoint
  if (url.startsWith('/webhook')) {
    const queryParams = parseQueryParams(url);
    const headers = req.headers as Record<string, string>;
    
    // GET - Verificação (Meta)
    if (method === 'GET') {
      const result = webhookHandler.handleVerification(
        { headers, queryParams, body: null, timestamp: Date.now() },
        VERIFY_TOKEN
      );
      
      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(result.challenge);
      } else {
        sendJson(res, 403, { error: result.error });
      }
      return;
    }
    
    // POST - Webhook
    if (method === 'POST') {
      try {
        const body = await readBody(req);
        
        const context: RequestContext = {
          headers,
          queryParams,
          body,
          timestamp: Date.now()
        };
        
        const result = await webhookHandler.handleWebhook(context);
        sendJson(res, result.success ? 200 : 400, result);
      } catch (error) {
        console.error('[Server] Erro:', error);
        sendJson(res, 500, { 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      return;
    }
  }

  // 404
  sendJson(res, 404, { error: 'Not found' });
}

// Cria e inicia servidor
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   SuperSDR Webhook Normalizer                                ║
║                                                              ║
║   Servidor rodando em: http://localhost:${PORT}               ║
║                                                              ║
║   Endpoints:                                                 ║
║   - GET  /health          Health check                       ║
║   - GET  /webhook         Verificação (Meta)                 ║
║   - POST /webhook         Receber webhook                    ║
║                                                              ║
║   Provedores suportados:                                     ║
║   - Meta Cloud API                                           ║
║   - Evolution API                                            ║
║   - Z-API                                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Encerrando...');
  server.close(() => {
    console.log('[Server] Encerrado');
    process.exit(0);
  });
});
