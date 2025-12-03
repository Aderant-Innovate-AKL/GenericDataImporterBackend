import { SamplerService } from './sampler.service';
import { NormalizedData } from '../shared/types';

describe('SamplerService', () => {
  let sampler: SamplerService;

  const createNormalizedData = (rowCount: number): NormalizedData => {
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      Name: `Person ${i}`,
      Age: String(20 + i),
    }));

    return {
      source: {
        filename: 'test.csv',
        type: 'csv',
      },
      data: {
        headers: ['Name', 'Age'],
        rows,
        rowCount: rows.length,
        columnCount: 2,
      },
      metadata: {
        parsedAt: new Date().toISOString(),
        parserVersion: '1.0.0',
      },
    };
  };

  beforeEach(() => {
    sampler = new SamplerService();
  });

  describe('sample', () => {
    it('should return all rows when total rows <= 50', () => {
      const data = createNormalizedData(30);
      const result = sampler.sample(data);

      expect(result.data.rowCount).toBe(30);
      expect(result.data.rows).toHaveLength(30);
    });

    it('should return exactly 50 rows when total rows = 50', () => {
      const data = createNormalizedData(50);
      const result = sampler.sample(data);

      expect(result.data.rowCount).toBe(50);
      expect(result.data.rows).toHaveLength(50);
    });

    it('should return first 30 rows when total rows > 50', () => {
      const data = createNormalizedData(100);
      const result = sampler.sample(data);

      expect(result.data.rowCount).toBe(30);
      expect(result.data.rows).toHaveLength(30);
      expect(result.data.rows[0].Name).toBe('Person 0');
      expect(result.data.rows[29].Name).toBe('Person 29');
    });

    it('should preserve source and metadata', () => {
      const data = createNormalizedData(100);
      const result = sampler.sample(data);

      expect(result.source).toEqual(data.source);
      expect(result.metadata).toEqual(data.metadata);
    });

    it('should preserve headers', () => {
      const data = createNormalizedData(100);
      const result = sampler.sample(data);

      expect(result.data.headers).toEqual(['Name', 'Age']);
    });
  });

  describe('getSampleSize', () => {
    it('should return total rows when <= 50', () => {
      expect(sampler.getSampleSize(10)).toBe(10);
      expect(sampler.getSampleSize(50)).toBe(50);
    });

    it('should return 30 when > 50', () => {
      expect(sampler.getSampleSize(51)).toBe(30);
      expect(sampler.getSampleSize(1000)).toBe(30);
    });
  });

  describe('willSample', () => {
    it('should return false when <= 50 rows', () => {
      expect(sampler.willSample(10)).toBe(false);
      expect(sampler.willSample(50)).toBe(false);
    });

    it('should return true when > 50 rows', () => {
      expect(sampler.willSample(51)).toBe(true);
      expect(sampler.willSample(1000)).toBe(true);
    });
  });
});

