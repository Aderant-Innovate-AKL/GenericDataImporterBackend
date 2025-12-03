import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { BedrockModule } from './bedrock/bedrock.module';
import { ExamplesModule } from './examples/examples.module';
import awsConfig from './config/aws.config';

// Data Importer modules
import { ParsersModule } from './parsers/parsers.module';
import { OperationsModule } from './operations/operations.module';
import { ExtractionModule } from './extraction/extraction.module';
import { MappingModule } from './mapping/mapping.module';
import { WorkersModule } from './workers/workers.module';
import { ExtractModule } from './extract/extract.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [awsConfig],
    }),
    // Existing modules (kept as reference)
    BedrockModule,
    ExamplesModule,
    // Data Importer modules
    ParsersModule,
    OperationsModule,
    ExtractionModule,
    MappingModule,
    WorkersModule,
    ExtractModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
