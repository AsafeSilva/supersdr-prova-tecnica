/**
 * SuperSDR - Funções Utilitárias
 * 
 * Helpers e funções auxiliares do sistema.
 */

import { adapterRegistry } from '../core/AdapterRegistry';
import { NormalizationResult, WebhookProvider, ProviderIdentification } from '../types';

/**
 * Normaliza um payload de webhook de qualquer provedor suportado
 * 
 * @param payload - Payload bruto do webhook
 * @returns Resultado da normalização
 * 
 * @example
 * ```typescript
 * const result = normalizeWebhook(webhookBody);
 * if (result.success) {
 *   console.log('Mensagem:', result.message);
 * }
 * ```
 */
export function normalizeWebhook(payload: unknown): NormalizationResult {
  return adapterRegistry.normalize(payload);
}

/**
 * Identifica o provedor de um payload de webhook
 * 
 * @param payload - Payload bruto do webhook
 * @returns Identificação do provedor
 */
export function identifyProvider(payload: unknown): ProviderIdentification {
  return adapterRegistry.identifyProvider(payload);
}

/**
 * Verifica se um payload é válido para algum adapter registrado
 * 
 * @param payload - Payload a verificar
 * @returns true se algum adapter pode processar
 */
export function isValidWebhookPayload(payload: unknown): boolean {
  const adapter = adapterRegistry.findAdapter(payload);
  return adapter !== undefined;
}

/**
 * Normaliza número de telefone para formato E.164
 * 
 * @param phone - Número de telefone em qualquer formato
 * @returns Número normalizado
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove sufixos do WhatsApp
  let normalized = phone.replace(/@[a-z.]+$/i, '');
  
  // Remove caracteres não numéricos
  normalized = normalized.replace(/[^\d]/g, '');
  
  // Garante que números brasileiros tenham código do país
  if (normalized.length === 11 && normalized.startsWith('11')) {
    normalized = '55' + normalized;
  }
  
  return normalized;
}

/**
 * Gera ID único para mensagens
 * 
 * @param prefix - Prefixo opcional
 * @returns ID único
 */
export function generateMessageId(prefix = 'msg'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Formata timestamp para exibição
 * 
 * @param timestamp - Timestamp em milissegundos
 * @returns String formatada
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Trunca texto mantendo palavras inteiras
 * 
 * @param text - Texto a truncar
 * @param maxLength - Comprimento máximo
 * @returns Texto truncado
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/**
 * Verifica se é um objeto válido (não null, não array)
 * 
 * @param value - Valor a verificar
 * @returns true se for objeto válido
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge de objetos
 * 
 * @param target - Objeto alvo
 * @param source - Objeto fonte
 * @returns Objeto mesclado
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}
