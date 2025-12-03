import { ExcelParser } from './excel.parser';
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

describe('ExcelParser', () => {
  let parser: ExcelParser;

  beforeEach(() => {
    parser = new ExcelParser();
  });

  // Helper to create Excel buffer from data
  function createExcelBuffer(
    data: Record<string, string>[],
    sheetName = 'Sheet1',
  ): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  describe('supportedExtensions', () => {
    it('should return excel extensions', () => {
      const extensions = parser.supportedExtensions();
      expect(extensions).toContain('.xlsx');
      expect(extensions).toContain('.xls');
      expect(extensions).toContain('.xlsm');
      expect(extensions).toContain('.xlsb');
    });
  });

  describe('parse', () => {
    it('should parse a simple Excel file', async () => {
      const data = [
        { Name: 'John', Age: '30', City: 'New York' },
        { Name: 'Jane', Age: '25', City: 'Los Angeles' },
      ];
      const buffer = createExcelBuffer(data);

      const result = await parser.parse(buffer, 'test.xlsx');

      expect(result.source.filename).toBe('test.xlsx');
      expect(result.source.type).toBe('excel');
      expect(result.source.sheet).toBe('Sheet1');
      expect(result.data.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.data.rowCount).toBe(2);
      expect(result.data.columnCount).toBe(3);
    });

    it('should parse specific sheet when sheetName is provided', async () => {
      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new();
      const sheet1 = XLSX.utils.json_to_sheet([{ A: '1' }]);
      const sheet2 = XLSX.utils.json_to_sheet([{ B: '2' }, { B: '3' }]);
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Sheet1');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Data');
      const buffer = Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      );

      const result = await parser.parse(buffer, 'test.xlsx', { sheetName: 'Data' });

      expect(result.source.sheet).toBe('Data');
      expect(result.data.headers).toEqual(['B']);
      expect(result.data.rowCount).toBe(2);
    });

    it('should throw error for non-existent sheet', async () => {
      const buffer = createExcelBuffer([{ A: '1' }]);

      await expect(
        parser.parse(buffer, 'test.xlsx', { sheetName: 'NonExistent' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle empty sheets', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Empty');
      const buffer = Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      );

      const result = await parser.parse(buffer, 'test.xlsx');

      expect(result.data.rowCount).toBe(0);
      expect(result.data.headers).toEqual([]);
    });

    it('should filter out empty headers', async () => {
      const workbook = XLSX.utils.book_new();
      // Create sheet with empty header columns
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Name', '', 'Age', ''],
        ['John', '', '30', ''],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      );

      const result = await parser.parse(buffer, 'test.xlsx');

      expect(result.data.headers).toEqual(['Name', 'Age']);
      expect(result.data.columnCount).toBe(2);
    });

    it('should filter out completely empty rows', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Name', 'Age'],
        ['John', '30'],
        ['', ''],
        ['Jane', '25'],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      );

      const result = await parser.parse(buffer, 'test.xlsx');

      expect(result.data.rowCount).toBe(2);
    });
  });

  describe('getSheetMetadata', () => {
    it('should return metadata for all sheets', () => {
      const workbook = XLSX.utils.book_new();
      const sheet1 = XLSX.utils.aoa_to_sheet([
        ['A', 'B'],
        ['1', '2'],
        ['3', '4'],
      ]);
      const sheet2 = XLSX.utils.aoa_to_sheet([
        ['X', 'Y', 'Z'],
        ['a', 'b', 'c'],
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Data');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Summary');
      const buffer = Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      );

      const metadata = parser.getSheetMetadata(buffer);

      expect(metadata).toHaveLength(2);
      expect(metadata[0].name).toBe('Data');
      expect(metadata[1].name).toBe('Summary');
    });
  });
});

