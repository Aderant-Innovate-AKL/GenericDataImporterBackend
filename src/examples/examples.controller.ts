import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { BedrockService } from '../bedrock/bedrock.service';

/**
 * Example controller demonstrating how to use the Bedrock service
 * These endpoints show practical patterns for building AI-powered features
 */
@ApiTags('examples')
@Controller('examples')
export class ExamplesController {
  constructor(private readonly bedrockService: BedrockService) {}

  @Get('models')
  @ApiOperation({
    summary: 'Example: List available AI models',
    description: 'Shows how to retrieve and display available Bedrock models',
  })
  async getAvailableModels() {
    const models = this.bedrockService.getModels();
    return {
      total: models.length,
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
      })),
    };
  }

  @Post('simple-completion')
  @ApiOperation({
    summary: 'Example: Simple text completion',
    description: 'Demonstrates basic AI text generation with customizable parameters',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', example: 'Explain quantum computing in simple terms' },
        temperature: {
          type: 'number',
          example: 0.7,
          description: 'Optional: 0-1, controls randomness',
        },
      },
      required: ['prompt'],
    },
  })
  async simpleCompletion(@Body() body: { prompt: string; temperature?: number }) {
    // Use Claude 3.5 Haiku for fast, cost-effective responses
    const response = await this.bedrockService.invoke({
      model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      prompt: body.prompt,
      temperature: body.temperature || 0.7,
      maxTokens: 1000,
    });

    return {
      result: response.content,
      model: response.model,
      tokensUsed: response.usage,
    };
  }

  @Post('translate')
  @ApiOperation({
    summary: 'Example: Language translation',
    description: 'Shows how to build a translation feature using AI',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'Hello, how are you?' },
        targetLanguage: { type: 'string', example: 'Spanish' },
      },
      required: ['text', 'targetLanguage'],
    },
  })
  async translate(@Body() body: { text: string; targetLanguage: string }) {
    const prompt = `Translate the following text to ${body.targetLanguage}. Only respond with the translation, no explanation:\n\n${body.text}`;

    const response = await this.bedrockService.invoke({
      model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      prompt,
      temperature: 0.3, // Lower temperature for more deterministic translations
      maxTokens: 500,
    });

    return {
      original: body.text,
      translated: response.content,
      targetLanguage: body.targetLanguage,
    };
  }

  @Post('code-review')
  @ApiOperation({
    summary: 'Example: AI code review',
    description: 'Demonstrates using AI for code analysis and suggestions',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          example: 'function add(a, b) { return a + b; }',
        },
        language: { type: 'string', example: 'javascript' },
      },
      required: ['code'],
    },
  })
  async reviewCode(@Body() body: { code: string; language?: string }) {
    const languageNote = body.language ? ` (${body.language})` : '';
    const prompt = `Review the following code${languageNote} and provide:
1. A brief assessment of code quality
2. Potential bugs or issues
3. Suggestions for improvement

Code:
\`\`\`
${body.code}
\`\`\`

Respond in a structured format.`;

    // Use Claude 3.5 Sonnet for more sophisticated reasoning
    const response = await this.bedrockService.invoke({
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      prompt,
      temperature: 0.5,
      maxTokens: 2000,
    });

    return {
      code: body.code,
      review: response.content,
      model: 'Claude 3.5 Sonnet',
    };
  }

  @Post('summarize')
  @ApiOperation({
    summary: 'Example: Text summarization',
    description: 'Shows how to create a text summarization feature',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          example: 'Long article or document text here...',
        },
        maxLength: {
          type: 'number',
          example: 100,
          description: 'Maximum words in summary',
        },
      },
      required: ['text'],
    },
  })
  async summarize(@Body() body: { text: string; maxLength?: number }) {
    const maxLength = body.maxLength || 100;
    const prompt = `Summarize the following text in no more than ${maxLength} words:\n\n${body.text}`;

    const response = await this.bedrockService.invoke({
      model: 'us.amazon.nova-lite-v1:0', // Fast and cost-effective for summarization
      prompt,
      temperature: 0.5,
      maxTokens: maxLength * 2, // Rough token estimate
    });

    return {
      originalLength: body.text.split(' ').length,
      summary: response.content,
      model: 'Amazon Nova Lite',
    };
  }
}
