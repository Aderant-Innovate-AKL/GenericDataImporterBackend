import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { NormalizedData } from '../shared/types';
import { Parser, ParseOptions, PARSER_VERSION } from './interfaces/parser.interface';

/**
 * Parser for Excel files
 * Converts Excel content to normalized JSON format
 * Only parses ONE sheet at a time (configurable via options)
 */
@Injectable()
export class ExcelParser implements Parser {
  supportedExtensions(): string[] {
    return ['.xlsx', '.xls', '.xlsm', '.xlsb'];
  }

  async parse(
    fileContent: Buffer,
    filename: string,
    options?: ParseOptions,
  ): Promise<NormalizedData> {
    // Read workbook from buffer
    const workbook = XLSX.read(fileContent, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: true,
    });

    // Determine which sheet to parse
    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) {
      throw new BadRequestException('Excel file contains no sheets');
    }

    let targetSheet: string;
    if (options?.sheetName) {
      if (!sheetNames.includes(options.sheetName)) {
        throw new BadRequestException(
          `Sheet '${options.sheetName}' not found. Available sheets: ${sheetNames.join(', ')}`,
        );
      }
      targetSheet = options.sheetName;
    } else {
      // Default to first sheet
      targetSheet = sheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheet];
    if (!worksheet) {
      throw new BadRequestException(`Unable to read sheet '${targetSheet}'`);
    }

    // Convert to JSON with header row (array of arrays format)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown[][];

    if (jsonData.length === 0) {
      return {
        source: {
          filename,
          type: 'excel',
          sheet: targetSheet,
        },
        data: {
          headers: [],
          rows: [],
          rowCount: 0,
          columnCount: 0,
        },
        metadata: {
          parsedAt: new Date().toISOString(),
          parserVersion: PARSER_VERSION,
        },
      };
    }

    // First row is headers
    const headers = (jsonData[0] as unknown[]).map((h) =>
      h !== undefined && h !== null ? String(h).trim() : '',
    );

    // Filter out empty headers
    const validHeaderIndices = headers
      .map((h, i) => (h !== '' ? i : -1))
      .filter((i) => i !== -1);
    const validHeaders = validHeaderIndices.map((i) => headers[i]);

    // Remaining rows are data
    const rows = jsonData.slice(1).map((row) => {
      const rowData: Record<string, string> = {};
      for (const i of validHeaderIndices) {
        const header = headers[i];
        const value = (row as unknown[])[i];
        rowData[header] = value !== undefined && value !== null ? String(value).trim() : '';
      }
      return rowData;
    });

    // Filter out completely empty rows
    const nonEmptyRows = rows.filter((row) =>
      Object.values(row).some((v) => v !== ''),
    );

    return {
      source: {
        filename,
        type: 'excel',
        sheet: targetSheet,
      },
      data: {
        headers: validHeaders,
        rows: nonEmptyRows,
        rowCount: nonEmptyRows.length,
        columnCount: validHeaders.length,
      },
      metadata: {
        parsedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
      },
    };
  }

  /**
   * Get metadata about sheets in an Excel file without full parsing
   * Useful for sheet selection UI
   */
  getSheetMetadata(
    fileContent: Buffer,
  ): Array<{ name: string; rowCount: number; columnCount: number }> {
    // Need to read sheets to get their ranges
    const workbook = XLSX.read(fileContent, {
      type: 'buffer',
    });

    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets?.[name];
      const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;

      return {
        name,
        rowCount: range ? range.e.r - range.s.r : 0,
        columnCount: range ? range.e.c - range.s.c + 1 : 0,
      };
    });
  }
}

