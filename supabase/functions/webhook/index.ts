/**
 * SuperSDR - Supabase Edge Function
 * 
 * Entry point para deploy no Supabase Edge Functions.
 * Este arquivo pode ser copiado para supabase/functions/webhook/index.ts
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { adapterRegistry } from './src/core/AdapterRegistry.ts';
import { messageService } from './src/services/MessageService.ts';
import { llmService } from './src/services/LLMService.ts';

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Handler principal da Edge Function
 */
serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  try {
    // GET - Verificação de webhook (usado pela Meta)
    if (req.method === 'GET') {
      return handleVerification(url);
    }

    // POST - Recebimento de webhook
    if (req.method === 'POST') {
      return await handleWebhook(req);
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[EdgeFunction] Erro:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/**
 * Verifica webhook (GET) - usado pela Meta
 */
function handleVerification(url: URL): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  
  const verifyToken = Deno.env.get('WEBHOOK_VERIFY_TOKEN') || 'supersdr_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[EdgeFunction] Verificação bem-sucedida');
    return new Response(challenge || '', { 
      status: 200,
      headers: corsHeaders
    });
  }

  return new Response('Forbidden', { 
    status: 403,
    headers: corsHeaders
  });
}

/**
 * Processa webhook (POST)
 */
async function handleWebhook(req: Request): Promise<Response> {
  const body = await req.json();
  
  console.log('[EdgeFunction] Webhook recebido:', {
    timestamp: new Date().toISOString(),
    bodySize: JSON.stringify(body).length
  });

  // Normaliza o payload
  const result = adapterRegistry.normalize(body);

  if (!result.success || !result.message) {
    console.error('[EdgeFunction] Erro na normalização:', result.error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: result.error?.message || 'Normalization failed',
        code: result.error?.code
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  const message = result.message;
  
  console.log('[EdgeFunction] Mensagem normalizada:', {
    id: message.id,
    provider: message.provider,
    direction: message.direction,
    type: message.content.type,
    from: message.from.phoneNumber
  });

  // Salva no banco de dados
  try {
    await messageService.saveMessage(message);
  } catch (dbError) {
    console.error('[EdgeFunction] Erro ao salvar:', dbError);
    // Continua mesmo com erro no banco
  }

  // Classifica com LLM (se for mensagem de entrada com texto)
  let classification = null;
  if (
    message.direction === 'inbound' && 
    message.content.type === 'text' &&
    message.content.text
  ) {
    try {
      classification = await llmService.classifyMessage(message);
      console.log('[EdgeFunction] Classificação:', classification);
    } catch (llmError) {
      console.error('[EdgeFunction] Erro na classificação:', llmError);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      messageId: message.id,
      provider: message.provider,
      classification: classification ? {
        intent: classification.intent,
        sentiment: classification.sentiment,
        shouldAutoReply: classification.shouldAutoReply
      } : null
    }),
    { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
