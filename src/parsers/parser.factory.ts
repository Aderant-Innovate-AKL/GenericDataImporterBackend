import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { Parser } from './interfaces/parser.interface';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { GenericParser } from './generic.parser';

/**
 * Factory for selecting appropriate parser based on file type
 */
@Injectable()
export class ParserFactory {
  private parsers: Parser[];

  constructor(
    private csvParser: CsvParser,
    private excelParser: ExcelParser,
    private genericParser: GenericParser,
  ) {
    this.parsers = [csvParser, excelParser];
  }

  /**
   * Get the appropriate parser for a given filename
   * @param filename - The filename to determine parser for
   * @returns The appropriate parser instance (uses GenericParser for unknown types)
   */
  getParser(filename: string): Parser {
    const ext = path.extname(filename).toLowerCase();

    for (const parser of this.parsers) {
      if (parser.supportedExtensions().includes(ext)) {
        return parser;
      }
    }

    // Use GenericParser for unknown file types
    // It will validate non-binary content and use LLM to extract structured data
    return this.genericParser;
  }
}

