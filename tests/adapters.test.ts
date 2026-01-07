/**
 * SuperSDR - Testes Unitários
 * 
 * Testes para os adapters de webhook.
 * Execute com: npx vitest run
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaAdapter } from '../src/adapters/MetaAdapter';
import { EvolutionAdapter } from '../src/adapters/EvolutionAdapter';
import { ZApiAdapter } from '../src/adapters/ZApiAdapter';
import { AdapterRegistry } from '../src/core/AdapterRegistry';

// ============================================
// PAYLOADS DE TESTE
// ============================================

const metaPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'PHONE_NUMBER_ID'
        },
        contacts: [{
          profile: { name: 'João Silva' },
          wa_id: '5511988888888'
        }],
        messages: [{
          from: '5511988888888',
          id: 'wamid.HBgNNTUxMTk5OTk5OTk5ORUCABIYFjNFQjBCNkU3',
          timestamp: '1677234567',
          type: 'text',
          text: { body: 'Olá, gostaria de saber mais sobre o produto' }
        }]
      },
      field: 'messages'
    }]
  }]
};

const evolutionPayload = {
  event: 'messages.upsert',
  instance: 'minha-instancia',
  data: {
    key: {
      remoteJid: '5511988888888@s.whatsapp.net',
      fromMe: false,
      id: '3EB0B430B6F8C1D073A0'
    },
    pushName: 'João Silva',
    message: {
      conversation: 'Olá, gostaria de saber mais sobre o produto'
    },
    messageType: 'conversation',
    messageTimestamp: 1677234567
  },
  destination: '5511999999999@s.whatsapp.net',
  date_time: '2024-01-15T10:30:00.000Z',
  sender: '5511988888888@s.whatsapp.net',
  server_url: 'https://sua-evolution-api.com',
  apikey: 'sua-api-key'
};

const zapiPayload = {
  instanceId: 'SUA_INSTANCE_ID',
  messageId: '3EB0B430B6F8C1D073A0',
  phone: '5511988888888',
  fromMe: false,
  momment: 1677234567000,
  status: 'RECEIVED',
  chatName: 'João Silva',
  senderPhoto: 'https://pps.whatsapp.net/...',
  senderName: 'João Silva',
  participantPhone: null,
  photo: 'https://pps.whatsapp.net/...',
  broadcast: false,
  type: 'ReceivedCallback',
  text: {
    message: 'Olá, gostaria de saber mais sobre o produto'
  }
};

// ============================================
// TESTES DO META ADAPTER
// ============================================

describe('MetaAdapter', () => {
  let adapter: MetaAdapter;

  beforeEach(() => {
    adapter = new MetaAdapter();
  });

  describe('canHandle', () => {
    it('deve identificar payload da Meta corretamente', () => {
      expect(adapter.canHandle(metaPayload)).toBe(true);
    });

    it('deve rejeitar payload de outros provedores', () => {
      expect(adapter.canHandle(evolutionPayload)).toBe(false);
      expect(adapter.canHandle(zapiPayload)).toBe(false);
    });

    it('deve rejeitar payloads inválidos', () => {
      expect(adapter.canHandle(null)).toBe(false);
      expect(adapter.canHandle(undefined)).toBe(false);
      expect(adapter.canHandle({})).toBe(false);
      expect(adapter.canHandle({ object: 'other' })).toBe(false);
    });
  });

  describe('validate', () => {
    it('deve validar payload completo', () => {
      expect(adapter.validate(metaPayload)).toBe(true);
    });

    it('deve rejeitar payload sem mensagens', () => {
      const invalid = {
        ...metaPayload,
        entry: [{
          ...metaPayload.entry[0],
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123', phone_number_id: 'abc' }
            },
            field: 'messages'
          }]
        }]
      };
      expect(adapter.validate(invalid)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('deve normalizar mensagem de texto corretamente', () => {
      const result = adapter.normalize(metaPayload);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message?.provider).toBe('meta');
      expect(result.message?.direction).toBe('inbound');
      expect(result.message?.content.type).toBe('text');
      expect(result.message?.content.text).toBe('Olá, gostaria de saber mais sobre o produto');
      expect(result.message?.from.phoneNumber).toBe('5511988888888');
      expect(result.message?.from.name).toBe('João Silva');
    });

    it('deve retornar erro para payload inválido', () => {
      const result = adapter.normalize({ invalid: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_PAYLOAD');
    });
  });
});

// ============================================
// TESTES DO EVOLUTION ADAPTER
// ============================================

describe('EvolutionAdapter', () => {
  let adapter: EvolutionAdapter;

  beforeEach(() => {
    adapter = new EvolutionAdapter();
  });

  describe('canHandle', () => {
    it('deve identificar payload da Evolution corretamente', () => {
      expect(adapter.canHandle(evolutionPayload)).toBe(true);
    });

    it('deve rejeitar payload de outros provedores', () => {
      expect(adapter.canHandle(metaPayload)).toBe(false);
      expect(adapter.canHandle(zapiPayload)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('deve normalizar mensagem corretamente', () => {
      const result = adapter.normalize(evolutionPayload);

      expect(result.success).toBe(true);
      expect(result.message?.provider).toBe('evolution');
      expect(result.message?.direction).toBe('inbound');
      expect(result.message?.content.text).toBe('Olá, gostaria de saber mais sobre o produto');
      expect(result.message?.from.phoneNumber).toBe('5511988888888');
      expect(result.message?.from.name).toBe('João Silva');
    });

    it('deve tratar timestamp em segundos', () => {
      const result = adapter.normalize(evolutionPayload);
      
      // Evolution envia em segundos, deve converter para ms
      expect(result.message?.timestamp).toBeGreaterThan(1000000000000);
    });
  });
});

// ============================================
// TESTES DO Z-API ADAPTER
// ============================================

describe('ZApiAdapter', () => {
  let adapter: ZApiAdapter;

  beforeEach(() => {
    adapter = new ZApiAdapter();
  });

  describe('canHandle', () => {
    it('deve identificar payload da Z-API corretamente', () => {
      expect(adapter.canHandle(zapiPayload)).toBe(true);
    });

    it('deve rejeitar payload de outros provedores', () => {
      expect(adapter.canHandle(metaPayload)).toBe(false);
      expect(adapter.canHandle(evolutionPayload)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('deve normalizar mensagem corretamente', () => {
      const result = adapter.normalize(zapiPayload);

      expect(result.success).toBe(true);
      expect(result.message?.provider).toBe('z-api');
      expect(result.message?.direction).toBe('inbound');
      expect(result.message?.content.text).toBe('Olá, gostaria de saber mais sobre o produto');
      expect(result.message?.from.phoneNumber).toBe('5511988888888');
      expect(result.message?.from.name).toBe('João Silva');
    });

    it('deve usar timestamp já em milissegundos', () => {
      const result = adapter.normalize(zapiPayload);
      
      // Z-API já envia em ms
      expect(result.message?.timestamp).toBe(1677234567000);
    });
  });
});

// ============================================
// TESTES DO ADAPTER REGISTRY
// ============================================

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = AdapterRegistry.getInstance();
    registry.reset();
  });

  describe('identifyProvider', () => {
    it('deve identificar Meta corretamente', () => {
      const result = registry.identifyProvider(metaPayload);
      expect(result.provider).toBe('meta');
      expect(result.confidence).toBe(1);
    });

    it('deve identificar Evolution corretamente', () => {
      const result = registry.identifyProvider(evolutionPayload);
      expect(result.provider).toBe('evolution');
    });

    it('deve identificar Z-API corretamente', () => {
      const result = registry.identifyProvider(zapiPayload);
      expect(result.provider).toBe('z-api');
    });

    it('deve retornar unknown para payload desconhecido', () => {
      const result = registry.identifyProvider({ unknown: true });
      expect(result.provider).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('normalize', () => {
    it('deve normalizar automaticamente detectando o provedor', () => {
      const metaResult = registry.normalize(metaPayload);
      expect(metaResult.success).toBe(true);
      expect(metaResult.message?.provider).toBe('meta');

      const evolutionResult = registry.normalize(evolutionPayload);
      expect(evolutionResult.success).toBe(true);
      expect(evolutionResult.message?.provider).toBe('evolution');

      const zapiResult = registry.normalize(zapiPayload);
      expect(zapiResult.success).toBe(true);
      expect(zapiResult.message?.provider).toBe('z-api');
    });

    it('deve retornar erro para provedor desconhecido', () => {
      const result = registry.normalize({ unknown: true });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_PROVIDER');
    });
  });

  describe('register', () => {
    it('deve permitir registrar novo adapter', () => {
      const customAdapter = {
        provider: 'custom' as any,
        canHandle: (p: unknown) => (p as any)?.custom === true,
        identify: (p: unknown) => ({ provider: 'custom' as any, confidence: 1 }),
        normalize: () => ({ success: true, message: {} as any }),
        validate: () => true
      };

      registry.register(customAdapter);

      expect(registry.getRegisteredProviders()).toContain('custom');
    });
  });
});

// ============================================
// TESTES DE INTEGRAÇÃO
// ============================================

describe('Integração', () => {
  it('deve processar todos os formatos de payload corretamente', () => {
    const registry = AdapterRegistry.getInstance();
    const payloads = [metaPayload, evolutionPayload, zapiPayload];

    for (const payload of payloads) {
      const result = registry.normalize(payload);
      
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      
      // Todos devem ter os campos básicos preenchidos
      expect(result.message?.id).toBeTruthy();
      expect(result.message?.externalId).toBeTruthy();
      expect(result.message?.provider).toBeTruthy();
      expect(result.message?.timestamp).toBeGreaterThan(0);
      expect(result.message?.direction).toBe('inbound');
      expect(result.message?.from.phoneNumber).toBeTruthy();
      
      // Todos têm a mesma mensagem de texto
      expect(result.message?.content.text).toBe(
        'Olá, gostaria de saber mais sobre o produto'
      );
    }
  });
});
