/**
 * SuperSDR - Adapter para Evolution API
 * 
 * Este adapter processa webhooks da Evolution API, uma solução
 * open-source popular para integração com WhatsApp.
 * Documentação: https://doc.evolution-api.com/
 */

import { BaseWebhookAdapter } from '../core/WebhookAdapter';
import {
  NormalizationResult,
  NormalizedMessage,
  EvolutionWebhookPayload,
  MessageType,
  NormalizedMessageContent
} from '../types';

export class EvolutionAdapter extends BaseWebhookAdapter {
  readonly provider = 'evolution' as const;

  /**
   * Verifica se o payload é da Evolution API
   * 
   * Características únicas:
   * - Possui campo "event" (ex: "messages.upsert")
   * - Possui campo "instance" com nome da instância
   * - Estrutura "data" com "key" contendo "remoteJid"
   */
  canHandle(payload: unknown): boolean {
    if (!this.isObject(payload)) return false;
    
    const p = payload as Record<string, unknown>;
    
    return (
      typeof p.event === 'string' &&
      typeof p.instance === 'string' &&
      this.isObject(p.data) &&
      this.isObject((p.data as Record<string, unknown>).key)
    );
  }

  /**
   * Valida estrutura mínima do payload da Evolution
   */
  validate(payload: unknown): boolean {
    if (!this.canHandle(payload)) return false;
    
    const p = payload as EvolutionWebhookPayload;
    
    try {
      // Verifica campos obrigatórios
      return !!(
        p.data?.key?.remoteJid &&
        p.data?.key?.id &&
        p.data?.messageTimestamp !== undefined
      );
    } catch {
      return false;
    }
  }

  /**
   * Normaliza webhook da Evolution para formato interno
   */
  normalize(payload: unknown): NormalizationResult {
    // Validação inicial
    if (!this.canHandle(payload)) {
      return this.createError(
        'INVALID_PAYLOAD',
        'Payload não é um webhook válido da Evolution API'
      );
    }

    if (!this.validate(payload)) {
      return this.createError(
        'MISSING_REQUIRED_FIELD',
        'Payload da Evolution não contém campos obrigatórios (remoteJid, id, messageTimestamp)'
      );
    }

    const p = payload as EvolutionWebhookPayload;

    try {
      // Verifica se é um evento de mensagem
      if (!this.isMessageEvent(p.event)) {
        return this.createError(
          'UNSUPPORTED_MESSAGE_TYPE',
          `Evento não suportado: ${p.event}. Apenas eventos de mensagem são processados.`
        );
      }

      const { data, instance, destination } = p;
      const { key, pushName, message, messageType, messageTimestamp } = data;

      // Extrai número do remetente (remove @s.whatsapp.net)
      const fromPhone = this.normalizePhoneNumber(key.remoteJid);
      
      // Extrai número do destinatário
      const toPhone = this.normalizePhoneNumber(destination || '');

      const normalizedMessage: NormalizedMessage = {
        id: this.generateId(),
        externalId: key.id,
        provider: this.provider,
        instanceId: instance,
        timestamp: this.normalizeTimestamp(messageTimestamp),
        direction: key.fromMe ? 'outbound' : 'inbound',
        status: key.fromMe ? 'sent' : 'received',
        from: {
          phoneNumber: key.fromMe ? toPhone : fromPhone,
          name: key.fromMe ? null : (pushName || null),
          profilePicUrl: undefined
        },
        to: {
          phoneNumber: key.fromMe ? fromPhone : toPhone,
          name: key.fromMe ? (pushName || null) : null
        },
        content: this.extractContent(message, messageType),
        rawPayload: payload,
        metadata: {
          event: p.event,
          serverUrl: p.server_url,
          dateTime: p.date_time
        }
      };

      return this.createSuccess(normalizedMessage);
    } catch (error) {
      return this.createError(
        'PARSE_ERROR',
        'Erro ao processar payload da Evolution API',
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Verifica se o evento é de mensagem
   */
  private isMessageEvent(event: string): boolean {
    const messageEvents = [
      'messages.upsert',
      'messages.update',
      'message.ack',
      'send.message'
    ];
    return messageEvents.includes(event);
  }

  /**
   * Normaliza timestamp (Evolution pode enviar em segundos ou milissegundos)
   */
  private normalizeTimestamp(timestamp: number): number {
    // Se o timestamp for menor que um valor razoável para milissegundos,
    // provavelmente está em segundos
    if (timestamp < 10000000000) {
      return timestamp * 1000;
    }
    return timestamp;
  }

  /**
   * Extrai e normaliza o conteúdo da mensagem
   */
  private extractContent(
    message: EvolutionWebhookPayload['data']['message'],
    messageType: string
  ): NormalizedMessageContent {
    if (!message) {
      return { type: 'unknown' };
    }

    // Mensagem de texto simples
    if (message.conversation) {
      return {
        type: 'text',
        text: message.conversation
      };
    }

    // Mensagem de texto estendida (com preview de link, etc)
    if (message.extendedTextMessage) {
      return {
        type: 'text',
        text: message.extendedTextMessage.text || ''
      };
    }

    // Imagem
    if (message.imageMessage) {
      return {
        type: 'image',
        mediaUrl: message.imageMessage.url,
        mimeType: message.imageMessage.mimetype,
        caption: message.imageMessage.caption
      };
    }

    // Áudio
    if (message.audioMessage) {
      return {
        type: 'audio',
        mediaUrl: message.audioMessage.url,
        mimeType: message.audioMessage.mimetype
      };
    }

    // Vídeo
    if (message.videoMessage) {
      return {
        type: 'video',
        mediaUrl: message.videoMessage.url,
        mimeType: message.videoMessage.mimetype,
        caption: message.videoMessage.caption
      };
    }

    // Documento
    if (message.documentMessage) {
      return {
        type: 'document',
        mediaUrl: message.documentMessage.url,
        mimeType: message.documentMessage.mimetype,
        fileName: message.documentMessage.fileName,
        caption: message.documentMessage.caption
      };
    }

    // Localização
    if (message.locationMessage) {
      return {
        type: 'location',
        location: {
          latitude: message.locationMessage.degreesLatitude,
          longitude: message.locationMessage.degreesLongitude,
          name: message.locationMessage.name,
          address: message.locationMessage.address
        }
      };
    }

    // Tipo não mapeado - usa messageType como fallback
    return {
      type: this.mapMessageType(messageType),
      text: `Conteúdo do tipo: ${messageType}`
    };
  }

  /**
   * Mapeia tipo de mensagem da Evolution para tipo interno
   */
  private mapMessageType(evolutionType: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      'conversation': 'text',
      'extendedTextMessage': 'text',
      'imageMessage': 'image',
      'audioMessage': 'audio',
      'videoMessage': 'video',
      'documentMessage': 'document',
      'locationMessage': 'location',
      'contactMessage': 'contact',
      'stickerMessage': 'sticker',
      'reactionMessage': 'reaction'
    };

    return typeMap[evolutionType] || 'unknown';
  }

  /**
   * Type guard para objetos
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
