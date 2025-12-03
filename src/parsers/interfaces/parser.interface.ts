import { NormalizedData } from '../../shared/types';

/**
 * Options for parsing files
 */
export interface ParseOptions {
  sheetName?: string;
}

/**
 * Interface for file parsers
 * All parsers must implement this interface to ensure consistent behavior
 */
export interface Parser {
  /**
   * Parse file content into normalized JSON format
   * @param fileContent - Raw file content as Buffer
   * @param filename - Original filename (used for metadata)
   * @param options - Optional parsing options
   * @returns Normalized data structure
   */
  parse(
    fileContent: Buffer,
    filename: string,
    options?: ParseOptions,
  ): Promise<NormalizedData>;

  /**
   * Get list of file extensions this parser supports
   * @returns Array of supported extensions (e.g., ['.csv', '.tsv'])
   */
  supportedExtensions(): string[];
}

/**
 * Parser version for metadata tracking
 */
export const PARSER_VERSION = '1.0.0';

