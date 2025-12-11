import { registerAs } from '@nestjs/config';

/**
 * LLM provider configuration
 * Supports both Anthropic API and AWS Bedrock
 */
export default registerAs('llm', () => ({
  provider: process.env.LLM_PROVIDER || 'anthropic', // 'anthropic' or 'aws'
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    profile: process.env.AWS_PROFILE || 'default',
  },
}));
