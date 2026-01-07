/**
 * SuperSDR - Adapter para Z-API
 * 
 * Este adapter processa webhooks da Z-API, um dos provedores
 * mais populares no mercado brasileiro.
 * Documentação: https://developer.z-api.io/
 */

import { BaseWebhookAdapter } from '../core/WebhookAdapter';
import {
  NormalizationResult,
  NormalizedMessage,
  ZApiWebhookPayload,
  MessageType,
  NormalizedMessageContent
} from '../types';

export class ZApiAdapter extends BaseWebhookAdapter {
  readonly provider = 'z-api' as const;

  /**
   * Verifica se o payload é da Z-API
   * 
   * Características únicas:
   * - Possui campo "instanceId"
   * - Possui campo "messageId"
   * - Possui campo "type" com valor como "ReceivedCallback"
   * - Possui campo "momment" (timestamp com typo proposital da Z-API)
   */
  canHandle(payload: unknown): boolean {
    if (!this.isObject(payload)) return false;
    
    const p = payload as Record<string, unknown>;
    
    return (
      typeof p.instanceId === 'string' &&
      typeof p.messageId === 'string' &&
      typeof p.phone === 'string' &&
      typeof p.momment === 'number'
    );
  }

  /**
   * Valida estrutura mínima do payload da Z-API
   */
  validate(payload: unknown): boolean {
    if (!this.canHandle(payload)) return false;
    
    const p = payload as ZApiWebhookPayload;
    
    try {
      return !!(
        p.instanceId &&
        p.messageId &&
        p.phone &&
        p.momment
      );
    } catch {
      return false;
    }
  }

  /**
   * Normaliza webhook da Z-API para formato interno
   */
  normalize(payload: unknown): NormalizationResult {
    // Validação inicial
    if (!this.canHandle(payload)) {
      return this.createError(
        'INVALID_PAYLOAD',
        'Payload não é um webhook válido da Z-API'
      );
    }

    if (!this.validate(payload)) {
      return this.createError(
        'MISSING_REQUIRED_FIELD',
        'Payload da Z-API não contém campos obrigatórios'
      );
    }

    const p = payload as ZApiWebhookPayload;

    try {
      // Determina direção da mensagem
      const isOutbound = p.fromMe === true;
      
      // Extrai números de telefone
      const contactPhone = this.normalizePhoneNumber(p.phone);
      
      const normalizedMessage: NormalizedMessage = {
        id: this.generateId(),
        externalId: p.messageId,
        provider: this.provider,
        instanceId: p.instanceId,
        timestamp: p.momment, // Z-API já envia em milissegundos
        direction: isOutbound ? 'outbound' : 'inbound',
        status: this.mapStatus(p.status, isOutbound),
        from: {
          phoneNumber: isOutbound ? '' : contactPhone, // Número do business não vem no payload
          name: isOutbound ? null : (p.senderName || p.chatName || null),
          profilePicUrl: p.senderPhoto || p.photo
        },
        to: {
          phoneNumber: isOutbound ? contactPhone : '',
          name: isOutbound ? (p.chatName || null) : null
        },
        content: this.extractContent(p),
        rawPayload: payload,
        metadata: {
          type: p.type,
          broadcast: p.broadcast,
          participantPhone: p.participantPhone
        }
      };

      return this.createSuccess(normalizedMessage);
    } catch (error) {
      return this.createError(
        'PARSE_ERROR',
        'Erro ao processar payload da Z-API',
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Extrai e normaliza o conteúdo da mensagem
   */
  private extractContent(p: ZApiWebhookPayload): NormalizedMessageContent {
    // Mensagem de texto
    if (p.text?.message) {
      return {
        type: 'text',
        text: p.text.message
      };
    }

    // Imagem
    if (p.image) {
      return {
        type: 'image',
        mediaUrl: p.image.imageUrl,
        mimeType: p.image.mimeType,
        caption: p.image.caption
      };
    }

    // Áudio
    if (p.audio) {
      return {
        type: 'audio',
        mediaUrl: p.audio.audioUrl,
        mimeType: p.audio.mimeType
      };
    }

    // Vídeo
    if (p.video) {
      return {
        type: 'video',
        mediaUrl: p.video.videoUrl,
        mimeType: p.video.mimeType,
        caption: p.video.caption
      };
    }

    // Documento
    if (p.document) {
      return {
        type: 'document',
        mediaUrl: p.document.documentUrl,
        mimeType: p.document.mimeType,
        fileName: p.document.fileName,
        caption: p.document.caption
      };
    }

    // Localização
    if (p.location) {
      return {
        type: 'location',
        location: {
          latitude: p.location.latitude,
          longitude: p.location.longitude,
          name: p.location.name,
          address: p.location.address
        }
      };
    }

    // Tipo não identificado
    return {
      type: 'unknown',
      text: `Tipo de mensagem: ${p.type}`
    };
  }

  /**
   * Mapeia status da Z-API para status interno
   */
  private mapStatus(zapiStatus: string, isOutbound: boolean): import('../types').MessageStatus {
    if (!isOutbound) {
      return 'received';
    }

    const statusMap: Record<string, import('../types').MessageStatus> = {
      'RECEIVED': 'received',
      'SENT': 'sent',
      'DELIVERED': 'delivered',
      'READ': 'read',
      'PLAYED': 'read', // Para áudios
      'FAILED': 'failed',
      'PENDING': 'pending'
    };

    return statusMap[zapiStatus?.toUpperCase()] || 'pending';
  }

  /**
   * Type guard para objetos
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
