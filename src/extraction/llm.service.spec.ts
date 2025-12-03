import { BadRequestException } from '@nestjs/common';
import { LLMService } from './llm.service';
import { BedrockService } from '../bedrock/bedrock.service';

describe('LLMService', () => {
  let service: LLMService;
  let mockBedrockService: jest.Mocked<BedrockService>;

  beforeEach(() => {
    mockBedrockService = {
      invoke: jest.fn(),
      invokeStream: jest.fn(),
      getModels: jest.fn().mockReturnValue([
        { id: 'model-1', name: 'Model 1', provider: 'Anthropic' },
        { id: 'model-2', name: 'Model 2', provider: 'Amazon' },
      ]),
    } as any;

    service = new LLMService(mockBedrockService);
  });

  describe('infer', () => {
    it('should call bedrock service with default parameters', async () => {
      mockBedrockService.invoke.mockResolvedValue({
        content: 'Test response',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const result = await service.infer('Test prompt');

      expect(result).toBe('Test response');
      expect(mockBedrockService.invoke).toHaveBeenCalledWith({
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        prompt: 'Test prompt',
        temperature: 0.1,
        maxTokens: 4096,
      });
    });

    it('should use custom model if provided', async () => {
      mockBedrockService.invoke.mockResolvedValue({
        content: 'Response',
        model: 'custom-model',
        usage: { inputTokens: 5, outputTokens: 10 },
      });

      await service.infer('Prompt', { model: 'custom-model' });

      expect(mockBedrockService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'custom-model' }),
      );
    });

    it('should use custom temperature if provided', async () => {
      mockBedrockService.invoke.mockResolvedValue({
        content: 'Response',
        model: 'model',
        usage: { inputTokens: 5, outputTokens: 10 },
      });

      await service.infer('Prompt', { temperature: 0.8 });

      expect(mockBedrockService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.8 }),
      );
    });

    it('should use custom maxTokens if provided', async () => {
      mockBedrockService.invoke.mockResolvedValue({
        content: 'Response',
        model: 'model',
        usage: { inputTokens: 5, outputTokens: 10 },
      });

      await service.infer('Prompt', { maxTokens: 2000 });

      expect(mockBedrockService.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 2000 }),
      );
    });

    it('should throw BadRequestException on bedrock failure', async () => {
      mockBedrockService.invoke.mockRejectedValue(new Error('Service unavailable'));

      await expect(service.infer('Prompt')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAvailableModels', () => {
    it('should return model IDs from bedrock service', () => {
      const models = service.getAvailableModels();

      expect(models).toEqual(['model-1', 'model-2']);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count based on character length', () => {
      const text = 'This is a test string with some words.';
      const estimate = service.estimateTokenCount(text);

      // Rough estimate: 1 token per 4 characters
      expect(estimate).toBe(Math.ceil(text.length / 4));
    });

    it('should return 0 for empty string', () => {
      const estimate = service.estimateTokenCount('');
      expect(estimate).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(10000);
      const estimate = service.estimateTokenCount(longText);
      expect(estimate).toBe(2500); // 10000 / 4
    });
  });
});

