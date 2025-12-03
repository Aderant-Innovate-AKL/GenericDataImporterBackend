import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Operation,
  OperationStatus,
  OperationProgress,
  OperationError,
  ExtractionContext,
  ExtractionResult,
} from '../shared/types';
import { OperationsStore } from './operations.store';

/**
 * Input for creating a new operation
 */
export interface CreateOperationInput {
  fileContent: Buffer;
  filename: string;
  sheetName?: string;
  context: ExtractionContext;
}

/**
 * Manager for operation lifecycle
 * Handles creation, status updates, and state transitions
 */
@Injectable()
export class OperationsManager {
  constructor(private store: OperationsStore) {}

  /**
   * Create a new extraction operation
   */
  create(input: CreateOperationInput): Operation {
    const operation: Operation = {
      operationId: `op_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      status: 'pending',
      createdAt: new Date(),
      fileContent: input.fileContent,
      filename: input.filename,
      sheetName: input.sheetName,
      context: input.context,
    };

    this.store.create(operation);
    console.log(`[OperationsManager] Created operation ${operation.operationId}`);

    return operation;
  }

  /**
   * Get an operation by ID
   */
  get(operationId: string): Operation {
    const operation = this.store.get(operationId);
    if (!operation) {
      throw new NotFoundException(`Operation ${operationId} not found`);
    }
    return operation;
  }

  /**
   * Check if an operation exists
   */
  exists(operationId: string): boolean {
    return this.store.has(operationId);
  }

  /**
   * Update operation status
   */
  updateStatus(operationId: string, status: OperationStatus): Operation {
    const operation = this.get(operationId);

    const updates: Partial<Operation> = { status };

    // Set appropriate timestamp based on status
    switch (status) {
      case 'processing':
        updates.startedAt = new Date();
        break;
      case 'completed':
        updates.completedAt = new Date();
        break;
      case 'failed':
        updates.failedAt = new Date();
        break;
      case 'cancelled':
        updates.cancelledAt = new Date();
        break;
    }

    const updated = this.store.update(operationId, updates);
    console.log(`[OperationsManager] Updated operation ${operationId} status to ${status}`);

    return updated || operation;
  }

  /**
   * Update operation progress
   */
  updateProgress(operationId: string, progress: Partial<OperationProgress>): Operation {
    const operation = this.get(operationId);

    const currentProgress = operation.progress || {
      phase: 'parsing',
      currentStep: '',
      rowsProcessed: 0,
      totalRows: 0,
      percentComplete: 0,
    };

    const updatedProgress: OperationProgress = {
      ...currentProgress,
      ...progress,
    };

    const updated = this.store.update(operationId, { progress: updatedProgress });

    return updated || operation;
  }

  /**
   * Mark operation as completed with result
   */
  complete(operationId: string, result: ExtractionResult): Operation {
    const operation = this.get(operationId);

    const updated = this.store.update(operationId, {
      status: 'completed',
      completedAt: new Date(),
      result,
      progress: {
        phase: 'mapping',
        currentStep: 'complete',
        rowsProcessed: result.metadata.rowsProcessed,
        totalRows: result.metadata.rowsProcessed,
        percentComplete: 100,
      },
    });

    console.log(
      `[OperationsManager] Completed operation ${operationId} with ${result.metadata.rowsProcessed} rows`,
    );

    return updated || operation;
  }

  /**
   * Mark operation as failed with error
   */
  fail(operationId: string, error: OperationError | string): Operation {
    const operation = this.get(operationId);

    const operationError: OperationError =
      typeof error === 'string'
        ? { code: 'EXTRACTION_ERROR', message: error }
        : error;

    const updated = this.store.update(operationId, {
      status: 'failed',
      failedAt: new Date(),
      error: operationError,
    });

    console.error(`[OperationsManager] Failed operation ${operationId}:`, operationError);

    return updated || operation;
  }

  /**
   * Cancel an operation
   */
  cancel(operationId: string): Operation {
    const operation = this.get(operationId);

    // Can only cancel pending or processing operations
    if (!['pending', 'processing'].includes(operation.status)) {
      throw new Error(
        `Cannot cancel operation in status '${operation.status}'. Only 'pending' or 'processing' operations can be cancelled.`,
      );
    }

    const updated = this.store.update(operationId, {
      status: 'cancelled',
      cancelledAt: new Date(),
    });

    console.log(`[OperationsManager] Cancelled operation ${operationId}`);

    return updated || operation;
  }

  /**
   * Check if operation can be cancelled
   */
  canCancel(operationId: string): boolean {
    const operation = this.store.get(operationId);
    if (!operation) return false;
    return ['pending', 'processing'].includes(operation.status);
  }

  /**
   * Get status counts for monitoring
   */
  getStatusCounts(): Record<OperationStatus, number> {
    return this.store.getCountByStatus();
  }

  /**
   * Cleanup expired operations
   */
  cleanup(): number {
    return this.store.cleanupExpired();
  }
}

