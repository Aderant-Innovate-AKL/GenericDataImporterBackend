import { OperationsStore } from './operations.store';
import { Operation, ExtractionContext } from '../shared/types';

describe('OperationsStore', () => {
  let store: OperationsStore;

  const createMockOperation = (
    operationId: string,
    status: Operation['status'] = 'pending',
  ): Operation => {
    const context: ExtractionContext = {
      description: 'Test context',
      fields: [{ field: 'test', description: 'Test field' }],
    };

    return {
      operationId,
      status,
      createdAt: new Date(),
      fileContent: Buffer.from('test'),
      filename: 'test.csv',
      context,
    };
  };

  beforeEach(() => {
    store = new OperationsStore();
  });

  afterEach(() => {
    store.stopCleanupInterval();
    store.clear();
  });

  describe('create', () => {
    it('should create and store an operation', () => {
      const operation = createMockOperation('op_1');
      store.create(operation);

      const retrieved = store.get('op_1');
      expect(retrieved).toEqual(operation);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent operation', () => {
      const result = store.get('non_existent');
      expect(result).toBeUndefined();
    });

    it('should return the operation if it exists', () => {
      const operation = createMockOperation('op_1');
      store.create(operation);

      const result = store.get('op_1');
      expect(result).toEqual(operation);
    });
  });

  describe('update', () => {
    it('should update an existing operation', () => {
      const operation = createMockOperation('op_1', 'pending');
      store.create(operation);

      store.update('op_1', { status: 'processing' });

      const updated = store.get('op_1');
      expect(updated?.status).toBe('processing');
    });

    it('should return undefined for non-existent operation', () => {
      const result = store.update('non_existent', { status: 'processing' });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete an existing operation', () => {
      const operation = createMockOperation('op_1');
      store.create(operation);

      const result = store.delete('op_1');
      expect(result).toBe(true);
      expect(store.get('op_1')).toBeUndefined();
    });

    it('should return false for non-existent operation', () => {
      const result = store.delete('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true if operation exists', () => {
      store.create(createMockOperation('op_1'));
      expect(store.has('op_1')).toBe(true);
    });

    it('should return false if operation does not exist', () => {
      expect(store.has('non_existent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all operations', () => {
      store.create(createMockOperation('op_1'));
      store.create(createMockOperation('op_2'));
      store.create(createMockOperation('op_3'));

      const all = store.getAll();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when no operations', () => {
      const all = store.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('getCountByStatus', () => {
    it('should return counts for each status', () => {
      store.create(createMockOperation('op_1', 'pending'));
      store.create(createMockOperation('op_2', 'pending'));
      store.create(createMockOperation('op_3', 'processing'));
      store.create(createMockOperation('op_4', 'completed'));

      const counts = store.getCountByStatus();

      expect(counts.pending).toBe(2);
      expect(counts.processing).toBe(1);
      expect(counts.completed).toBe(1);
      expect(counts.failed).toBe(0);
      expect(counts.cancelled).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all operations', () => {
      store.create(createMockOperation('op_1'));
      store.create(createMockOperation('op_2'));

      store.clear();

      expect(store.getAll()).toHaveLength(0);
    });
  });
});

