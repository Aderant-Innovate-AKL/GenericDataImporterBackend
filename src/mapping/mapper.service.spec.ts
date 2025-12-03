import { MapperService } from './mapper.service';
import { ExtractionResult, ExtractedRowData } from '../shared/types';

describe('MapperService', () => {
  let mapper: MapperService;

  beforeEach(() => {
    mapper = new MapperService();
  });

  const createMockResult = (): ExtractionResult => ({
    data: [
      {
        direct: {
          Date: { value: '2024-01-15', targetField: 'transaction_date', confidence: 9 },
          Amount: { value: '1500.00', targetField: 'total_amount', confidence: 8 },
        },
        compound: {
          'Order Ref': {
            sourceValue: 'ORD-2024-NYC-WIDGET',
            extractions: [
              { targetField: 'region', extractedValue: 'NYC', confidence: 9 },
              { targetField: 'product_type', extractedValue: 'WIDGET', confidence: 8 },
            ],
          },
        },
        unmapped: {
          Notes: 'Rush order',
        },
      },
      {
        direct: {
          Date: { value: '2024-01-16', targetField: 'transaction_date', confidence: 9 },
          Amount: { value: '2300.50', targetField: 'total_amount', confidence: 8 },
        },
        compound: {
          'Order Ref': {
            sourceValue: 'ORD-2024-LA-GADGET',
            extractions: [
              { targetField: 'region', extractedValue: 'LA', confidence: 9 },
              { targetField: 'product_type', extractedValue: 'GADGET', confidence: 8 },
            ],
          },
        },
        unmapped: {
          Notes: '',
        },
      },
    ],
    metadata: {
      sourceFile: 'test.csv',
      rowsProcessed: 2,
      extractionSummary: {
        directMappings: 2,
        compoundExtractions: 2,
        unmappedColumns: ['Notes'],
        unmappedFields: [],
        llmCalls: 2,
        processingTimeMs: 1000,
        averageConfidence: 8.5,
      },
    },
  });

  describe('toFinalOutput', () => {
    it('should transform extraction result to final output', () => {
      const result = createMockResult();
      const output = mapper.toFinalOutput(result);

      expect(output).toHaveLength(2);
      expect(output[0]).toEqual({
        transaction_date: '2024-01-15',
        total_amount: '1500.00',
        region: 'NYC',
        product_type: 'WIDGET',
      });
      expect(output[1]).toEqual({
        transaction_date: '2024-01-16',
        total_amount: '2300.50',
        region: 'LA',
        product_type: 'GADGET',
      });
    });

    it('should handle empty extraction result', () => {
      const result: ExtractionResult = {
        data: [],
        metadata: {
          sourceFile: 'test.csv',
          rowsProcessed: 0,
          extractionSummary: {
            directMappings: 0,
            compoundExtractions: 0,
            unmappedColumns: [],
            unmappedFields: [],
            llmCalls: 0,
            processingTimeMs: 0,
            averageConfidence: 0,
          },
        },
      };

      const output = mapper.toFinalOutput(result);
      expect(output).toEqual([]);
    });

    it('should handle null extracted values', () => {
      const result: ExtractionResult = {
        data: [
          {
            direct: {
              Date: { value: '2024-01-15', targetField: 'transaction_date', confidence: 9 },
            },
            compound: {
              'Order Ref': {
                sourceValue: 'UNKNOWN',
                extractions: [{ targetField: 'region', extractedValue: null, confidence: 2 }],
              },
            },
            unmapped: {},
          },
        ],
        metadata: {
          sourceFile: 'test.csv',
          rowsProcessed: 1,
          extractionSummary: {
            directMappings: 1,
            compoundExtractions: 1,
            unmappedColumns: [],
            unmappedFields: [],
            llmCalls: 1,
            processingTimeMs: 500,
            averageConfidence: 5.5,
          },
        },
      };

      const output = mapper.toFinalOutput(result);
      expect(output[0].region).toBeNull();
    });
  });

  describe('getMappedFields', () => {
    it('should return all mapped field names', () => {
      const result = createMockResult();
      const fields = mapper.getMappedFields(result);

      expect(fields).toContain('transaction_date');
      expect(fields).toContain('total_amount');
      expect(fields).toContain('region');
      expect(fields).toContain('product_type');
    });

    it('should return empty array for empty result', () => {
      const result: ExtractionResult = {
        data: [],
        metadata: {
          sourceFile: 'test.csv',
          rowsProcessed: 0,
          extractionSummary: {
            directMappings: 0,
            compoundExtractions: 0,
            unmappedColumns: [],
            unmappedFields: [],
            llmCalls: 0,
            processingTimeMs: 0,
            averageConfidence: 0,
          },
        },
      };

      const fields = mapper.getMappedFields(result);
      expect(fields).toEqual([]);
    });
  });

  describe('getSourceColumns', () => {
    it('should return categorized source columns', () => {
      const result = createMockResult();
      const columns = mapper.getSourceColumns(result);

      expect(columns.direct).toContain('Date');
      expect(columns.direct).toContain('Amount');
      expect(columns.compound).toContain('Order Ref');
      expect(columns.unmapped).toContain('Notes');
    });
  });

  describe('getExtractionStats', () => {
    it('should calculate extraction statistics', () => {
      const result = createMockResult();
      const stats = mapper.getExtractionStats(result);

      expect(stats.totalRows).toBe(2);
      expect(stats.directMappings).toBe(2); // Date, Amount per row
      expect(stats.compoundExtractions).toBe(2); // region, product_type per row
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });

    it('should count low confidence extractions', () => {
      const result: ExtractionResult = {
        data: [
          {
            direct: {
              Test: { value: 'value', targetField: 'test', confidence: 3 },
            },
            compound: {
              Compound: {
                sourceValue: 'source',
                extractions: [{ targetField: 'field', extractedValue: 'val', confidence: 2 }],
              },
            },
            unmapped: {},
          },
        ],
        metadata: {
          sourceFile: 'test.csv',
          rowsProcessed: 1,
          extractionSummary: {
            directMappings: 1,
            compoundExtractions: 1,
            unmappedColumns: [],
            unmappedFields: [],
            llmCalls: 1,
            processingTimeMs: 500,
            averageConfidence: 2.5,
          },
        },
      };

      const stats = mapper.getExtractionStats(result);
      expect(stats.lowConfidenceCount).toBe(2);
    });
  });
});

