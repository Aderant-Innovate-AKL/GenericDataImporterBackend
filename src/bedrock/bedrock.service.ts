import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import Anthropic from '@anthropic-ai/sdk';
import { InvokeModelDto, ModelResponse } from './dto/invoke-model.dto';

/**
 * Configuration for available AWS Bedrock models
 */
export interface ModelConfig {
  id: string; // AWS Bedrock model ID
  name: string; // Human-readable name
  provider: string; // Model provider (Anthropic or Amazon)
}

/**
 * Service for interacting with AI models
 *
 * Supports both Anthropic API and AWS Bedrock based on configuration.
 * Provides a unified interface for invoking multiple AI models.
 */
@Injectable()
export class BedrockService {
  private provider: string;
  private bedrockClient?: BedrockRuntimeClient;
  private anthropicClient?: Anthropic;

  /**
   * Available models configuration
   * Add new models here to make them available through the API
   */
  private models: ModelConfig[] = [
    // Claude models for Anthropic API
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude 4.5 Haiku',
      provider: 'Anthropic',
    },
    // AWS Bedrock model IDs
    {
      id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      name: 'Claude 4.5 Sonnet (Bedrock)',
      provider: 'Anthropic',
    },
    {
      id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      name: 'Claude 3.5 Sonnet (Bedrock)',
      provider: 'Anthropic',
    },
    {
      id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      name: 'Claude 3.5 Haiku (Bedrock)',
      provider: 'Anthropic',
    },
    {
      id: 'anthropic.claude-3-opus-20240229-v1:0',
      name: 'Claude 3 Opus (Bedrock)',
      provider: 'Anthropic',
    },
    { id: 'us.amazon.nova-micro-v1:0', name: 'Nova Micro', provider: 'Amazon' },
    { id: 'us.amazon.nova-lite-v1:0', name: 'Nova Lite', provider: 'Amazon' },
    { id: 'us.amazon.nova-pro-v1:0', name: 'Nova Pro', provider: 'Amazon' },
  ];

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get<string>('llm.provider') || 'anthropic';

    if (this.provider === 'aws') {
      const region = this.configService.get<string>('llm.aws.region');
      const profile = this.configService.get<string>('llm.aws.profile');

      this.bedrockClient = new BedrockRuntimeClient({
        region,
        credentials: fromIni({ profile }),
      });
      console.log(`[BedrockService] Initialized with AWS Bedrock (region: ${region})`);
    } else if (this.provider === 'anthropic') {
      const apiKey = this.configService.get<string>('llm.anthropic.apiKey');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
      }
      this.anthropicClient = new Anthropic({ apiKey });
      console.log(`[BedrockService] Initialized with Anthropic API`);
    } else {
      throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  /**
   * Get list of available models
   */
  getModels(): ModelConfig[] {
    return this.models;
  }

  /**
   * Invoke a model synchronously and get the complete response
   * @param dto Request parameters including model, prompt, temperature, and maxTokens
   * @returns Model response with generated content and token usage
   */
  async invoke(dto: InvokeModelDto): Promise<ModelResponse> {
    const modelConfig = this.models.find((m) => m.id === dto.model);
    if (!modelConfig) {
      throw new BadRequestException(`Model ${dto.model} not found`);
    }

    console.log(`[Bedrock] Invoking ${modelConfig.name} via ${this.provider}`);

    if (this.provider === 'anthropic') {
      return this.invokeAnthropicAPI(dto, modelConfig);
    } else {
      return this.invokeBedrockAPI(dto, modelConfig);
    }
  }

  /**
   * Invoke Anthropic API directly
   */
  private async invokeAnthropicAPI(
    dto: InvokeModelDto,
    modelConfig: ModelConfig,
  ): Promise<ModelResponse> {
    if (!this.anthropicClient) {
      throw new BadRequestException('Anthropic client not initialized');
    }

    try {
      const response = await this.anthropicClient.messages.create({
        model: dto.model,
        max_tokens: dto.maxTokens || 4096,
        temperature: dto.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: dto.prompt,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');

      return {
        content: textContent?.type === 'text' ? textContent.text : '',
        model: dto.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error(`[Bedrock] Anthropic API error:`, error);
      throw new BadRequestException(`Failed to invoke model: ${error.message}`);
    }
  }

  /**
   * Invoke AWS Bedrock API
   */
  private async invokeBedrockAPI(
    dto: InvokeModelDto,
    modelConfig: ModelConfig,
  ): Promise<ModelResponse> {
    if (!this.bedrockClient) {
      throw new BadRequestException('Bedrock client not initialized');
    }

    const body = this.buildRequestBody(modelConfig.provider, dto);

    console.log(`[Bedrock] Request body:`, JSON.stringify(body, null, 2));

    try {
      const command = new InvokeModelCommand({
        modelId: dto.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      console.log(`[Bedrock] Response body:`, JSON.stringify(responseBody, null, 2));

      return this.parseResponse(modelConfig.provider, responseBody, dto.model);
    } catch (error) {
      console.error(`[Bedrock] Error invoking ${modelConfig.name}:`, error);
      console.error(`[Bedrock] Error details:`, {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
      });
      throw new BadRequestException(`Failed to invoke model: ${error.message}`);
    }
  }

  /**
   * Invoke a model with streaming response
   * Yields text chunks as they're generated (useful for real-time UX)
   * @param dto Request parameters including model, prompt, temperature, and maxTokens
   * @returns AsyncGenerator yielding text chunks
   */
  async *invokeStream(dto: InvokeModelDto): AsyncGenerator<string> {
    const modelConfig = this.models.find((m) => m.id === dto.model);
    if (!modelConfig) {
      throw new BadRequestException(`Model ${dto.model} not found`);
    }

    if (this.provider === 'anthropic') {
      yield* this.invokeAnthropicStreamAPI(dto);
    } else {
      yield* this.invokeBedrockStreamAPI(dto, modelConfig);
    }
  }

  /**
   * Invoke Anthropic API with streaming
   */
  private async *invokeAnthropicStreamAPI(dto: InvokeModelDto): AsyncGenerator<string> {
    if (!this.anthropicClient) {
      throw new BadRequestException('Anthropic client not initialized');
    }

    try {
      const stream = await this.anthropicClient.messages.create({
        model: dto.model,
        max_tokens: dto.maxTokens || 4096,
        temperature: dto.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: dto.prompt,
          },
        ],
        stream: true,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      throw new BadRequestException(`Failed to stream model: ${error.message}`);
    }
  }

  /**
   * Invoke AWS Bedrock with streaming
   */
  private async *invokeBedrockStreamAPI(
    dto: InvokeModelDto,
    modelConfig: ModelConfig,
  ): AsyncGenerator<string> {
    if (!this.bedrockClient) {
      throw new BadRequestException('Bedrock client not initialized');
    }

    const body = this.buildRequestBody(modelConfig.provider, dto);

    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId: dto.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.bedrockClient.send(command);

      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            const text = this.extractStreamText(modelConfig.provider, chunk);
            if (text) {
              yield text;
            }
          }
        }
      }
    } catch (error) {
      throw new BadRequestException(`Failed to stream model: ${error.message}`);
    }
  }

  /**
   * Build provider-specific request body
   * Each provider (Anthropic, Amazon) has different API formats
   */
  private buildRequestBody(provider: string, dto: InvokeModelDto): any {
    if (provider === 'Anthropic') {
      return {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: dto.maxTokens || 4096,
        temperature: dto.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: dto.prompt,
          },
        ],
      };
    } else if (provider === 'Amazon') {
      return {
        messages: [
          {
            role: 'user',
            content: [{ text: dto.prompt }],
          },
        ],
        inferenceConfig: {
          max_new_tokens: dto.maxTokens || 4096,
          temperature: dto.temperature || 0.7,
        },
      };
    }
  }

  /**
   * Parse provider-specific response format into standardized ModelResponse
   */
  private parseResponse(provider: string, responseBody: any, model: string): ModelResponse {
    if (provider === 'Anthropic') {
      return {
        content: responseBody.content[0].text,
        model,
        usage: {
          inputTokens: responseBody.usage.input_tokens,
          outputTokens: responseBody.usage.output_tokens,
        },
      };
    } else if (provider === 'Amazon') {
      return {
        content: responseBody.output.message.content[0].text,
        model,
        usage: {
          inputTokens: responseBody.usage.inputTokens,
          outputTokens: responseBody.usage.outputTokens,
        },
      };
    }
    throw new BadRequestException(`Unsupported provider: ${provider}`);
  }

  /**
   * Extract text from streaming chunk (provider-specific format)
   */
  private extractStreamText(provider: string, chunk: any): string | null {
    if (provider === 'Anthropic') {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        return chunk.delta.text;
      }
    } else if (provider === 'Amazon') {
      if (chunk.contentBlockDelta?.delta?.text) {
        return chunk.contentBlockDelta.delta.text;
      }
    }
    return null;
  }
}
