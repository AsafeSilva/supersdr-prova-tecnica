/**
 * SuperSDR - Interface do Adapter de Webhook
 * 
 * Esta interface define o contrato que todos os adapters de provedores
 * devem implementar. Utilizamos o padrão Adapter para normalizar
 * os diferentes formatos de webhook em um formato único interno.
 */

import { 
  NormalizedMessage, 
  NormalizationResult, 
  WebhookProvider,
  ProviderIdentification
} from '../types';

/**
 * Interface base para todos os adapters de webhook
 * 
 * @description
 * Cada provedor de WhatsApp (Meta, Evolution, Z-API, etc) possui seu
 * próprio formato de webhook. O WebhookAdapter define um contrato
 * comum que permite normalizar esses diferentes formatos em uma
 * estrutura única (NormalizedMessage).
 * 
 * @example
 * ```typescript
 * class MeuNovoProviderAdapter implements WebhookAdapter {
 *   provider = 'meu-provider' as WebhookProvider;
 *   
 *   canHandle(payload: unknown): boolean {
 *     // Verifica se o payload é deste provedor
 *   }
 *   
 *   normalize(payload: unknown): NormalizationResult {
 *     // Transforma para o formato normalizado
 *   }
 * }
 * ```
 */
export interface WebhookAdapter {
  /**
   * Identificador do provedor que este adapter suporta
   */
  readonly provider: WebhookProvider;

  /**
   * Verifica se este adapter pode processar o payload recebido
   * 
   * @param payload - Payload bruto recebido do webhook
   * @returns true se este adapter pode processar o payload
   * 
   * @description
   * Este método é usado pelo AdapterRegistry para identificar
   * qual adapter deve ser usado para um determinado payload.
   * A implementação deve verificar características únicas do
   * payload que identificam o provedor.
   */
  canHandle(payload: unknown): boolean;

  /**
   * Identifica o provedor com base no payload
   * 
   * @param payload - Payload bruto recebido do webhook
   * @returns Identificação do provedor com nível de confiança
   */
  identify(payload: unknown): ProviderIdentification;

  /**
   * Normaliza o payload do webhook para o formato interno
   * 
   * @param payload - Payload bruto recebido do webhook
   * @returns Resultado da normalização com a mensagem ou erro
   * 
   * @description
   * Este método é responsável por:
   * 1. Validar a estrutura do payload
   * 2. Extrair os dados relevantes
   * 3. Transformar para o formato NormalizedMessage
   * 4. Retornar erro apropriado em caso de falha
   */
  normalize(payload: unknown): NormalizationResult;

  /**
   * Valida se o payload possui a estrutura mínima necessária
   * 
   * @param payload - Payload bruto recebido do webhook
   * @returns true se o payload é válido para processamento
   */
  validate(payload: unknown): boolean;
}

/**
 * Classe base abstrata com implementações comuns
 * 
 * @description
 * Fornece implementações padrão para métodos comuns,
 * reduzindo duplicação de código entre adapters.
 */
export abstract class BaseWebhookAdapter implements WebhookAdapter {
  abstract readonly provider: WebhookProvider;
  abstract canHandle(payload: unknown): boolean;
  abstract normalize(payload: unknown): NormalizationResult;
  abstract validate(payload: unknown): boolean;

  /**
   * Implementação padrão de identify baseada em canHandle
   */
  identify(payload: unknown): ProviderIdentification {
    return {
      provider: this.canHandle(payload) ? this.provider : 'unknown',
      confidence: this.canHandle(payload) ? 1 : 0
    };
  }

  /**
   * Gera um ID único para a mensagem normalizada
   */
  protected generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Normaliza número de telefone para formato E.164
   * Remove caracteres especiais e prefixos do WhatsApp
   */
  protected normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    
    // Remove sufixos do WhatsApp (@s.whatsapp.net, @c.us, etc)
    let normalized = phone.replace(/@[a-z.]+$/i, '');
    
    // Remove caracteres não numéricos (exceto +)
    normalized = normalized.replace(/[^\d+]/g, '');
    
    // Remove + inicial se houver
    normalized = normalized.replace(/^\+/, '');
    
    return normalized;
  }

  /**
   * Cria um resultado de erro padronizado
   */
  protected createError(
    code: import('../types').ErrorCode,
    message: string,
    details?: unknown
  ): NormalizationResult {
    return {
      success: false,
      error: { code, message, details }
    };
  }

  /**
   * Cria um resultado de sucesso
   */
  protected createSuccess(message: NormalizedMessage): NormalizationResult {
    return {
      success: true,
      message
    };
  }
}
