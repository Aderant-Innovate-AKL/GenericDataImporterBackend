import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsManager } from './operations.manager';
import { OperationsStore } from './operations.store';
import { ExtractionContext } from '../shared/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234-5678-9abc-def012345678',
}));

describe('OperationsController', () => {
  let controller: OperationsController;
  let manager: OperationsManager;
  let store: OperationsStore;

  const mockContext: ExtractionContext = {
    description: 'Test context',
    fields: [{ field: 'test_field', description: 'A test field' }],
  };

  beforeEach(() => {
    store = new OperationsStore();
    manager = new OperationsManager(store);
    controller = new OperationsController(manager);
  });

  afterEach(() => {
    store.stopCleanupInterval();
    store.clear();
  });

  describe('getOperation', () => {
    it('should return operation status for pending operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const result = controller.getOperation(operation.operationId);

      expect(result.operationId).toBe(operation.operationId);
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeDefined();
    });

    it('should return operation with progress when processing', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      manager.updateStatus(operation.operationId, 'processing');
      manager.updateProgress(operation.operationId, {
        phase: 'discovery',
        currentStep: 'Analyzing columns',
        rowsProcessed: 10,
        totalRows: 100,
        percentComplete: 10,
      });

      const result = controller.getOperation(operation.operationId);

      expect(result.status).toBe('processing');
      expect(result.startedAt).toBeDefined();
      expect(result.progress).toBeDefined();
      expect(result.progress?.phase).toBe('discovery');
      expect(result.progress?.percentComplete).toBe(10);
    });

    it('should return operation with result when completed', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const mockResult = {
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

      manager.complete(operation.operationId, mockResult);

      const result = controller.getOperation(operation.operationId);

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
      expect(result.result).toEqual(mockResult);
    });

    it('should return operation with error when failed', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      manager.fail(operation.operationId, {
        code: 'LLM_ERROR',
        message: 'LLM service unavailable',
        phase: 'discovery',
      });

      const result = controller.getOperation(operation.operationId);

      expect(result.status).toBe('failed');
      expect(result.failedAt).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('LLM_ERROR');
    });

    it('should throw NotFoundException for non-existent operation', () => {
      expect(() => controller.getOperation('non_existent')).toThrow(NotFoundException);
    });
  });

  describe('cancelOperation', () => {
    it('should cancel a pending operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      const result = controller.cancelOperation(operation.operationId);

      expect(result.operationId).toBe(operation.operationId);
      expect(result.status).toBe('cancelled');
      expect(result.cancelledAt).toBeDefined();
    });

    it('should cancel a processing operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      manager.updateStatus(operation.operationId, 'processing');

      const result = controller.cancelOperation(operation.operationId);

      expect(result.status).toBe('cancelled');
    });

    it('should throw BadRequestException for completed operation', () => {
      const operation = manager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      manager.updateStatus(operation.operationId, 'completed');

      expect(() => controller.cancelOperation(operation.operationId)).toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent operation', () => {
      expect(() => controller.cancelOperation('non_existent')).toThrow(
        NotFoundException,
      );
    });
  });
});

