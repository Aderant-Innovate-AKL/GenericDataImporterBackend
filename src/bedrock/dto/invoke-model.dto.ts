import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvokeModelDto {
  @ApiProperty({
    description: 'AWS Bedrock model ID to use',
    example: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  })
  @IsString()
  model: string;

  @ApiProperty({
    description: 'Text prompt to send to the model',
    example: 'What is the capital of France?',
  })
  @IsString()
  prompt: string;

  @ApiProperty({
    description: 'Temperature for response randomness (0-1)',
    example: 0.7,
    required: false,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiProperty({
    description: 'Maximum tokens in response',
    example: 1000,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;
}

export class TokenUsage {
  @ApiProperty({ description: 'Number of input tokens' })
  inputTokens: number;

  @ApiProperty({ description: 'Number of output tokens' })
  outputTokens: number;
}

export class ModelResponse {
  @ApiProperty({ description: 'Generated content from the model' })
  content: string;

  @ApiProperty({ description: 'Model ID used' })
  model: string;

  @ApiProperty({
    description: 'Token usage statistics',
    required: false,
    type: () => TokenUsage,
  })
  usage?: TokenUsage;
}
