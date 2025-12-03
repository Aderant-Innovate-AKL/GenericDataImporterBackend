import { Module } from '@nestjs/common';
import { OperationsStore } from './operations.store';
import { OperationsManager } from './operations.manager';
import { OperationsController } from './operations.controller';

@Module({
  controllers: [OperationsController],
  providers: [OperationsStore, OperationsManager],
  exports: [OperationsManager, OperationsStore],
})
export class OperationsModule {}

