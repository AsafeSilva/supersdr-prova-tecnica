/**
 * SuperSDR - Adapter para Meta Cloud API (WhatsApp Business)
 * 
 * Este adapter processa webhooks da API oficial da Meta para WhatsApp Business.
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { BaseWebhookAdapter } from '../core/WebhookAdapter';
import {
  NormalizationResult,
  NormalizedMessage,
  MetaWebhookPayload,
  MessageType,
  MessageDirection,
  MessageStatus,
  NormalizedContact,
  NormalizedMessageContent
} from '../types';

export class MetaAdapter extends BaseWebhookAdapter {
  readonly provider = 'meta' as const;

  /**
   * Verifica se o payload é da Meta Cloud API
   * 
   * Características únicas:
   * - Possui campo "object" com valor "whatsapp_business_account"
   * - Estrutura de "entry" com "changes"
   */
  canHandle(payload: unknown): boolean {
    if (!this.isObject(payload)) return false;
    
    const p = payload as Record<string, unknown>;
    return (
      p.object === 'whatsapp_business_account' &&
      Array.isArray(p.entry) &&
      p.entry.length > 0
    );
  }

  /**
   * Valida estrutura mínima do payload da Meta
   */
  validate(payload: unknown): boolean {
    if (!this.canHandle(payload)) return false;
    
    const p = payload as MetaWebhookPayload;
    
    try {
      const entry = p.entry[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      // Precisa ter messages ou statuses
      return !!(value?.messages?.length || value?.statuses?.length);
    } catch {
      return false;
    }
  }

  /**
   * Normaliza webhook da Meta para formato interno
   */
  normalize(payload: unknown): NormalizationResult {
    // Validação inicial
    if (!this.canHandle(payload)) {
      return this.createError(
        'INVALID_PAYLOAD',
        'Payload não é um webhook válido da Meta Cloud API'
      );
    }

    if (!this.validate(payload)) {
      return this.createError(
        'MISSING_REQUIRED_FIELD',
        'Payload da Meta não contém mensagens ou status updates'
      );
    }

    const p = payload as MetaWebhookPayload;

    try {
      const entry = p.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;
      const metadata = value.metadata;

      // Se for uma mensagem recebida
      if (value.messages && value.messages.length > 0) {
        const msg = value.messages[0];
        const contact = value.contacts?.[0];

        const normalizedMessage: NormalizedMessage = {
          id: this.generateId(),
          externalId: msg.id,
          provider: this.provider,
          instanceId: metadata.phone_number_id,
          timestamp: parseInt(msg.timestamp) * 1000, // Meta envia em segundos
          direction: 'inbound',
          status: 'received',
          from: {
            phoneNumber: this.normalizePhoneNumber(msg.from),
            name: contact?.profile?.name || null,
            profilePicUrl: undefined
          },
          to: {
            phoneNumber: this.normalizePhoneNumber(metadata.display_phone_number),
            name: null
          },
          content: this.extractContent(msg),
          rawPayload: payload,
          metadata: {
            businessAccountId: entry.id,
            phoneNumberId: metadata.phone_number_id
          }
        };

        return this.createSuccess(normalizedMessage);
      }

      // Se for um status update (enviado, entregue, lido)
      if (value.statuses && value.statuses.length > 0) {
        const status = value.statuses[0];

        const normalizedMessage: NormalizedMessage = {
          id: this.generateId(),
          externalId: status.id,
          provider: this.provider,
          instanceId: metadata.phone_number_id,
          timestamp: parseInt(status.timestamp) * 1000,
          direction: 'outbound',
          status: this.mapStatus(status.status),
          from: {
            phoneNumber: this.normalizePhoneNumber(metadata.display_phone_number),
            name: null
          },
          to: {
            phoneNumber: this.normalizePhoneNumber(status.recipient_id),
            name: null
          },
          content: {
            type: 'unknown' // Status updates não têm conteúdo
          },
          rawPayload: payload,
          metadata: {
            isStatusUpdate: true,
            originalStatus: status.status
          }
        };

        return this.createSuccess(normalizedMessage);
      }

      return this.createError(
        'PROCESSING_ERROR',
        'Não foi possível extrair mensagem do payload'
      );
    } catch (error) {
      return this.createError(
        'PARSE_ERROR',
        'Erro ao processar payload da Meta',
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Extrai e normaliza o conteúdo da mensagem
   */
  private extractContent(msg: MetaWebhookPayload['entry'][0]['changes'][0]['value']['messages'][0]): NormalizedMessageContent {
    const type = this.mapMessageType(msg.type);

    switch (msg.type) {
      case 'text':
        return {
          type: 'text',
          text: msg.text?.body || ''
        };

      case 'image':
        return {
          type: 'image',
          mediaUrl: msg.image?.id, // Meta retorna ID, precisa buscar URL via API
          mimeType: msg.image?.mime_type,
          caption: msg.image?.caption
        };

      case 'audio':
        return {
          type: 'audio',
          mediaUrl: msg.audio?.id,
          mimeType: msg.audio?.mime_type
        };

      case 'video':
        return {
          type: 'video',
          mediaUrl: msg.video?.id,
          mimeType: msg.video?.mime_type,
          caption: msg.video?.caption
        };

      case 'document':
        return {
          type: 'document',
          mediaUrl: msg.document?.id,
          mimeType: msg.document?.mime_type,
          fileName: msg.document?.filename,
          caption: msg.document?.caption
        };

      case 'location':
        return {
          type: 'location',
          location: {
            latitude: msg.location?.latitude || 0,
            longitude: msg.location?.longitude || 0,
            name: msg.location?.name,
            address: msg.location?.address
          }
        };

      default:
        return {
          type: 'unknown',
          text: `Tipo não suportado: ${msg.type}`
        };
    }
  }

  /**
   * Mapeia tipo de mensagem da Meta para tipo interno
   */
  private mapMessageType(metaType: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      'text': 'text',
      'image': 'image',
      'audio': 'audio',
      'video': 'video',
      'document': 'document',
      'location': 'location',
      'contacts': 'contact',
      'sticker': 'sticker',
      'reaction': 'reaction'
    };

    return typeMap[metaType] || 'unknown';
  }

  /**
   * Mapeia status da Meta para status interno
   */
  private mapStatus(metaStatus: string): MessageStatus {
    const statusMap: Record<string, MessageStatus> = {
      'sent': 'sent',
      'delivered': 'delivered',
      'read': 'read',
      'failed': 'failed'
    };

    return statusMap[metaStatus] || 'pending';
  }

  /**
   * Type guard para objetos
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
