/**
 * SuperSDR - Serviço de Integração com LLM
 * 
 * Responsável pela classificação de mensagens e geração
 * de respostas automáticas usando LLMs (OpenAI, Claude).
 */

import { NormalizedMessage } from '../types';

/**
 * Intenções que a LLM pode classificar
 */
export type MessageIntent =
  | 'greeting'           // Saudação
  | 'inquiry'            // Dúvida sobre produto/serviço
  | 'pricing'            // Pergunta sobre preço
  | 'support'            // Pedido de suporte
  | 'complaint'          // Reclamação
  | 'purchase_intent'    // Intenção de compra
  | 'scheduling'         // Agendamento
  | 'follow_up'          // Acompanhamento
  | 'spam'               // Spam/irrelevante
  | 'other';             // Outros

/**
 * Sentimentos detectados
 */
export type MessageSentiment = 'positive' | 'neutral' | 'negative';

/**
 * Resultado da classificação
 */
export interface ClassificationResult {
  intent: MessageIntent;
  intentConfidence: number;
  sentiment: MessageSentiment;
  entities: ExtractedEntity[];
  suggestedResponse?: string;
  shouldAutoReply: boolean;
}

/**
 * Entidade extraída da mensagem
 */
export interface ExtractedEntity {
  type: 'product' | 'date' | 'time' | 'name' | 'phone' | 'email' | 'location' | 'price';
  value: string;
  confidence: number;
}

/**
 * Configuração do serviço LLM
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Serviço de integração com LLM
 */
export class LLMService {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      provider: config?.provider || 'openai',
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY || '',
      model: config?.model || 'gpt-4o-mini',
      maxTokens: config?.maxTokens || 500,
      temperature: config?.temperature || 0.3
    };
  }

  /**
   * Classifica uma mensagem usando LLM
   * 
   * @param message - Mensagem normalizada
   * @returns Resultado da classificação
   */
  async classifyMessage(message: NormalizedMessage): Promise<ClassificationResult> {
    const text = message.content.text || message.content.caption || '';
    
    if (!text) {
      return this.getDefaultClassification();
    }

    const prompt = this.buildClassificationPrompt(text, message);

    try {
      const response = await this.callLLM(prompt);
      return this.parseClassificationResponse(response);
    } catch (error) {
      console.error('[LLMService] Erro na classificação:', error);
      return this.getDefaultClassification();
    }
  }

  /**
   * Gera uma resposta automática para a mensagem
   * 
   * @param message - Mensagem normalizada
   * @param classification - Classificação prévia (opcional)
   * @returns Texto da resposta sugerida
   */
  async generateResponse(
    message: NormalizedMessage,
    classification?: ClassificationResult
  ): Promise<string> {
    const text = message.content.text || message.content.caption || '';
    
    if (!text) {
      return 'Olá! Como posso ajudar?';
    }

    const prompt = this.buildResponsePrompt(text, message, classification);

    try {
      const response = await this.callLLM(prompt);
      return response;
    } catch (error) {
      console.error('[LLMService] Erro na geração de resposta:', error);
      return 'Obrigado pelo contato! Em breve retornaremos.';
    }
  }

  /**
   * Constrói prompt para classificação
   */
  private buildClassificationPrompt(text: string, message: NormalizedMessage): string {
    return `Analise a seguinte mensagem de WhatsApp e classifique:

MENSAGEM: "${text}"

CONTEXTO:
- Remetente: ${message.from.name || 'Desconhecido'}
- Tipo: ${message.content.type}
- Horário: ${new Date(message.timestamp).toLocaleString('pt-BR')}

Responda APENAS em JSON válido com a seguinte estrutura:
{
  "intent": "<uma das opções: greeting, inquiry, pricing, support, complaint, purchase_intent, scheduling, follow_up, spam, other>",
  "intentConfidence": <número entre 0 e 1>,
  "sentiment": "<positive, neutral ou negative>",
  "entities": [
    {"type": "<product|date|time|name|phone|email|location|price>", "value": "<valor>", "confidence": <0-1>}
  ],
  "suggestedResponse": "<resposta sugerida em português>",
  "shouldAutoReply": <true ou false>
}`;
  }

  /**
   * Constrói prompt para geração de resposta
   */
  private buildResponsePrompt(
    text: string,
    message: NormalizedMessage,
    classification?: ClassificationResult
  ): string {
    const context = classification 
      ? `Intenção detectada: ${classification.intent}\nSentimento: ${classification.sentiment}`
      : '';

    return `Você é um assistente de vendas amigável e profissional.
Gere uma resposta curta e objetiva para a seguinte mensagem de WhatsApp.

MENSAGEM DO CLIENTE: "${text}"
${context}

REGRAS:
- Seja cordial e profissional
- Use português brasileiro informal mas educado
- Resposta deve ter no máximo 2-3 frases
- Não use emojis em excesso (máximo 1-2)
- Se for uma dúvida específica, ofereça ajuda para responder

Responda apenas com o texto da mensagem, sem explicações.`;
  }

  /**
   * Chama a API da LLM
   */
  private async callLLM(prompt: string): Promise<string> {
    if (this.config.provider === 'openai') {
      return this.callOpenAI(prompt);
    } else {
      return this.callAnthropic(prompt);
    }
  }

  /**
   * Chama OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: 'Você é um assistente de classificação e atendimento.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Chama Anthropic API (Claude)
   */
  private async callAnthropic(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-haiku-20240307',
        max_tokens: this.config.maxTokens,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  }

  /**
   * Faz parse da resposta de classificação
   */
  private parseClassificationResponse(response: string): ClassificationResult {
    try {
      // Remove possíveis marcadores de código
      const jsonStr = response.replace(/```json?\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      return {
        intent: parsed.intent || 'other',
        intentConfidence: parsed.intentConfidence || 0.5,
        sentiment: parsed.sentiment || 'neutral',
        entities: parsed.entities || [],
        suggestedResponse: parsed.suggestedResponse,
        shouldAutoReply: parsed.shouldAutoReply ?? false
      };
    } catch (error) {
      console.error('[LLMService] Erro no parse:', error);
      return this.getDefaultClassification();
    }
  }

  /**
   * Retorna classificação padrão para fallback
   */
  private getDefaultClassification(): ClassificationResult {
    return {
      intent: 'other',
      intentConfidence: 0,
      sentiment: 'neutral',
      entities: [],
      shouldAutoReply: false
    };
  }
}

// Export singleton
export const llmService = new LLMService();
