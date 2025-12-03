import { Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import { NormalizedData } from '../shared/types';
import { Parser, ParseOptions, PARSER_VERSION } from './interfaces/parser.interface';

/**
 * Parser for CSV files
 * Converts CSV content to normalized JSON format
 */
@Injectable()
export class CsvParser implements Parser {
  supportedExtensions(): string[] {
    return ['.csv', '.tsv', '.txt'];
  }

  async parse(
    fileContent: Buffer,
    filename: string,
    _options?: ParseOptions,
  ): Promise<NormalizedData> {
    const content = fileContent.toString('utf-8');

    // Parse CSV using PapaParse
    const result = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => value.trim(),
    });

    if (result.errors.length > 0) {
      // Log warnings but don't fail - PapaParse is lenient
      console.warn('[CsvParser] Parse warnings:', result.errors);
    }

    const headers = result.meta.fields || [];
    const rows = result.data;

    // Convert all values to strings for consistency
    const normalizedRows = rows.map((row) => {
      const normalizedRow: Record<string, string> = {};
      for (const header of headers) {
        const value = row[header];
        normalizedRow[header] = value !== undefined && value !== null ? String(value) : '';
      }
      return normalizedRow;
    });

    return {
      source: {
        filename,
        type: 'csv',
      },
      data: {
        headers,
        rows: normalizedRows,
        rowCount: normalizedRows.length,
        columnCount: headers.length,
      },
      metadata: {
        parsedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
      },
    };
  }
}

