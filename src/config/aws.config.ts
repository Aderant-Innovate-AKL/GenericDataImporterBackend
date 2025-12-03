import { registerAs } from '@nestjs/config';

/**
 * AWS configuration for Bedrock service
 * Reads from environment variables or uses defaults
 */
export default registerAs('aws', () => ({
  region: process.env.AWS_REGION || 'us-east-1',
  profile: process.env.AWS_PROFILE || 'default',
}));
