import { ExtractorService } from './extractor.service';
import { SamplerService } from './sampler.service';
import { LLMService } from './llm.service';
import { NormalizedData, ExtractionContext } from '../shared/types';

describe('ExtractorService', () => {
  let service: ExtractorService;
  let mockSampler: jest.Mocked<SamplerService>;
  let mockLlm: jest.Mocked<LLMService>;

  const mockNormalizedData: NormalizedData = {
    source: {
      filename: 'test.csv',
      type: 'csv',
    },
    data: {
      headers: ['Name', 'Age', 'City'],
      rows: [
        { Name: 'John', Age: '30', City: 'NYC' },
        { Name: 'Jane', Age: '25', City: 'LA' },
      ],
      rowCount: 2,
      columnCount: 3,
    },
    metadata: {
      parsedAt: new Date().toISOString(),
      parserVersion: '1.0.0',
    },
  };

  const mockContext: ExtractionContext = {
    description: 'Test data',
    fields: [
      { field: 'person_name', description: 'Name of the person' },
      { field: 'person_age', description: 'Age of the person' },
    ],
  };

  beforeEach(() => {
    mockSampler = {
      sample: jest.fn().mockReturnValue(mockNormalizedData),
      getSampleSize: jest.fn(),
      willSample: jest.fn(),
    } as any;

    mockLlm = {
      infer: jest.fn(),
      getAvailableModels: jest.fn(),
      estimateTokenCount: jest.fn().mockReturnValue(100),
    } as any;

    service = new ExtractorService(mockSampler, mockLlm);
  });

  describe('extract', () => {
    it('should perform discovery and return results for direct mappings only', async () => {
      // Mock discovery response (no compound columns)
      const discoveryResponse = JSON.stringify({
        directMappings: {
          person_name: { sourceColumn: 'Name', confidence: 9 },
          person_age: { sourceColumn: 'Age', confidence: 8 },
        },
        compoundColumns: {},
        unmappedFields: [],
      });

      mockLlm.infer.mockResolvedValue(discoveryResponse);

      const result = await service.extract(mockNormalizedData, mockContext);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].direct.Name.targetField).toBe('person_name');
      expect(result.data[0].direct.Age.targetField).toBe('person_age');
      expect(result.metadata.extractionSummary.directMappings).toBe(2);
      expect(result.metadata.extractionSummary.llmCalls).toBe(1);
    });

    it('should handle compound columns with Pass 2 extraction', async () => {
      const dataWithCompound: NormalizedData = {
        ...mockNormalizedData,
        data: {
          headers: ['Name', 'OrderRef'],
          rows: [
            { Name: 'John', OrderRef: 'ORD-2024-NYC' },
            { Name: 'Jane', OrderRef: 'ORD-2023-LA' },
          ],
          rowCount: 2,
          columnCount: 2,
        },
      };

      const contextWithCompound: ExtractionContext = {
        description: 'Test',
        fields: [
          { field: 'person_name', description: 'Name' },
          { field: 'order_year', description: 'Year from order ref' },
          { field: 'region', description: 'Region from order ref' },
        ],
      };

      mockSampler.sample.mockReturnValue(dataWithCompound);

      // Mock discovery response with compound column
      const discoveryResponse = JSON.stringify({
        directMappings: {
          person_name: { sourceColumn: 'Name', confidence: 9 },
        },
        compoundColumns: {
          OrderRef: ['order_year', 'region'],
        },
        unmappedFields: [],
      });

      // Mock compound extraction response
      const compoundResponse = JSON.stringify({
        extractions: [
          {
            rowIndex: 0,
            sourceColumn: 'OrderRef',
            fields: {
              order_year: { value: '2024', confidence: 10 },
              region: { value: 'NYC', confidence: 9 },
            },
          },
          {
            rowIndex: 1,
            sourceColumn: 'OrderRef',
            fields: {
              order_year: { value: '2023', confidence: 10 },
              region: { value: 'LA', confidence: 9 },
            },
          },
        ],
      });

      mockLlm.infer
        .mockResolvedValueOnce(discoveryResponse)
        .mockResolvedValueOnce(compoundResponse);

      const result = await service.extract(dataWithCompound, contextWithCompound);

      expect(result.data[0].compound.OrderRef).toBeDefined();
      expect(result.data[0].compound.OrderRef.extractions).toHaveLength(2);
      expect(result.metadata.extractionSummary.compoundExtractions).toBe(2);
      expect(result.metadata.extractionSummary.llmCalls).toBe(2);
    });

    it('should track unmapped columns', async () => {
      const discoveryResponse = JSON.stringify({
        directMappings: {
          person_name: { sourceColumn: 'Name', confidence: 9 },
        },
        compoundColumns: {},
        unmappedFields: ['person_age'],
      });

      mockLlm.infer.mockResolvedValue(discoveryResponse);

      const result = await service.extract(mockNormalizedData, mockContext);

      expect(result.data[0].unmapped.Age).toBe('30');
      expect(result.data[0].unmapped.City).toBe('NYC');
      expect(result.metadata.extractionSummary.unmappedFields).toContain('person_age');
    });

    it('should call progress callback', async () => {
      const discoveryResponse = JSON.stringify({
        directMappings: {
          person_name: { sourceColumn: 'Name', confidence: 9 },
        },
        compoundColumns: {},
        unmappedFields: [],
      });

      mockLlm.infer.mockResolvedValue(discoveryResponse);

      const progressCallback = jest.fn();

      await service.extract(mockNormalizedData, mockContext, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'discovery' }),
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'mapping' }),
      );
    });

    it('should calculate average confidence', async () => {
      const discoveryResponse = JSON.stringify({
        directMappings: {
          person_name: { sourceColumn: 'Name', confidence: 8 },
          person_age: { sourceColumn: 'Age', confidence: 10 },
        },
        compoundColumns: {},
        unmappedFields: [],
      });

      mockLlm.infer.mockResolvedValue(discoveryResponse);

      const result = await service.extract(mockNormalizedData, mockContext);

      // Average of 8 and 10, applied to 2 rows = (8+10+8+10) / 4 = 9
      expect(result.metadata.extractionSummary.averageConfidence).toBe(9);
    });

    it('should use sampler for data sampling', async () => {
      const discoveryResponse = JSON.stringify({
        directMappings: {},
        compoundColumns: {},
        unmappedFields: [],
      });

      mockLlm.infer.mockResolvedValue(discoveryResponse);

      await service.extract(mockNormalizedData, mockContext);

      expect(mockSampler.sample).toHaveBeenCalledWith(mockNormalizedData);
    });
  });
});

