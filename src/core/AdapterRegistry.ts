/**
 * SuperSDR - Registry de Adapters
 * 
 * Implementa o padrão Registry/Factory para gerenciamento de adapters.
 * Permite adicionar novos provedores sem modificar código existente.
 * 
 * @example
 * ```typescript
 * // Registrar novo adapter
 * AdapterRegistry.register(new MeuNovoAdapter());
 * 
 * // Usar
 * const result = AdapterRegistry.normalize(webhookPayload);
 * ```
 */

import { WebhookAdapter } from './WebhookAdapter';
import {
  NormalizationResult,
  WebhookProvider,
  ProviderIdentification
} from '../types';

// Import adapters
import { MetaAdapter } from '../adapters/MetaAdapter';
import { EvolutionAdapter } from '../adapters/EvolutionAdapter';
import { ZApiAdapter } from '../adapters/ZApiAdapter';

/**
 * Registry central para gerenciamento de adapters de webhook
 * 
 * @description
 * Esta classe implementa o padrão Registry combinado com Factory,
 * permitindo:
 * - Registro dinâmico de novos adapters
 * - Identificação automática do provedor
 * - Normalização transparente de qualquer formato suportado
 * 
 * Princípios seguidos:
 * - Open/Closed: Aberto para extensão (novos adapters), fechado para modificação
 * - Single Responsibility: Cada adapter tem sua responsabilidade única
 * - Dependency Inversion: Depende de abstrações (WebhookAdapter interface)
 */
export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<WebhookProvider, WebhookAdapter> = new Map();

  /**
   * Construtor privado (Singleton)
   */
  private constructor() {
    // Registra adapters padrão
    this.registerDefaultAdapters();
  }

  /**
   * Obtém instância única do registry (Singleton)
   */
  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  /**
   * Registra adapters padrão do sistema
   */
  private registerDefaultAdapters(): void {
    this.register(new MetaAdapter());
    this.register(new EvolutionAdapter());
    this.register(new ZApiAdapter());
  }

  /**
   * Registra um novo adapter no registry
   * 
   * @param adapter - Instância do adapter a ser registrado
   * @throws Error se já existe adapter para o mesmo provider
   * 
   * @example
   * ```typescript
   * const registry = AdapterRegistry.getInstance();
   * registry.register(new MeuNovoProviderAdapter());
   * ```
   */
  register(adapter: WebhookAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      console.warn(
        `Adapter para provider "${adapter.provider}" já existe. Substituindo...`
      );
    }
    this.adapters.set(adapter.provider, adapter);
  }

  /**
   * Remove um adapter do registry
   * 
   * @param provider - Identificador do provider a remover
   * @returns true se removido, false se não existia
   */
  unregister(provider: WebhookProvider): boolean {
    return this.adapters.delete(provider);
  }

  /**
   * Obtém adapter específico por provider
   * 
   * @param provider - Identificador do provider
   * @returns Adapter ou undefined se não encontrado
   */
  getAdapter(provider: WebhookProvider): WebhookAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Lista todos os providers registrados
   */
  getRegisteredProviders(): WebhookProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Identifica o provedor de um payload
   * 
   * @param payload - Payload bruto do webhook
   * @returns Identificação do provedor com confiança
   * 
   * @description
   * Itera por todos os adapters registrados e retorna
   * o primeiro que conseguir identificar o payload.
   */
  identifyProvider(payload: unknown): ProviderIdentification {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(payload)) {
        return {
          provider: adapter.provider,
          confidence: 1
        };
      }
    }

    return {
      provider: 'unknown',
      confidence: 0
    };
  }

  /**
   * Encontra o adapter apropriado para um payload
   * 
   * @param payload - Payload bruto do webhook
   * @returns Adapter capaz de processar ou undefined
   */
  findAdapter(payload: unknown): WebhookAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(payload)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Normaliza um payload de webhook
   * 
   * @param payload - Payload bruto de qualquer provedor suportado
   * @returns Resultado da normalização
   * 
   * @description
   * Este é o método principal para uso externo. Ele:
   * 1. Identifica automaticamente o provedor
   * 2. Encontra o adapter apropriado
   * 3. Executa a normalização
   * 4. Retorna erro apropriado se não encontrar adapter
   * 
   * @example
   * ```typescript
   * const registry = AdapterRegistry.getInstance();
   * const result = registry.normalize(webhookPayload);
   * 
   * if (result.success) {
   *   console.log('Mensagem:', result.message);
   * } else {
   *   console.error('Erro:', result.error);
   * }
   * ```
   */
  normalize(payload: unknown): NormalizationResult {
    // Validação básica
    if (payload === null || payload === undefined) {
      return {
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Payload não pode ser null ou undefined'
        }
      };
    }

    // Encontra adapter apropriado
    const adapter = this.findAdapter(payload);

    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_PROVIDER',
          message: 'Nenhum adapter registrado pode processar este payload',
          details: {
            registeredProviders: this.getRegisteredProviders(),
            payloadType: typeof payload,
            payloadKeys: this.getPayloadKeys(payload)
          }
        }
      };
    }

    // Executa normalização
    try {
      return adapter.normalize(payload);
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: `Erro ao processar payload com adapter ${adapter.provider}`,
          details: error instanceof Error ? error.message : error
        }
      };
    }
  }

  /**
   * Normaliza com provider específico (bypass da detecção automática)
   * 
   * @param payload - Payload do webhook
   * @param provider - Provider específico a usar
   * @returns Resultado da normalização
   */
  normalizeWithProvider(
    payload: unknown,
    provider: WebhookProvider
  ): NormalizationResult {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_PROVIDER',
          message: `Provider "${provider}" não está registrado`,
          details: { registeredProviders: this.getRegisteredProviders() }
        }
      };
    }

    return adapter.normalize(payload);
  }

  /**
   * Extrai chaves do payload para debug
   */
  private getPayloadKeys(payload: unknown): string[] {
    if (typeof payload === 'object' && payload !== null) {
      return Object.keys(payload);
    }
    return [];
  }

  /**
   * Reseta o registry (útil para testes)
   */
  reset(): void {
    this.adapters.clear();
    this.registerDefaultAdapters();
  }
}

// Export singleton instance
export const adapterRegistry = AdapterRegistry.getInstance();
