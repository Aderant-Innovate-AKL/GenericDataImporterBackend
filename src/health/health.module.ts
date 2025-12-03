import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { HealthController } from './health.controller';

@Module({
  imports: [OperationsModule],
  controllers: [HealthController],
})
export class HealthModule {}

