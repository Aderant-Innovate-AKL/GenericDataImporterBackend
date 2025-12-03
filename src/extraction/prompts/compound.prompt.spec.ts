import {
  buildCompoundPrompt,
  parseCompoundResponse,
  CompoundExtractionInput,
} from './compound.prompt';

describe('Compound Prompt', () => {
  describe('buildCompoundPrompt', () => {
    it('should build prompt with extraction inputs', () => {
      const inputs: CompoundExtractionInput[] = [
        {
          sourceColumn: 'Order Ref',
          fieldsToExtract: [
            { field: 'region', description: 'Geographic region' },
            { field: 'year', description: 'Order year' },
          ],
          values: [
            { rowIndex: 0, value: 'ORD-2024-NYC' },
            { rowIndex: 1, value: 'ORD-2023-LA' },
          ],
        },
      ];

      const prompt = buildCompoundPrompt(inputs);

      expect(prompt).toContain('Order Ref');
      expect(prompt).toContain('region');
      expect(prompt).toContain('year');
      expect(prompt).toContain('ORD-2024-NYC');
      expect(prompt).toContain('ORD-2023-LA');
    });

    it('should include field descriptions', () => {
      const inputs: CompoundExtractionInput[] = [
        {
          sourceColumn: 'Data',
          fieldsToExtract: [
            { field: 'customer_name', description: 'Name of the customer' },
          ],
          values: [{ rowIndex: 0, value: 'Acme Corp - John' }],
        },
      ];

      const prompt = buildCompoundPrompt(inputs);

      expect(prompt).toContain('Name of the customer');
    });

    it('should handle multiple source columns', () => {
      const inputs: CompoundExtractionInput[] = [
        {
          sourceColumn: 'Column1',
          fieldsToExtract: [{ field: 'field1', description: 'Field 1' }],
          values: [{ rowIndex: 0, value: 'Value1' }],
        },
        {
          sourceColumn: 'Column2',
          fieldsToExtract: [{ field: 'field2', description: 'Field 2' }],
          values: [{ rowIndex: 0, value: 'Value2' }],
        },
      ];

      const prompt = buildCompoundPrompt(inputs);

      expect(prompt).toContain('Column1');
      expect(prompt).toContain('Column2');
      expect(prompt).toContain('field1');
      expect(prompt).toContain('field2');
    });

    it('should request JSON output', () => {
      const inputs: CompoundExtractionInput[] = [
        {
          sourceColumn: 'Test',
          fieldsToExtract: [{ field: 'test', description: 'Test' }],
          values: [{ rowIndex: 0, value: 'test' }],
        },
      ];

      const prompt = buildCompoundPrompt(inputs);

      expect(prompt).toContain('JSON');
    });
  });

  describe('parseCompoundResponse', () => {
    it('should parse a valid response', () => {
      const response = `{
        "extractions": [
          {
            "rowIndex": 0,
            "sourceColumn": "Order Ref",
            "fields": {
              "region": { "value": "NYC", "confidence": 9 },
              "year": { "value": "2024", "confidence": 10 }
            }
          }
        ]
      }`;

      const result = parseCompoundResponse(response);

      expect(result.extractions).toHaveLength(1);
      expect(result.extractions[0].rowIndex).toBe(0);
      expect(result.extractions[0].sourceColumn).toBe('Order Ref');
      expect(result.extractions[0].fields.region.value).toBe('NYC');
      expect(result.extractions[0].fields.region.confidence).toBe(9);
    });

    it('should handle response with text before JSON', () => {
      const response = `Here is the extraction result:
      
      {
        "extractions": [
          {
            "rowIndex": 0,
            "sourceColumn": "Data",
            "fields": {
              "name": { "value": "John", "confidence": 8 }
            }
          }
        ]
      }`;

      const result = parseCompoundResponse(response);

      expect(result.extractions).toHaveLength(1);
      expect(result.extractions[0].fields.name.value).toBe('John');
    });

    it('should handle multiple extractions', () => {
      const response = `{
        "extractions": [
          {
            "rowIndex": 0,
            "sourceColumn": "Ref",
            "fields": { "field1": { "value": "A", "confidence": 9 } }
          },
          {
            "rowIndex": 1,
            "sourceColumn": "Ref",
            "fields": { "field1": { "value": "B", "confidence": 8 } }
          },
          {
            "rowIndex": 2,
            "sourceColumn": "Ref",
            "fields": { "field1": { "value": "C", "confidence": 7 } }
          }
        ]
      }`;

      const result = parseCompoundResponse(response);

      expect(result.extractions).toHaveLength(3);
      expect(result.extractions[0].fields.field1.value).toBe('A');
      expect(result.extractions[1].fields.field1.value).toBe('B');
      expect(result.extractions[2].fields.field1.value).toBe('C');
    });

    it('should handle null values in extractions', () => {
      const response = `{
        "extractions": [
          {
            "rowIndex": 0,
            "sourceColumn": "Data",
            "fields": {
              "field1": { "value": null, "confidence": 2 }
            }
          }
        ]
      }`;

      const result = parseCompoundResponse(response);

      expect(result.extractions[0].fields.field1.value).toBeNull();
      expect(result.extractions[0].fields.field1.confidence).toBe(2);
    });

    it('should throw error for invalid JSON', () => {
      const response = 'This is not JSON';

      expect(() => parseCompoundResponse(response)).toThrow();
    });

    it('should throw error when extractions array is missing', () => {
      const response = '{ "data": [] }';

      expect(() => parseCompoundResponse(response)).toThrow(
        'Response missing "extractions" array',
      );
    });

    it('should handle missing optional fields with defaults', () => {
      const response = `{
        "extractions": [
          {
            "fields": { "test": { "value": "x", "confidence": 5 } }
          }
        ]
      }`;

      const result = parseCompoundResponse(response);

      expect(result.extractions[0].rowIndex).toBe(0);
      expect(result.extractions[0].sourceColumn).toBe('');
    });
  });
});

