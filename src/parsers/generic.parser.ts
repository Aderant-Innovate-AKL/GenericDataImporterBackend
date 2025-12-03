import { Injectable, BadRequestException } from '@nestjs/common';
import { NormalizedData } from '../shared/types';
import { Parser, ParseOptions, PARSER_VERSION } from './interfaces/parser.interface';
import { LLMService } from '../extraction/llm.service';
import { isBinaryContent, getBinaryDetectionReason } from './utils/binary-detection';
import {
  buildRawTextDiscoveryPrompt,
  parseRawTextDiscoveryResponse,
} from './prompts/raw-text-discovery.prompt';

/**
 * Generic parser for unknown file types
 * Uses LLM to extract structured data from non-binary text files
 */
@Injectable()
export class GenericParser implements Parser {
  constructor(private llmService: LLMService) {}

  /**
   * This parser doesn't match any specific extensions - it's used as a fallback
   */
  supportedExtensions(): string[] {
    return [];
  }

  async parse(
    fileContent: Buffer,
    filename: string,
    _options?: ParseOptions,
  ): Promise<NormalizedData> {
    console.log(`[GenericParser] Attempting to parse file: ${filename}`);

    // Step 1: Validate that the file is not binary
    if (isBinaryContent(fileContent)) {
      const reason = getBinaryDetectionReason(fileContent);
      throw new BadRequestException(
        `Cannot process binary file: ${filename}. ${reason || 'File contains binary content'}`,
      );
    }

    // Step 2: Convert buffer to string
    const rawContent = fileContent.toString('utf-8');
    console.log(`[GenericParser] File content length: ${rawContent.length} characters`);

    // Step 3: Use LLM to discover and extract structured data
    console.log(`[GenericParser] Sending content to LLM for structure discovery...`);
    const prompt = buildRawTextDiscoveryPrompt(rawContent);
    const llmResponse = await this.llmService.infer(prompt);

    // Step 4: Parse LLM response
    const discoveryResult = parseRawTextDiscoveryResponse(llmResponse);

    if (!discoveryResult.success) {
      throw new BadRequestException(
        `Could not extract structured data from ${filename}: ${discoveryResult.reason}`,
      );
    }

    console.log(
      `[GenericParser] Successfully extracted ${discoveryResult.rows?.length || 0} rows with ${discoveryResult.headers?.length || 0} columns`,
    );
    console.log(`[GenericParser] Data pattern identified: ${discoveryResult.dataPattern}`);

    // Step 5: Return normalized data
    const headers = discoveryResult.headers || [];
    const rows = discoveryResult.rows || [];

    return {
      source: {
        filename,
        type: 'raw',
      },
      data: {
        headers,
        rows,
        rowCount: rows.length,
        columnCount: headers.length,
      },
      metadata: {
        parsedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
      },
    };
  }
}

