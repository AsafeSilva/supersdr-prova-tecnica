/**
 * SuperSDR - Schema do Banco de Dados
 * 
 * Migrations para PostgreSQL
 * 
 * Para executar:
 * - Supabase: Cole no SQL Editor
 * - PostgreSQL local: psql -d supersdr -f schema.sql
 */

-- =====================================================
-- EXTENSÕES
-- =====================================================

-- Habilita extensão para UUIDs (opcional, usamos IDs customizados)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TIPOS ENUM
-- =====================================================

-- Tipos de mensagem suportados
CREATE TYPE message_type AS ENUM (
  'text',
  'image',
  'audio',
  'video',
  'document',
  'location',
  'contact',
  'sticker',
  'reaction',
  'unknown'
);

-- Direção da mensagem
CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

-- Status da mensagem
CREATE TYPE message_status AS ENUM (
  'received',
  'sent',
  'delivered',
  'read',
  'failed',
  'pending'
);

-- Provedores de WhatsApp
CREATE TYPE webhook_provider AS ENUM (
  'meta',
  'evolution',
  'z-api',
  'unknown'
);

-- =====================================================
-- TABELA: contacts
-- Armazena informações dos contatos
-- =====================================================

CREATE TABLE IF NOT EXISTS contacts (
  -- Identificador único (número de telefone normalizado)
  phone_number VARCHAR(20) PRIMARY KEY,
  
  -- Informações do contato
  name VARCHAR(255),
  profile_pic_url TEXT,
  
  -- Dados de classificação (preenchidos pela LLM)
  lead_score INTEGER DEFAULT 0,
  lead_status VARCHAR(50) DEFAULT 'new',
  tags TEXT[], -- Array de tags
  
  -- Metadados
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contacts
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts(last_message_at DESC);

-- =====================================================
-- TABELA: messages
-- Armazena mensagens normalizadas de todos os provedores
-- =====================================================

CREATE TABLE IF NOT EXISTS messages (
  -- Identificadores
  id VARCHAR(50) PRIMARY KEY,
  external_id VARCHAR(255) NOT NULL,
  
  -- Origem
  provider webhook_provider NOT NULL,
  instance_id VARCHAR(255) NOT NULL,
  
  -- Timing
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Direção e status
  direction message_direction NOT NULL,
  status message_status NOT NULL DEFAULT 'pending',
  
  -- Remetente
  from_phone VARCHAR(20) NOT NULL,
  from_name VARCHAR(255),
  from_profile_pic TEXT,
  
  -- Destinatário
  to_phone VARCHAR(20) NOT NULL,
  to_name VARCHAR(255),
  
  -- Conteúdo
  content_type message_type NOT NULL,
  content_text TEXT,
  content_caption TEXT,
  content_media_url TEXT,
  content_mime_type VARCHAR(100),
  content_file_name VARCHAR(255),
  content_location JSONB, -- {latitude, longitude, name, address}
  
  -- Dados brutos (para debug/auditoria)
  raw_payload JSONB,
  
  -- Metadados adicionais
  metadata JSONB DEFAULT '{}',
  
  -- Classificação por LLM
  intent VARCHAR(100),
  intent_confidence DECIMAL(3,2),
  sentiment VARCHAR(20),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider);
CREATE INDEX IF NOT EXISTS idx_messages_from_phone ON messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_messages_to_phone ON messages(to_phone);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id);
CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_id);
CREATE INDEX IF NOT EXISTS idx_messages_intent ON messages(intent);

-- Índice para busca full-text no conteúdo
CREATE INDEX IF NOT EXISTS idx_messages_content_text_gin 
  ON messages USING gin(to_tsvector('portuguese', COALESCE(content_text, '')));

-- =====================================================
-- TABELA: conversations
-- Agrupa mensagens em conversas
-- =====================================================

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(50) PRIMARY KEY,
  
  -- Participantes
  contact_phone VARCHAR(20) NOT NULL REFERENCES contacts(phone_number),
  instance_id VARCHAR(255) NOT NULL,
  provider webhook_provider NOT NULL,
  
  -- Status da conversa
  status VARCHAR(50) DEFAULT 'open',
  assigned_to VARCHAR(255),
  
  -- Contagem de mensagens
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  
  -- Timestamps
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint única para evitar duplicatas
  UNIQUE(contact_phone, instance_id)
);

-- Índices para conversations
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- =====================================================
-- TABELA: webhook_logs
-- Log de todos os webhooks recebidos (para debug)
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_logs (
  id SERIAL PRIMARY KEY,
  
  -- Identificação
  provider webhook_provider,
  instance_id VARCHAR(255),
  
  -- Payload
  payload JSONB NOT NULL,
  headers JSONB,
  
  -- Resultado do processamento
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  message_id VARCHAR(50),
  
  -- Timing
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Índice para webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received ON webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);

-- =====================================================
-- TABELA: llm_classifications
-- Histórico de classificações feitas pela LLM
-- =====================================================

CREATE TABLE IF NOT EXISTS llm_classifications (
  id SERIAL PRIMARY KEY,
  
  -- Referência à mensagem
  message_id VARCHAR(50) REFERENCES messages(id),
  
  -- Resultado da classificação
  intent VARCHAR(100),
  intent_confidence DECIMAL(3,2),
  sentiment VARCHAR(20),
  entities JSONB, -- Entidades extraídas
  suggested_response TEXT,
  
  -- Metadados
  model_used VARCHAR(50),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para llm_classifications
CREATE INDEX IF NOT EXISTS idx_llm_classifications_message 
  ON llm_classifications(message_id);

-- =====================================================
-- FUNÇÕES E TRIGGERS
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para messages
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para contacts
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para conversations
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS
-- =====================================================

-- View para últimas mensagens por contato
CREATE OR REPLACE VIEW latest_messages_by_contact AS
SELECT DISTINCT ON (from_phone)
  m.*,
  c.name as contact_name,
  c.lead_status,
  c.lead_score
FROM messages m
LEFT JOIN contacts c ON m.from_phone = c.phone_number
WHERE m.direction = 'inbound'
ORDER BY m.from_phone, m.timestamp DESC;

-- View para métricas diárias
CREATE OR REPLACE VIEW daily_metrics AS
SELECT
  DATE(timestamp) as date,
  provider,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
  COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
  COUNT(DISTINCT from_phone) as unique_contacts
FROM messages
GROUP BY DATE(timestamp), provider
ORDER BY date DESC;

-- =====================================================
-- DADOS DE EXEMPLO (opcional)
-- =====================================================

-- Descomente para inserir dados de teste
/*
INSERT INTO contacts (phone_number, name, lead_status) VALUES
  ('5511999999999', 'João Silva', 'qualified'),
  ('5511988888888', 'Maria Santos', 'new');
*/
