/**
 * SuperSDR - Sistema de Normalização de Webhooks
 * 
 * Ponto de entrada principal do sistema.
 * Exporta todos os módulos públicos.
 */

// Core
export { WebhookAdapter, BaseWebhookAdapter } from './core/WebhookAdapter';
export { AdapterRegistry, adapterRegistry } from './core/AdapterRegistry';

// Adapters
export { MetaAdapter } from './adapters/MetaAdapter';
export { EvolutionAdapter } from './adapters/EvolutionAdapter';
export { ZApiAdapter } from './adapters/ZApiAdapter';

// Handlers
export { WebhookHandler, webhookHandler } from './handlers/WebhookHandler';

// Services
export { MessageService, messageService } from './services/MessageService';
export { LLMService, llmService } from './services/LLMService';

// Database
export { getDatabaseClient, setDatabaseClient } from './database/client';
export type { DatabaseClient, QueryResult } from './database/client';

// Types
export * from './types';

// Utilitários
export { normalizeWebhook, identifyProvider, isValidWebhookPayload } from './utils/helpers';
