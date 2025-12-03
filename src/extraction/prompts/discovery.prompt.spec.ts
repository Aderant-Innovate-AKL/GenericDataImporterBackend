import {
  buildDiscoveryPrompt,
  parseDiscoveryResponse,
  ParsedDiscoveryResult,
} from './discovery.prompt';
import { NormalizedData, ExtractionContext } from '../../shared/types';

describe('Discovery Prompt', () => {
  const mockNormalizedData: NormalizedData = {
    source: {
      filename: 'test.csv',
      type: 'csv',
    },
    data: {
      headers: ['Date', 'Amount', 'Order Ref', 'Notes'],
      rows: [
        { Date: '2024-01-15', Amount: '1500.00', 'Order Ref': 'ORD-2024-NYC-WIDGET', Notes: 'Rush' },
        { Date: '2024-01-16', Amount: '2300.50', 'Order Ref': 'ORD-2024-LA-GADGET', Notes: '' },
      ],
      rowCount: 2,
      columnCount: 4,
    },
    metadata: {
      parsedAt: '2024-01-15T10:00:00Z',
      parserVersion: '1.0.0',
    },
  };

  const mockContext: ExtractionContext = {
    description: 'Monthly sales report',
    fields: [
      { field: 'transaction_date', description: 'The date of the sale' },
      { field: 'total_amount', description: 'Total sale amount' },
      { field: 'region', description: 'Geographic region' },
    ],
  };

  describe('buildDiscoveryPrompt', () => {
    it('should include the context description', () => {
      const prompt = buildDiscoveryPrompt(mockNormalizedData, mockContext);
      expect(prompt).toContain('Monthly sales report');
    });

    it('should include all field definitions', () => {
      const prompt = buildDiscoveryPrompt(mockNormalizedData, mockContext);
      expect(prompt).toContain('transaction_date');
      expect(prompt).toContain('total_amount');
      expect(prompt).toContain('region');
    });

    it('should include sample data', () => {
      const prompt = buildDiscoveryPrompt(mockNormalizedData, mockContext);
      expect(prompt).toContain('Date');
      expect(prompt).toContain('Amount');
      expect(prompt).toContain('Order Ref');
    });

    it('should request JSON output', () => {
      const prompt = buildDiscoveryPrompt(mockNormalizedData, mockContext);
      expect(prompt).toContain('JSON');
    });
  });

  describe('parseDiscoveryResponse', () => {
    it('should parse a valid response', () => {
      const response = `{
        "directMappings": {
          "transaction_date": { "sourceColumn": "Date", "confidence": 9 },
          "total_amount": { "sourceColumn": "Amount", "confidence": 8 }
        },
        "compoundColumns": {
          "Order Ref": ["region"]
        },
        "unmappedFields": []
      }`;

      const result = parseDiscoveryResponse(response);

      expect(result.directMappings.transaction_date.sourceColumn).toBe('Date');
      expect(result.directMappings.transaction_date.confidence).toBe(9);
      expect(result.compoundColumns['Order Ref']).toContain('region');
      expect(result.unmappedFields).toEqual([]);
    });

    it('should handle response with text before JSON', () => {
      const response = `Here is the analysis:
      
      {
        "directMappings": {
          "test": { "sourceColumn": "Test", "confidence": 8 }
        },
        "compoundColumns": {},
        "unmappedFields": ["missing"]
      }`;

      const result = parseDiscoveryResponse(response);

      expect(result.directMappings.test.sourceColumn).toBe('Test');
      expect(result.unmappedFields).toContain('missing');
    });

    it('should throw error for invalid JSON', () => {
      const response = 'This is not JSON';

      expect(() => parseDiscoveryResponse(response)).toThrow();
    });

    it('should handle missing optional fields', () => {
      const response = '{"directMappings": {}}';

      const result = parseDiscoveryResponse(response);

      expect(result.directMappings).toEqual({});
      expect(result.compoundColumns).toEqual({});
      expect(result.unmappedFields).toEqual([]);
    });
  });
});

