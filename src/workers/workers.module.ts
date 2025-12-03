import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { ParsersModule } from '../parsers/parsers.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ExtractionWorker } from './extraction.worker';

@Module({
  imports: [OperationsModule, ParsersModule, ExtractionModule],
  providers: [ExtractionWorker],
  exports: [ExtractionWorker],
})
export class WorkersModule {}

