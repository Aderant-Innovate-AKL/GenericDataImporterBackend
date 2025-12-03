import { Injectable } from '@nestjs/common';
import { Operation, OperationStatus } from '../shared/types';

/**
 * TTL configuration for operations (in milliseconds)
 */
export const OPERATION_TTL_MS: Record<OperationStatus, number> = {
  pending: 30 * 60 * 1000, // 30 minutes - stale if never started
  processing: 60 * 60 * 1000, // 1 hour - timeout for stuck operations
  completed: 24 * 60 * 60 * 1000, // 24 hours - keep results
  failed: 24 * 60 * 60 * 1000, // 24 hours - keep error info for debugging
  cancelled: 60 * 60 * 1000, // 1 hour - quick cleanup
};

/**
 * In-memory store for operations
 * Provides basic CRUD operations with TTL-based cleanup
 */
@Injectable()
export class OperationsStore {
  private operations = new Map<string, Operation>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval (every 5 minutes)
    this.startCleanupInterval();
  }

  /**
   * Create a new operation
   */
  create(operation: Operation): void {
    this.operations.set(operation.operationId, operation);
  }

  /**
   * Get an operation by ID
   */
  get(operationId: string): Operation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Update an operation
   */
  update(operationId: string, updates: Partial<Operation>): Operation | undefined {
    const op = this.operations.get(operationId);
    if (op) {
      Object.assign(op, updates);
      return op;
    }
    return undefined;
  }

  /**
   * Delete an operation
   */
  delete(operationId: string): boolean {
    return this.operations.delete(operationId);
  }

  /**
   * Check if an operation exists
   */
  has(operationId: string): boolean {
    return this.operations.has(operationId);
  }

  /**
   * Get all operations (for debugging/admin purposes)
   */
  getAll(): Operation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get count of operations by status
   */
  getCountByStatus(): Record<OperationStatus, number> {
    const counts: Record<OperationStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const op of this.operations.values()) {
      counts[op.status]++;
    }

    return counts;
  }

  /**
   * Clean up expired operations based on TTL
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [operationId, operation] of this.operations.entries()) {
      const ttl = OPERATION_TTL_MS[operation.status];
      const createdAt = operation.createdAt.getTime();

      if (now - createdAt > ttl) {
        this.operations.delete(operationId);
        cleaned++;
        console.log(
          `[OperationsStore] Cleaned up expired operation ${operationId} (status: ${operation.status})`,
        );
      }
    }

    return cleaned;
  }

  /**
   * Start the periodic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        const cleaned = this.cleanupExpired();
        if (cleaned > 0) {
          console.log(`[OperationsStore] Cleaned up ${cleaned} expired operations`);
        }
      },
      5 * 60 * 1000,
    );
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all operations (useful for testing)
   */
  clear(): void {
    this.operations.clear();
  }
}

