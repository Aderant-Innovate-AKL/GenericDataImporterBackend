import { ParserFactory } from './parser.factory';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { GenericParser } from './generic.parser';
import { LLMService } from '../extraction/llm.service';

describe('ParserFactory', () => {
  let factory: ParserFactory;
  let csvParser: CsvParser;
  let excelParser: ExcelParser;
  let genericParser: GenericParser;
  let mockLlmService: jest.Mocked<LLMService>;

  beforeEach(() => {
    csvParser = new CsvParser();
    excelParser = new ExcelParser();
    mockLlmService = {
      infer: jest.fn(),
      getAvailableModels: jest.fn(),
      estimateTokenCount: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;
    genericParser = new GenericParser(mockLlmService);
    factory = new ParserFactory(csvParser, excelParser, genericParser);
  });

  describe('getParser', () => {
    it('should return CsvParser for .csv files', () => {
      const parser = factory.getParser('data.csv');
      expect(parser).toBe(csvParser);
    });

    it('should return CsvParser for .tsv files', () => {
      const parser = factory.getParser('data.tsv');
      expect(parser).toBe(csvParser);
    });

    it('should return CsvParser for .txt files', () => {
      const parser = factory.getParser('data.txt');
      expect(parser).toBe(csvParser);
    });

    it('should return ExcelParser for .xlsx files', () => {
      const parser = factory.getParser('data.xlsx');
      expect(parser).toBe(excelParser);
    });

    it('should return ExcelParser for .xls files', () => {
      const parser = factory.getParser('data.xls');
      expect(parser).toBe(excelParser);
    });

    it('should handle uppercase extensions', () => {
      const parser = factory.getParser('DATA.CSV');
      expect(parser).toBe(csvParser);
    });

    it('should return GenericParser for unknown file types', () => {
      expect(factory.getParser('data.pdf')).toBe(genericParser);
      expect(factory.getParser('data.json')).toBe(genericParser);
      expect(factory.getParser('data.xml')).toBe(genericParser);
      expect(factory.getParser('data.sql')).toBe(genericParser);
    });
  });
});

