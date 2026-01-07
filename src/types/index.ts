/**
 * SuperSDR - Sistema de Normalização de Webhooks
 * Definição dos tipos do sistema
 */

// ============================================
// TIPOS NORMALIZADOS (FORMATO INTERNO)
// ============================================

/**
 * Tipos de mensagem suportados pelo sistema
 */
export type MessageType = 
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contact'
  | 'sticker'
  | 'reaction'
  | 'unknown';

/**
 * Direção da mensagem
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Status da mensagem
 */
export type MessageStatus = 
  | 'received'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'pending';

/**
 * Contato normalizado
 */
export interface NormalizedContact {
  /** Número de telefone no formato E.164 (ex: 5511999999999) */
  phoneNumber: string;
  /** Nome do contato (push name do WhatsApp) */
  name: string | null;
  /** URL da foto de perfil (se disponível) */
  profilePicUrl?: string;
}

/**
 * Conteúdo da mensagem normalizado
 */
export interface NormalizedMessageContent {
  /** Tipo da mensagem */
  type: MessageType;
  /** Texto da mensagem (para mensagens de texto) */
  text?: string;
  /** Caption (para mídias) */
  caption?: string;
  /** URL da mídia (se aplicável) */
  mediaUrl?: string;
  /** Mime type da mídia */
  mimeType?: string;
  /** Nome do arquivo (para documentos) */
  fileName?: string;
  /** Dados de localização */
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

/**
 * Mensagem normalizada - formato único interno do SuperSDR
 * Este é o formato que será usado em todo o sistema após a normalização
 */
export interface NormalizedMessage {
  /** ID único interno (gerado pelo sistema) */
  id: string;
  /** ID original da mensagem no provedor */
  externalId: string;
  /** Provedor de origem */
  provider: WebhookProvider;
  /** ID da instância/conta no provedor */
  instanceId: string;
  /** Timestamp da mensagem (Unix timestamp em ms) */
  timestamp: number;
  /** Direção da mensagem */
  direction: MessageDirection;
  /** Status da mensagem */
  status: MessageStatus;
  /** Informações do remetente */
  from: NormalizedContact;
  /** Informações do destinatário */
  to: NormalizedContact;
  /** Conteúdo da mensagem */
  content: NormalizedMessageContent;
  /** Dados brutos do webhook (para debug/auditoria) */
  rawPayload?: unknown;
  /** Metadata adicional */
  metadata?: Record<string, unknown>;
}

// ============================================
// TIPOS DOS PROVEDORES
// ============================================

/**
 * Provedores de webhook suportados
 */
export type WebhookProvider = 
  | 'meta'
  | 'evolution'
  | 'z-api'
  | 'unknown';

/**
 * Resultado da identificação do provedor
 */
export interface ProviderIdentification {
  provider: WebhookProvider;
  confidence: number; // 0-1
}

// ============================================
// TIPOS DO ADAPTER
// ============================================

/**
 * Resultado da normalização
 */
export interface NormalizationResult {
  success: boolean;
  message?: NormalizedMessage;
  error?: NormalizationError;
}

/**
 * Erro de normalização
 */
export interface NormalizationError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Códigos de erro
 */
export type ErrorCode = 
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_PROVIDER'
  | 'MISSING_REQUIRED_FIELD'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_MESSAGE_TYPE'
  | 'PROCESSING_ERROR';

// ============================================
// PAYLOADS DOS PROVEDORES
// ============================================

/**
 * Payload do webhook da Meta (Cloud API)
 */
export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; caption?: string };
          audio?: { id: string; mime_type: string };
          video?: { id: string; mime_type: string; caption?: string };
          document?: { id: string; mime_type: string; filename: string; caption?: string };
          location?: { latitude: number; longitude: number; name?: string; address?: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * Payload do webhook da Evolution API
 */
export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { url?: string; mimetype: string; caption?: string };
      audioMessage?: { url?: string; mimetype: string };
      videoMessage?: { url?: string; mimetype: string; caption?: string };
      documentMessage?: { url?: string; mimetype: string; fileName: string; caption?: string };
      locationMessage?: { degreesLatitude: number; degreesLongitude: number; name?: string; address?: string };
    };
    messageType: string;
    messageTimestamp: number;
  };
  destination: string;
  date_time: string;
  sender: string;
  server_url: string;
  apikey?: string;
}

/**
 * Payload do webhook da Z-API
 */
export interface ZApiWebhookPayload {
  instanceId: string;
  messageId: string;
  phone: string;
  fromMe: boolean;
  momment: number;
  status: string;
  chatName?: string;
  senderPhoto?: string;
  senderName?: string;
  participantPhone?: string | null;
  photo?: string;
  broadcast: boolean;
  type: string;
  text?: { message: string };
  image?: { imageUrl: string; thumbnailUrl?: string; caption?: string; mimeType: string };
  audio?: { audioUrl: string; mimeType: string };
  video?: { videoUrl: string; caption?: string; mimeType: string };
  document?: { documentUrl: string; fileName: string; mimeType: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

// ============================================
// TIPOS DO HANDLER HTTP
// ============================================

/**
 * Resposta do endpoint de webhook
 */
export interface WebhookResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: WebhookProvider;
}

/**
 * Contexto da requisição
 */
export interface RequestContext {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: unknown;
  timestamp: number;
}
