import { Module } from '@nestjs/common';
import { BedrockModule } from '../bedrock/bedrock.module';
import { SamplerService } from './sampler.service';
import { LLMService } from './llm.service';
import { ExtractorService } from './extractor.service';

@Module({
  imports: [BedrockModule],
  providers: [SamplerService, LLMService, ExtractorService],
  exports: [SamplerService, LLMService, ExtractorService],
})
export class ExtractionModule {}

