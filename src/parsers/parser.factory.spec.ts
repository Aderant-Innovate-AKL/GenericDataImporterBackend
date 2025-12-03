import { ParserFactory } from './parser.factory';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { BadRequestException } from '@nestjs/common';

describe('ParserFactory', () => {
  let factory: ParserFactory;
  let csvParser: CsvParser;
  let excelParser: ExcelParser;

  beforeEach(() => {
    csvParser = new CsvParser();
    excelParser = new ExcelParser();
    factory = new ParserFactory(csvParser, excelParser);
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

    it('should throw BadRequestException for unsupported formats', () => {
      expect(() => factory.getParser('data.pdf')).toThrow(BadRequestException);
      expect(() => factory.getParser('data.json')).toThrow(BadRequestException);
      expect(() => factory.getParser('data.xml')).toThrow(BadRequestException);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = factory.getSupportedExtensions();
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.xlsx');
      expect(extensions).toContain('.xls');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported files', () => {
      expect(factory.isSupported('data.csv')).toBe(true);
      expect(factory.isSupported('data.xlsx')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(factory.isSupported('data.pdf')).toBe(false);
      expect(factory.isSupported('data.json')).toBe(false);
    });
  });
});

