import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { OperationsModule } from '../operations/operations.module';
import { WorkersModule } from '../workers/workers.module';
import { ParsersModule } from '../parsers/parsers.module';
import { ExtractController } from './extract.controller';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
    OperationsModule,
    WorkersModule,
    ParsersModule,
  ],
  controllers: [ExtractController],
})
export class ExtractModule {}

