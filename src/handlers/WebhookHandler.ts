/**
 * SuperSDR - Handler de Webhook HTTP
 * 
 * Responsável por receber requisições HTTP de webhooks,
 * processá-las e retornar respostas apropriadas.
 */

import { adapterRegistry } from '../core/AdapterRegistry';
import { WebhookResponse, RequestContext, NormalizedMessage } from '../types';
import { MessageService } from '../services/MessageService';

/**
 * Handler principal para webhooks HTTP
 * 
 * @description
 * Este handler é agnóstico ao framework HTTP utilizado.
 * Pode ser facilmente integrado com Express, Fastify, Hono,
 * Supabase Edge Functions, etc.
 */
export class WebhookHandler {
  private messageService: MessageService;

  constructor(messageService?: MessageService) {
    this.messageService = messageService || new MessageService();
  }

  /**
   * Processa uma requisição de webhook
   * 
   * @param context - Contexto da requisição HTTP
   * @returns Resposta do processamento
   * 
   * @example
   * ```typescript
   * // Em um endpoint Express
   * app.post('/webhook', async (req, res) => {
   *   const context = {
   *     headers: req.headers,
   *     queryParams: req.query,
   *     body: req.body,
   *     timestamp: Date.now()
   *   };
   *   const response = await handler.handleWebhook(context);
   *   res.status(response.success ? 200 : 400).json(response);
   * });
   * ```
   */
  async handleWebhook(context: RequestContext): Promise<WebhookResponse> {
    const { body, headers } = context;

    // Log para debug
    console.log('[WebhookHandler] Recebendo webhook:', {
      timestamp: new Date(context.timestamp).toISOString(),
      contentType: headers['content-type'],
      bodySize: JSON.stringify(body).length
    });

    // Validação básica
    if (!body) {
      return {
        success: false,
        error: 'Payload vazio ou inválido'
      };
    }

    try {
      // Normaliza o payload usando o registry
      const result = adapterRegistry.normalize(body);

      if (!result.success || !result.message) {
        console.error('[WebhookHandler] Erro na normalização:', result.error);
        return {
          success: false,
          error: result.error?.message || 'Erro desconhecido na normalização',
          provider: adapterRegistry.identifyProvider(body).provider
        };
      }

      // Processa a mensagem normalizada
      await this.processMessage(result.message);

      return {
        success: true,
        messageId: result.message.id,
        provider: result.message.provider
      };
    } catch (error) {
      console.error('[WebhookHandler] Erro no processamento:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno'
      };
    }
  }

  /**
   * Processa a mensagem normalizada
   * 
   * @param message - Mensagem normalizada
   */
  private async processMessage(message: NormalizedMessage): Promise<void> {
    console.log('[WebhookHandler] Processando mensagem:', {
      id: message.id,
      provider: message.provider,
      direction: message.direction,
      type: message.content.type,
      from: message.from.phoneNumber,
      preview: message.content.text?.substring(0, 50)
    });

    // Salva no banco de dados
    await this.messageService.saveMessage(message);

    // Aqui entrariam outras operações:
    // - Classificação com LLM
    // - Disparo de automações
    // - Notificações
    // - etc.
  }

  /**
   * Handler para verificação de webhook (GET)
   * Usado pela Meta para validar o endpoint
   * 
   * @param context - Contexto da requisição
   * @param verifyToken - Token de verificação esperado
   * @returns Challenge se válido, erro se inválido
   */
  handleVerification(
    context: RequestContext,
    verifyToken: string
  ): { success: boolean; challenge?: string; error?: string } {
    const { queryParams } = context;
    
    const mode = queryParams['hub.mode'];
    const token = queryParams['hub.verify_token'];
    const challenge = queryParams['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WebhookHandler] Verificação bem-sucedida');
      return {
        success: true,
        challenge
      };
    }

    console.warn('[WebhookHandler] Verificação falhou:', { mode, token });
    return {
      success: false,
      error: 'Verificação inválida'
    };
  }
}

// Export singleton
export const webhookHandler = new WebhookHandler();
