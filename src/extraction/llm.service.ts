import { Injectable, BadRequestException } from '@nestjs/common';
import { BedrockService } from '../bedrock/bedrock.service';

/**
 * Configuration for LLM inference
 */
export interface LLMInferenceConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Default model configuration
 */
const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const DEFAULT_TEMPERATURE = 0.1; // Low temperature for consistent extraction
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Service for LLM inference using AWS Bedrock
 * Provides a simplified interface for extraction tasks
 */
@Injectable()
export class LLMService {
  constructor(private bedrockService: BedrockService) {}

  /**
   * Perform inference with the configured model
   */
  async infer(prompt: string, config?: LLMInferenceConfig): Promise<string> {
    const model = config?.model || DEFAULT_MODEL;
    const temperature = config?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;

    try {
      console.log(`[LLMService] Invoking model: ${model}`);
      console.log(`[LLMService] Prompt length: ${prompt.length} characters`);

      const response = await this.bedrockService.invoke({
        model,
        prompt,
        temperature,
        maxTokens,
      });

      console.log(`[LLMService] Response received, length: ${response.content.length} characters`);
      console.log(
        `[LLMService] Token usage: input=${response.usage?.inputTokens}, output=${response.usage?.outputTokens}`,
      );

      return response.content;
    } catch (error) {
      console.error(`[LLMService] Inference failed:`, error);
      throw new BadRequestException(`LLM inference failed: ${error.message}`);
    }
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return this.bedrockService.getModels().map((m) => m.id);
  }

  /**
   * Estimate token count for a string
   * This is a rough approximation (actual count varies by model)
   */
  estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

