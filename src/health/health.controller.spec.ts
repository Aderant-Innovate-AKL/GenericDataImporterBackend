import { HealthController } from './health.controller';
import { OperationsStore } from '../operations/operations.store';

describe('HealthController', () => {
  let controller: HealthController;
  let store: OperationsStore;

  beforeEach(() => {
    store = new OperationsStore();
    controller = new HealthController(store);
  });

  afterEach(() => {
    store.stopCleanupInterval();
    store.clear();
  });

  describe('getHealth', () => {
    it('should return healthy status', () => {
      const result = controller.getHealth();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include operation counts', () => {
      const result = controller.getHealth();

      expect(result.operations).toBeDefined();
      expect(result.operations?.pending).toBe(0);
      expect(result.operations?.processing).toBe(0);
      expect(result.operations?.completed).toBe(0);
      expect(result.operations?.failed).toBe(0);
      expect(result.operations?.cancelled).toBe(0);
    });

    it('should reflect actual operation counts', () => {
      // Add some mock operations to the store
      const mockOperation = {
        operationId: 'op_test1',
        status: 'pending' as const,
        createdAt: new Date(),
        fileContent: Buffer.from('test'),
        filename: 'test.csv',
        context: { description: 'Test', fields: [] },
      };

      store.create(mockOperation);
      store.create({ ...mockOperation, operationId: 'op_test2', status: 'processing' });
      store.create({ ...mockOperation, operationId: 'op_test3', status: 'completed' });

      const result = controller.getHealth();

      expect(result.operations?.pending).toBe(1);
      expect(result.operations?.processing).toBe(1);
      expect(result.operations?.completed).toBe(1);
    });
  });

  describe('getReady', () => {
    it('should return ready true', () => {
      const result = controller.getReady();
      expect(result.ready).toBe(true);
    });
  });

  describe('getLive', () => {
    it('should return alive true', () => {
      const result = controller.getLive();
      expect(result.alive).toBe(true);
    });
  });
});

