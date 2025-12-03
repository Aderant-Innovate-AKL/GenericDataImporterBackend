import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import { Parser } from './interfaces/parser.interface';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';

/**
 * Factory for selecting appropriate parser based on file type
 */
@Injectable()
export class ParserFactory {
  private parsers: Parser[];

  constructor(
    private csvParser: CsvParser,
    private excelParser: ExcelParser,
  ) {
    this.parsers = [csvParser, excelParser];
  }

  /**
   * Get the appropriate parser for a given filename
   * @param filename - The filename to determine parser for
   * @returns The appropriate parser instance
   * @throws BadRequestException if no parser supports the file type
   */
  getParser(filename: string): Parser {
    const ext = path.extname(filename).toLowerCase();

    for (const parser of this.parsers) {
      if (parser.supportedExtensions().includes(ext)) {
        return parser;
      }
    }

    throw new BadRequestException(
      `Unsupported file format: ${ext}. Supported formats: ${this.getSupportedExtensions().join(', ')}`,
    );
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return this.parsers.flatMap((p) => p.supportedExtensions());
  }

  /**
   * Check if a file extension is supported
   */
  isSupported(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.getSupportedExtensions().includes(ext);
  }
}

