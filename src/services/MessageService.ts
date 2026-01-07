/**
 * SuperSDR - Serviço de Mensagens
 * 
 * Responsável pelas operações de persistência e
 * recuperação de mensagens normalizadas.
 */

import { NormalizedMessage, WebhookProvider, MessageStatus } from '../types';
import { DatabaseClient, getDatabaseClient } from '../database/client';

/**
 * Interface para filtros de busca de mensagens
 */
export interface MessageFilter {
  provider?: WebhookProvider;
  phoneNumber?: string;
  startDate?: Date;
  endDate?: Date;
  direction?: 'inbound' | 'outbound';
  status?: MessageStatus;
  limit?: number;
  offset?: number;
}

/**
 * Serviço para gerenciamento de mensagens
 */
export class MessageService {
  private db: DatabaseClient;

  constructor(db?: DatabaseClient) {
    this.db = db || getDatabaseClient();
  }

  /**
   * Salva uma mensagem normalizada no banco de dados
   * 
   * @param message - Mensagem normalizada
   * @returns ID da mensagem salva
   */
  async saveMessage(message: NormalizedMessage): Promise<string> {
    console.log('[MessageService] Salvando mensagem:', message.id);

    try {
      await this.db.query(
        `INSERT INTO messages (
          id,
          external_id,
          provider,
          instance_id,
          timestamp,
          direction,
          status,
          from_phone,
          from_name,
          from_profile_pic,
          to_phone,
          to_name,
          content_type,
          content_text,
          content_caption,
          content_media_url,
          content_mime_type,
          content_file_name,
          content_location,
          raw_payload,
          metadata,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`,
        [
          message.id,
          message.externalId,
          message.provider,
          message.instanceId,
          new Date(message.timestamp),
          message.direction,
          message.status,
          message.from.phoneNumber,
          message.from.name,
          message.from.profilePicUrl,
          message.to.phoneNumber,
          message.to.name,
          message.content.type,
          message.content.text,
          message.content.caption,
          message.content.mediaUrl,
          message.content.mimeType,
          message.content.fileName,
          message.content.location ? JSON.stringify(message.content.location) : null,
          JSON.stringify(message.rawPayload),
          message.metadata ? JSON.stringify(message.metadata) : null
        ]
      );

      // Atualiza ou cria contato
      await this.upsertContact(message);

      return message.id;
    } catch (error) {
      console.error('[MessageService] Erro ao salvar mensagem:', error);
      throw error;
    }
  }

  /**
   * Atualiza ou cria contato baseado na mensagem
   */
  private async upsertContact(message: NormalizedMessage): Promise<void> {
    const contact = message.direction === 'inbound' ? message.from : message.to;
    
    if (!contact.phoneNumber) return;

    await this.db.query(
      `INSERT INTO contacts (
        phone_number,
        name,
        profile_pic_url,
        last_message_at,
        created_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        profile_pic_url = COALESCE(EXCLUDED.profile_pic_url, contacts.profile_pic_url),
        last_message_at = NOW(),
        updated_at = NOW()`,
      [
        contact.phoneNumber,
        contact.name,
        contact.profilePicUrl
      ]
    );
  }

  /**
   * Busca uma mensagem pelo ID
   * 
   * @param id - ID da mensagem
   * @returns Mensagem ou null se não encontrada
   */
  async getMessageById(id: string): Promise<NormalizedMessage | null> {
    const result = await this.db.query(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return this.rowToMessage(result.rows[0]);
  }

  /**
   * Busca mensagens com filtros
   * 
   * @param filter - Filtros de busca
   * @returns Lista de mensagens
   */
  async getMessages(filter: MessageFilter = {}): Promise<NormalizedMessage[]> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.provider) {
      conditions.push(`provider = $${paramIndex++}`);
      params.push(filter.provider);
    }

    if (filter.phoneNumber) {
      conditions.push(`(from_phone = $${paramIndex} OR to_phone = $${paramIndex})`);
      params.push(filter.phoneNumber);
      paramIndex++;
    }

    if (filter.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filter.endDate);
    }

    if (filter.direction) {
      conditions.push(`direction = $${paramIndex++}`);
      params.push(filter.direction);
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const query = `
      SELECT * FROM messages
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await this.db.query(query, params);
    return (result.rows || []).map(row => this.rowToMessage(row));
  }

  /**
   * Converte row do banco para NormalizedMessage
   */
  private rowToMessage(row: Record<string, unknown>): NormalizedMessage {
    return {
      id: row.id as string,
      externalId: row.external_id as string,
      provider: row.provider as WebhookProvider,
      instanceId: row.instance_id as string,
      timestamp: new Date(row.timestamp as string).getTime(),
      direction: row.direction as 'inbound' | 'outbound',
      status: row.status as MessageStatus,
      from: {
        phoneNumber: row.from_phone as string,
        name: row.from_name as string | null,
        profilePicUrl: row.from_profile_pic as string | undefined
      },
      to: {
        phoneNumber: row.to_phone as string,
        name: row.to_name as string | null
      },
      content: {
        type: row.content_type as NormalizedMessage['content']['type'],
        text: row.content_text as string | undefined,
        caption: row.content_caption as string | undefined,
        mediaUrl: row.content_media_url as string | undefined,
        mimeType: row.content_mime_type as string | undefined,
        fileName: row.content_file_name as string | undefined,
        location: row.content_location 
          ? JSON.parse(row.content_location as string) 
          : undefined
      },
      rawPayload: row.raw_payload 
        ? JSON.parse(row.raw_payload as string) 
        : undefined,
      metadata: row.metadata 
        ? JSON.parse(row.metadata as string) 
        : undefined
    };
  }
}

// Export singleton
export const messageService = new MessageService();
