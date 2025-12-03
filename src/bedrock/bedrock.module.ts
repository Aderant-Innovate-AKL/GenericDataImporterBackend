import { Module } from '@nestjs/common';
import { BedrockService } from './bedrock.service';
import { BedrockController } from './bedrock.controller';

@Module({
  controllers: [BedrockController],
  providers: [BedrockService],
  exports: [BedrockService],
})
export class BedrockModule {}
