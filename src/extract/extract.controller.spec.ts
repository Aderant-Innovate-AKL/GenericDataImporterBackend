import { BadRequestException } from '@nestjs/common';
import { ExtractController } from './extract.controller';
import { OperationsManager } from '../operations/operations.manager';
import { OperationsStore } from '../operations/operations.store';
import { ExtractionWorker } from '../workers/extraction.worker';
import { ParserFactory } from '../parsers/parser.factory';
import { CsvParser } from '../parsers/csv.parser';
import { ExcelParser } from '../parsers/excel.parser';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234-5678-9abc-def012345678',
}));

describe('ExtractController', () => {
  let controller: ExtractController;
  let operationsManager: OperationsManager;
  let operationsStore: OperationsStore;
  let parserFactory: ParserFactory;
  let mockWorker: jest.Mocked<ExtractionWorker>;

  beforeEach(() => {
    operationsStore = new OperationsStore();
    operationsManager = new OperationsManager(operationsStore);
    parserFactory = new ParserFactory(new CsvParser(), new ExcelParser());

    // Mock the worker to prevent actual extraction
    mockWorker = {
      processOperation: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new ExtractController(operationsManager, mockWorker, parserFactory);
  });

  afterEach(() => {
    operationsStore.stopCleanupInterval();
    operationsStore.clear();
  });

  const createMockFile = (
    originalname: string,
    buffer: Buffer = Buffer.from('Name,Age\nJohn,30'),
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'text/csv',
    buffer,
    size: buffer.length,
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  });

  const validContext = JSON.stringify({
    description: 'Test data import',
    fields: [
      { field: 'name', description: 'Person name' },
      { field: 'age', description: 'Person age' },
    ],
  });

  describe('extract', () => {
    it('should create an operation and return 202 response', async () => {
      const file = createMockFile('test.csv');

      const result = await controller.extract(file, undefined, validContext);

      expect(result.operationId).toMatch(/^op_/);
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeDefined();
      expect(result.links.self).toContain(result.operationId);
      expect(result.links.cancel).toContain(result.operationId);
    });

    it('should start background processing', async () => {
      const file = createMockFile('test.csv');

      await controller.extract(file, undefined, validContext);

      expect(mockWorker.processOperation).toHaveBeenCalled();
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(
        controller.extract(undefined as any, undefined, validContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported file format', async () => {
      const file = createMockFile('test.pdf');

      await expect(controller.extract(file, undefined, validContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when context is missing', async () => {
      const file = createMockFile('test.csv');

      await expect(controller.extract(file, undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid context JSON', async () => {
      const file = createMockFile('test.csv');

      await expect(
        controller.extract(file, undefined, 'invalid json'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when context has no fields', async () => {
      const file = createMockFile('test.csv');
      const contextWithoutFields = JSON.stringify({
        description: 'Test',
        fields: [],
      });

      await expect(
        controller.extract(file, undefined, contextWithoutFields),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when context has no description', async () => {
      const file = createMockFile('test.csv');
      const contextWithoutDescription = JSON.stringify({
        fields: [{ field: 'test', description: 'Test field' }],
      });

      await expect(
        controller.extract(file, undefined, contextWithoutDescription),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept Excel files', async () => {
      const file = createMockFile('test.xlsx');

      const result = await controller.extract(file, 'Sheet1', validContext);

      expect(result.operationId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should pass sheetName to operation', async () => {
      const file = createMockFile('test.xlsx');

      await controller.extract(file, 'DataSheet', validContext);

      const operation = operationsManager.get(
        operationsStore.getAll()[0].operationId,
      );
      expect(operation.sheetName).toBe('DataSheet');
    });
  });
});

