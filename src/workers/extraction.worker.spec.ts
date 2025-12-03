import { ExtractionWorker } from './extraction.worker';
import { OperationsManager } from '../operations/operations.manager';
import { OperationsStore } from '../operations/operations.store';
import { ParserFactory } from '../parsers/parser.factory';
import { CsvParser } from '../parsers/csv.parser';
import { ExcelParser } from '../parsers/excel.parser';
import { ExtractorService } from '../extraction/extractor.service';
import { ExtractionContext, ExtractionResult } from '../shared/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234-5678-9abc-def012345678',
}));

describe('ExtractionWorker', () => {
  let worker: ExtractionWorker;
  let operationsManager: OperationsManager;
  let operationsStore: OperationsStore;
  let parserFactory: ParserFactory;
  let mockExtractor: jest.Mocked<ExtractorService>;

  const mockContext: ExtractionContext = {
    description: 'Test context',
    fields: [{ field: 'name', description: 'Person name' }],
  };

  const mockResult: ExtractionResult = {
    data: [
      {
        direct: {
          Name: { value: 'John', targetField: 'name', confidence: 9 },
        },
        compound: {},
        unmapped: {},
      },
    ],
    metadata: {
      sourceFile: 'test.csv',
      rowsProcessed: 1,
      extractionSummary: {
        directMappings: 1,
        compoundExtractions: 0,
        unmappedColumns: [],
        unmappedFields: [],
        llmCalls: 1,
        processingTimeMs: 500,
        averageConfidence: 9,
      },
    },
  };

  beforeEach(() => {
    operationsStore = new OperationsStore();
    operationsManager = new OperationsManager(operationsStore);
    parserFactory = new ParserFactory(new CsvParser(), new ExcelParser());

    mockExtractor = {
      extract: jest.fn().mockResolvedValue(mockResult),
    } as any;

    worker = new ExtractionWorker(operationsManager, parserFactory, mockExtractor);
  });

  afterEach(() => {
    operationsStore.stopCleanupInterval();
    operationsStore.clear();
  });

  describe('processOperation', () => {
    it('should process a valid operation successfully', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.status).toBe('completed');
      expect(updated.result).toEqual(mockResult);
    });

    it('should update status to processing', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      // Mock extractor to delay
      mockExtractor.extract.mockImplementation(async () => {
        const currentOp = operationsManager.get(operation.operationId);
        expect(currentOp.status).toBe('processing');
        return mockResult;
      });

      await worker.processOperation(operation.operationId);
    });

    it('should handle extraction errors gracefully and set failed status', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      // Force extractor to throw
      mockExtractor.extract.mockRejectedValue(new Error('Parse error in data'));

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.status).toBe('failed');
      expect(updated.error).toBeDefined();
      expect(updated.error?.message).toContain('Parse error');
    });

    it('should handle extraction errors gracefully', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      mockExtractor.extract.mockRejectedValue(new Error('LLM service unavailable'));

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.status).toBe('failed');
      expect(updated.error?.message).toContain('LLM service unavailable');
    });

    it('should detect cancellation during extraction', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      // Mock extractor to cancel during extraction
      mockExtractor.extract.mockImplementation(async (_data, _context, onProgress) => {
        // Simulate cancellation during extraction
        operationsManager.cancel(operation.operationId);
        
        // Call progress callback which should throw
        onProgress?.({
          phase: 'discovery',
          currentStep: 'test',
          rowsProcessed: 0,
          totalRows: 1,
          percentComplete: 0,
        });
        
        throw new Error('Operation cancelled');
      });

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.status).toBe('cancelled');
    });

    it('should handle non-existent operation', async () => {
      // Should not throw, just log and return
      await expect(
        worker.processOperation('non_existent'),
      ).resolves.not.toThrow();
    });

    it('should set correct error code for LLM errors', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('Name\nJohn'),
        filename: 'test.csv',
        context: mockContext,
      });

      mockExtractor.extract.mockRejectedValue(new Error('Bedrock inference failed'));

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.error?.code).toBe('LLM_ERROR');
    });

    it('should set correct error code for unsupported format errors', async () => {
      const operation = operationsManager.create({
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: mockContext,
      });

      mockExtractor.extract.mockRejectedValue(new Error('Unsupported format detected'));

      await worker.processOperation(operation.operationId);

      const updated = operationsManager.get(operation.operationId);
      expect(updated.status).toBe('failed');
      expect(updated.error?.code).toBe('UNSUPPORTED_FORMAT');
    });
  });
});

