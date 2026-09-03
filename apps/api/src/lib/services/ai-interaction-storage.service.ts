import { query } from '../db/postgres-client';

export interface AIInteractionData {
  requestId: string;
  organizationId: string;
  userId: string;
  conversationId?: string;
  sessionId: string;
  userPrompt: string;
  sanitizedPrompt: string;
  aiResponse: string;
  sanitizedResponse: string;
  desanitizedResponse: string;
  aiProvider: string;
  aiModel: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  processingTimeMs: number;
}

export class AIInteractionStorageService {
  async saveInteraction(data: AIInteractionData): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_interactions (
          request_id, organization_id, user_id, conversation_id, session_id,
          user_prompt, sanitized_prompt, ai_response, sanitized_response, desanitized_response,
          ai_provider, ai_model, tokens_input, tokens_output, cost_usd, processing_time_ms,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        )
        ON CONFLICT (request_id) DO UPDATE SET
          sanitized_prompt = EXCLUDED.sanitized_prompt,
          ai_response = EXCLUDED.ai_response,
          sanitized_response = EXCLUDED.sanitized_response,
          desanitized_response = EXCLUDED.desanitized_response,
          tokens_input = EXCLUDED.tokens_input,
          tokens_output = EXCLUDED.tokens_output,
          cost_usd = EXCLUDED.cost_usd,
          processing_time_ms = EXCLUDED.processing_time_ms`,
        [
          data.requestId,
          data.organizationId,
          data.userId,
          data.conversationId,
          data.sessionId,
          data.userPrompt,
          data.sanitizedPrompt,
          data.aiResponse,
          data.sanitizedResponse,
          data.desanitizedResponse,
          data.aiProvider,
          data.aiModel,
          data.tokensInput,
          data.tokensOutput,
          data.costUsd,
          data.processingTimeMs,
        ]
      );
    } catch (error) {
      console.error('Failed to save AI interaction:', error);
      throw error;
    }
  }
}
