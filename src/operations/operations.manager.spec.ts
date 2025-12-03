import { NotFoundException } from '@nestjs/common';
import { OperationsManager } from './operations.manager';
import { OperationsStore } from './operations.store';
import { ExtractionContext, ExtractionResult } from '../shared/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234-5678-9abc-def012345678',
}));

describe('OperationsManager', () => {
  let manager: OperationsManager;
  let store: OperationsStore;

  const mockContext: ExtractionContext = {
    description: 'Test context',
    fields: [{ field: 'test_field', description: 'A test field' }],
  };

  beforeEach(() => {
    store = new OperationsStore();
    manager = new OperationsManager(store);
  });

  afterEach(() => {
    store.stopCleanupInterval();
    store.clear();
  });

  describe('create', () => {
    it('should create an operation with pending status', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      expect(operation.operationId).toMatch(/^op_[a-z0-9]+$/);
      expect(operation.status).toBe('pending');
      expect(operation.filename).toBe('test.csv');
      expect(operation.context).toEqual(mockContext);
      expect(operation.createdAt).toBeInstanceOf(Date);
    });

    it('should store the operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      expect(manager.exists(operation.operationId)).toBe(true);
    });

    it('should include sheetName if provided', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.xlsx',
        sheetName: 'Sheet1',
        context: mockContext,
      });

      expect(operation.sheetName).toBe('Sheet1');
    });
  });

  describe('get', () => {
    it('should return the operation if it exists', () => {
      const created = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const retrieved = manager.get(created.operationId);
      expect(retrieved.operationId).toBe(created.operationId);
    });

    it('should throw NotFoundException for non-existent operation', () => {
      expect(() => manager.get('non_existent')).toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update status to processing and set startedAt', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const updated = manager.updateStatus(operation.operationId, 'processing');

      expect(updated.status).toBe('processing');
      expect(updated.startedAt).toBeInstanceOf(Date);
    });

    it('should update status to completed and set completedAt', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });
      manager.updateStatus(operation.operationId, 'processing');

      const updated = manager.updateStatus(operation.operationId, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateProgress', () => {
    it('should update progress', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const updated = manager.updateProgress(operation.operationId, {
        phase: 'parsing',
        currentStep: 'Reading file',
        rowsProcessed: 0,
        totalRows: 100,
        percentComplete: 0,
      });

      expect(updated.progress?.phase).toBe('parsing');
      expect(updated.progress?.currentStep).toBe('Reading file');
      expect(updated.progress?.totalRows).toBe(100);
    });

    it('should merge with existing progress', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      manager.updateProgress(operation.operationId, {
        phase: 'parsing',
        currentStep: 'Reading',
        rowsProcessed: 0,
        totalRows: 100,
        percentComplete: 0,
      });

      const updated = manager.updateProgress(operation.operationId, {
        rowsProcessed: 50,
        percentComplete: 50,
      });

      expect(updated.progress?.phase).toBe('parsing');
      expect(updated.progress?.rowsProcessed).toBe(50);
      expect(updated.progress?.percentComplete).toBe(50);
    });
  });

  describe('complete', () => {
    it('should mark operation as completed with result', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const mockResult: ExtractionResult = {
        data: [],
        metadata: {
          sourceFile: 'test.csv',
          rowsProcessed: 10,
          extractionSummary: {
            directMappings: 1,
            compoundExtractions: 0,
            unmappedColumns: [],
            unmappedFields: [],
            llmCalls: 1,
            processingTimeMs: 1000,
            averageConfidence: 9,
          },
        },
      };

      const completed = manager.complete(operation.operationId, mockResult);

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.result).toEqual(mockResult);
      expect(completed.progress?.percentComplete).toBe(100);
    });
  });

  describe('fail', () => {
    it('should mark operation as failed with error message', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const failed = manager.fail(operation.operationId, 'Something went wrong');

      expect(failed.status).toBe('failed');
      expect(failed.failedAt).toBeInstanceOf(Date);
      expect(failed.error?.code).toBe('EXTRACTION_ERROR');
      expect(failed.error?.message).toBe('Something went wrong');
    });

    it('should mark operation as failed with error object', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const failed = manager.fail(operation.operationId, {
        code: 'LLM_ERROR',
        message: 'LLM failed',
        phase: 'discovery',
      });

      expect(failed.error?.code).toBe('LLM_ERROR');
      expect(failed.error?.phase).toBe('discovery');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const cancelled = manager.cancel(operation.operationId);

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    });

    it('should cancel a processing operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });
      manager.updateStatus(operation.operationId, 'processing');

      const cancelled = manager.cancel(operation.operationId);

      expect(cancelled.status).toBe('cancelled');
    });

    it('should throw error when cancelling completed operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });
      manager.updateStatus(operation.operationId, 'completed');

      expect(() => manager.cancel(operation.operationId)).toThrow();
    });
  });

  describe('canCancel', () => {
    it('should return true for pending operations', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      expect(manager.canCancel(operation.operationId)).toBe(true);
    });

    it('should return true for processing operations', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });
      manager.updateStatus(operation.operationId, 'processing');

      expect(manager.canCancel(operation.operationId)).toBe(true);
    });

    it('should return false for completed operations', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });
      manager.updateStatus(operation.operationId, 'completed');

      expect(manager.canCancel(operation.operationId)).toBe(false);
    });

    it('should return false for non-existent operations', () => {
      expect(manager.canCancel('non_existent')).toBe(false);
    });
  });
});

