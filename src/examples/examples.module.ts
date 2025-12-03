import { Module } from '@nestjs/common';
import { BedrockModule } from '../bedrock/bedrock.module';
import { ExamplesController } from './examples.controller';

/**
 * Examples module demonstrating Bedrock service usage patterns
 * Use these as templates for building your own AI-powered features
 */
@Module({
  imports: [BedrockModule],
  controllers: [ExamplesController],
})
export class ExamplesModule {}
