# SuperSDR - Sistema de Normalização de Webhooks

Sistema para recebimento e normalização de webhooks de múltiplos provedores de WhatsApp, desenvolvido como parte do processo seletivo para Desenvolvedor Backend.

## 📋 Índice

- [Descrição](#-descrição)
- [Arquitetura](#-arquitetura)
- [Tecnologias](#-tecnologias)
- [Como Executar](#-como-executar)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Decisões Técnicas](#-decisões-técnicas)
- [Schema do Banco de Dados](#-schema-do-banco-de-dados)
- [Integração com LLM](#-integração-com-llm)
- [Extensibilidade](#-extensibilidade)
- [Testes](#-testes)
- [Uso de IA](#-uso-de-ia)

---

## 📝 Descrição

O SuperSDR Webhook Normalizer é um sistema que recebe webhooks de diferentes provedores de WhatsApp (Meta Cloud API, Evolution API, Z-API) e normaliza os dados para um formato único interno. Isso permite que o restante do sistema trabalhe com uma estrutura consistente, independente do provedor de origem.

### Problema Resolvido

Cada provedor de WhatsApp envia webhooks com formatos completamente diferentes:
- **Meta**: Estrutura aninhada com `entry > changes > value`
- **Evolution**: Formato com `event`, `instance` e `data`
- **Z-API**: Formato flat com campos específicos como `momment` (timestamp)

O sistema normaliza todos esses formatos para uma estrutura única `NormalizedMessage`.

### Funcionalidades Implementadas

- ✅ Recebimento de webhooks via HTTP
- ✅ Identificação automática do provedor
- ✅ Normalização para formato único
- ✅ 3 adapters implementados (Meta, Evolution, Z-API)
- ✅ Tratamento de erros robusto
- ✅ Schema de banco de dados PostgreSQL
- ✅ Integração com LLM para classificação
- ✅ Testes unitários
- ✅ Arquitetura extensível

---

## 🏗 Arquitetura

### Diagrama de Fluxo

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Meta Cloud    │     │  Evolution API  │     │     Z-API       │
│     Webhook     │     │    Webhook      │     │    Webhook      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    Webhook Handler     │
                    │   (HTTP Endpoint)      │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   Adapter Registry     │
                    │  (Provider Detection)  │
                    └───────────┬────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
                    ▼           ▼           ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │   Meta    │ │ Evolution │ │   Z-API   │
            │  Adapter  │ │  Adapter  │ │  Adapter  │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └─────────────┼─────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   NormalizedMessage    │
                    │   (Formato Único)      │
                    └───────────┬────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌─────────────────┐    ┌─────────────────┐
          │  Message Service│    │   LLM Service   │
          │   (Database)    │    │ (Classification)│
          └─────────────────┘    └─────────────────┘
```

### Camadas do Sistema

| Camada | Responsabilidade |
|--------|-----------------|
| **Handlers** | Recebe requisições HTTP, extrai payload |
| **Core** | Registry de adapters, interfaces base |
| **Adapters** | Normalização específica de cada provedor |
| **Services** | Lógica de negócio (persistência, LLM) |
| **Database** | Abstração de acesso a dados |
| **Types** | Definições de tipos TypeScript |

---

## 🛠 Tecnologias

| Tecnologia | Uso |
|------------|-----|
| **TypeScript** | Linguagem principal |
| **Node.js** | Runtime |
| **PostgreSQL** | Banco de dados |
| **Supabase** | Plataforma (opcional) |
| **Vitest** | Framework de testes |
| **OpenAI/Claude** | Integração LLM |

---

## 🚀 Como Executar

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+ (ou conta no Supabase)
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone https://github.com/candidato/supersdr-prova-tecnica.git
cd supersdr-prova-tecnica

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas configurações
```

### Configuração do Banco

```bash
# Execute o schema no PostgreSQL
npm run db:migrate

# Ou cole o conteúdo de src/database/schema.sql no SQL Editor do Supabase
```

### Variáveis de Ambiente

```env
# Banco de dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=supersdr
DB_USER=postgres
DB_PASSWORD=sua_senha

# Webhook
WEBHOOK_VERIFY_TOKEN=seu_token_de_verificacao

# LLM (opcional)
OPENAI_API_KEY=sk-...
# ou
ANTHROPIC_API_KEY=sk-ant-...
```

### Executando

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start

# Testes
npm test
```

### Testando com Postman/Insomnia

```bash
# Endpoint
POST http://localhost:3000/webhook

# Headers
Content-Type: application/json

# Body (exemplo Meta)
{
  "object": "whatsapp_business_account",
  "entry": [...]
}
```

---

## 📁 Estrutura do Projeto

```
supersdr-prova-tecnica/
├── src/
│   ├── adapters/           # Adapters de cada provedor
│   │   ├── MetaAdapter.ts
│   │   ├── EvolutionAdapter.ts
│   │   └── ZApiAdapter.ts
│   ├── core/               # Núcleo do sistema
│   │   ├── WebhookAdapter.ts    # Interface base
│   │   └── AdapterRegistry.ts   # Registry/Factory
│   ├── handlers/           # Handlers HTTP
│   │   └── WebhookHandler.ts
│   ├── services/           # Serviços de negócio
│   │   ├── MessageService.ts
│   │   └── LLMService.ts
│   ├── database/           # Banco de dados
│   │   ├── client.ts
│   │   └── schema.sql
│   ├── types/              # Definições de tipos
│   │   └── index.ts
│   ├── utils/              # Utilitários
│   │   └── helpers.ts
│   └── index.ts            # Entry point
├── tests/                  # Testes
│   └── adapters.test.ts
├── supabase/               # Deploy Supabase
│   └── functions/
│       └── webhook/
│           └── index.ts
├── docs/                   # Documentação
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🎯 Decisões Técnicas

### Pattern Utilizado: Adapter + Registry

Escolhi a combinação dos padrões **Adapter** e **Registry** por:

1. **Adapter Pattern**
   - Cada provedor tem seu próprio "adapter" que implementa uma interface comum
   - Encapsula a complexidade de transformação de cada formato
   - Permite que o sistema trabalhe com uma interface unificada

2. **Registry Pattern**
   - Gerencia dinamicamente os adapters disponíveis
   - Detecta automaticamente qual adapter usar
   - Facilita adição de novos provedores sem modificar código existente

### Por que não outros patterns?

- **Strategy**: Seria válido, mas Adapter descreve melhor a intenção (adaptar interfaces)
- **Chain of Responsibility**: Adiciona complexidade desnecessária para este caso
- **Factory simples**: Não oferece a flexibilidade de registro dinâmico

### Estrutura de Dados Normalizada

A `NormalizedMessage` foi projetada para:
- Conter todos os dados essenciais de qualquer mensagem
- Ser fácil de persistir e consultar
- Preservar dados brutos para debug (`rawPayload`)
- Ser extensível via `metadata`

### Tratamento de Erros

Implementei um sistema de erros tipados com códigos específicos:
- `INVALID_PAYLOAD`: Estrutura básica inválida
- `UNKNOWN_PROVIDER`: Nenhum adapter reconhece o payload
- `MISSING_REQUIRED_FIELD`: Campos obrigatórios ausentes
- `PARSE_ERROR`: Erro durante transformação
- `PROCESSING_ERROR`: Erro genérico de processamento

### Desafios Encontrados

1. **Diferença de timestamps**: Meta envia em segundos, Z-API em milissegundos
   - Solução: Detecção automática e conversão no adapter

2. **Formato de telefone**: Cada provedor usa formato diferente
   - Solução: Função `normalizePhoneNumber` remove sufixos e caracteres

3. **Tipos de mensagem**: Nomenclatura varia entre provedores
   - Solução: Mapeamento para tipos internos padronizados

---

## 💾 Schema do Banco de Dados

### Diagrama ER Simplificado

```
┌─────────────────┐       ┌─────────────────┐
│    contacts     │       │    messages     │
├─────────────────┤       ├─────────────────┤
│ phone_number PK │◄──────│ from_phone FK   │
│ name            │       │ to_phone FK     │
│ profile_pic_url │       │ id PK           │
│ lead_score      │       │ external_id     │
│ lead_status     │       │ provider        │
│ tags[]          │       │ instance_id     │
│ metadata        │       │ timestamp       │
│ created_at      │       │ direction       │
│ updated_at      │       │ status          │
└─────────────────┘       │ content_*       │
                          │ raw_payload     │
                          │ metadata        │
                          │ intent          │
                          │ sentiment       │
                          │ created_at      │
                          └─────────────────┘
```

### Justificativa do Schema

- **Normalização**: Campos de conteúdo separados por tipo (text, media, location)
- **Performance**: Índices em campos mais consultados (timestamp, phone, provider)
- **Auditoria**: `raw_payload` preserva dados originais
- **Extensibilidade**: Campos JSONB para metadata flexível
- **Full-text**: Índice GIN para busca em conteúdo de mensagens

---

## 🤖 Integração com LLM

### Classificação de Mensagens

O `LLMService` classifica mensagens em:

| Intent | Descrição |
|--------|-----------|
| `greeting` | Saudações |
| `inquiry` | Dúvidas sobre produto |
| `pricing` | Perguntas sobre preço |
| `support` | Pedido de suporte |
| `complaint` | Reclamações |
| `purchase_intent` | Intenção de compra |
| `scheduling` | Agendamentos |
| `follow_up` | Acompanhamentos |

### Exemplo de Uso

```typescript
import { llmService } from './services/LLMService';

const classification = await llmService.classifyMessage(normalizedMessage);

console.log(classification);
// {
//   intent: 'inquiry',
//   intentConfidence: 0.92,
//   sentiment: 'neutral',
//   entities: [{ type: 'product', value: 'produto X', confidence: 0.85 }],
//   suggestedResponse: 'Olá! Ficaremos felizes em ajudar...',
//   shouldAutoReply: true
// }
```

### Provedores Suportados

- OpenAI (GPT-4, GPT-4o-mini)
- Anthropic (Claude 3)

---

## 🔌 Extensibilidade

### Adicionando Novo Provedor

Para adicionar um novo provedor (ex: Twilio), basta:

1. **Criar o adapter** em `src/adapters/TwilioAdapter.ts`:

```typescript
import { BaseWebhookAdapter } from '../core/WebhookAdapter';

export class TwilioAdapter extends BaseWebhookAdapter {
  readonly provider = 'twilio' as const;

  canHandle(payload: unknown): boolean {
    // Identifica características únicas do Twilio
    return payload?.AccountSid !== undefined;
  }

  validate(payload: unknown): boolean {
    // Valida estrutura mínima
    return !!(payload?.Body && payload?.From);
  }

  normalize(payload: unknown): NormalizationResult {
    // Transforma para NormalizedMessage
    return {
      success: true,
      message: {
        id: this.generateId(),
        provider: this.provider,
        // ... mapear campos
      }
    };
  }
}
```

2. **Registrar no sistema**:

```typescript
import { adapterRegistry } from './core/AdapterRegistry';
import { TwilioAdapter } from './adapters/TwilioAdapter';

adapterRegistry.register(new TwilioAdapter());
```

**Pronto!** O sistema automaticamente detectará e processará webhooks do Twilio.

### Princípio Open/Closed

O sistema está:
- **Aberto para extensão**: Novos adapters podem ser adicionados
- **Fechado para modificação**: Código existente não precisa mudar

---

## 🧪 Testes

### Executando Testes

```bash
# Todos os testes
npm test

# Com watch mode
npm run test:watch

# Com coverage
npm run test:coverage
```

### Cobertura

Os testes cobrem:
- Identificação de provedores (`canHandle`)
- Validação de payloads (`validate`)
- Normalização de mensagens (`normalize`)
- Registry e detecção automática
- Casos de erro

### Exemplo de Teste

```typescript
describe('MetaAdapter', () => {
  it('deve normalizar mensagem de texto corretamente', () => {
    const adapter = new MetaAdapter();
    const result = adapter.normalize(metaPayload);

    expect(result.success).toBe(true);
    expect(result.message?.provider).toBe('meta');
    expect(result.message?.content.type).toBe('text');
  });
});
```

---

## 🤖 Uso de IA

Este projeto utilizou IA (Claude) como ferramenta de produtividade para:

1. **Estruturação inicial**: Ajudou a definir a arquitetura e organização de pastas
2. **Boilerplate**: Gerou estruturas base que foram adaptadas
3. **Documentação**: Auxiliou na escrita de comentários e README
4. **Revisão**: Identificou potenciais melhorias e edge cases

### Minha contribuição

- Defini a arquitetura e padrões de design
- Revisei e ajustei todo código gerado
- Tomei decisões técnicas sobre trade-offs
- Implementei a lógica específica de cada adapter
- Validei funcionamento com payloads reais

**A IA foi uma ferramenta, não o desenvolvedor.** Cada decisão técnica foi avaliada e adaptada ao contexto do problema.

---

## 📞 Contato

Para dúvidas sobre a implementação:
- **Email**: candidato@email.com
- **GitHub**: github.com/candidato

---

## 📄 Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.
