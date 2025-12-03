import { CsvParser } from './csv.parser';
import { PARSER_VERSION } from './interfaces/parser.interface';

describe('CsvParser', () => {
  let parser: CsvParser;

  beforeEach(() => {
    parser = new CsvParser();
  });

  describe('supportedExtensions', () => {
    it('should return csv, tsv, and txt extensions', () => {
      const extensions = parser.supportedExtensions();
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.tsv');
      expect(extensions).toContain('.txt');
    });
  });

  describe('parse', () => {
    it('should parse a simple CSV file', async () => {
      const csvContent = Buffer.from(
        'Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles',
      );

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.source.filename).toBe('test.csv');
      expect(result.source.type).toBe('csv');
      expect(result.data.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.data.rowCount).toBe(2);
      expect(result.data.columnCount).toBe(3);
      expect(result.data.rows).toEqual([
        { Name: 'John', Age: '30', City: 'New York' },
        { Name: 'Jane', Age: '25', City: 'Los Angeles' },
      ]);
      expect(result.metadata.parserVersion).toBe(PARSER_VERSION);
    });

    it('should handle empty values', async () => {
      const csvContent = Buffer.from('Name,Age,City\nJohn,,New York\n,25,');

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.data.rows).toEqual([
        { Name: 'John', Age: '', City: 'New York' },
        { Name: '', Age: '25', City: '' },
      ]);
    });

    it('should trim whitespace from headers and values', async () => {
      const csvContent = Buffer.from(
        '  Name  , Age ,City\n  John  , 30 , New York  ',
      );

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.data.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.data.rows[0]).toEqual({
        Name: 'John',
        Age: '30',
        City: 'New York',
      });
    });

    it('should skip empty lines', async () => {
      const csvContent = Buffer.from(
        'Name,Age\nJohn,30\n\nJane,25\n\n',
      );

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.data.rowCount).toBe(2);
    });

    it('should handle files with only headers', async () => {
      const csvContent = Buffer.from('Name,Age,City');

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.data.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.data.rowCount).toBe(0);
      expect(result.data.rows).toEqual([]);
    });

    it('should handle quoted values with commas', async () => {
      const csvContent = Buffer.from(
        'Name,Description\nJohn,"A person, who is nice"\nJane,"Another, person"',
      );

      const result = await parser.parse(csvContent, 'test.csv');

      expect(result.data.rows[0].Description).toBe('A person, who is nice');
      expect(result.data.rows[1].Description).toBe('Another, person');
    });

    it('should convert all values to strings', async () => {
      const csvContent = Buffer.from('Value\n123\ntrue\nnull');

      const result = await parser.parse(csvContent, 'test.csv');

      expect(typeof result.data.rows[0].Value).toBe('string');
      expect(result.data.rows[0].Value).toBe('123');
      expect(result.data.rows[1].Value).toBe('true');
      expect(result.data.rows[2].Value).toBe('null');
    });
  });
});

