import { Injectable } from '@nestjs/common';
import {
  ExtractionResult,
  ExtractedRowData,
  NormalizedData,
  DiscoveryResult,
} from '../shared/types';

/**
 * Final output row - simple key-value pairs for target fields
 */
export interface FinalOutputRow {
  [fieldName: string]: string | null;
}

/**
 * Service for mapping and transforming extraction results
 */
@Injectable()
export class MapperService {
  /**
   * Transform extraction result to final output format
   * Flattens the categorized structure to simple field-value pairs
   */
  toFinalOutput(result: ExtractionResult): FinalOutputRow[] {
    return result.data.map((row) => this.transformRow(row));
  }

  /**
   * Transform a single extracted row to final output format
   */
  private transformRow(row: ExtractedRowData): FinalOutputRow {
    const output: FinalOutputRow = {};

    // Process direct mappings
    for (const [_sourceColumn, extraction] of Object.entries(row.direct)) {
      output[extraction.targetField] = extraction.value || null;
    }

    // Process compound extractions
    for (const [_sourceColumn, compound] of Object.entries(row.compound)) {
      for (const extraction of compound.extractions) {
        output[extraction.targetField] = extraction.extractedValue;
      }
    }

    return output;
  }

  /**
   * Get all mapped target fields from an extraction result
   */
  getMappedFields(result: ExtractionResult): string[] {
    const fields = new Set<string>();

    if (result.data.length === 0) {
      return [];
    }

    const sampleRow = result.data[0];

    // Direct mappings
    for (const extraction of Object.values(sampleRow.direct)) {
      fields.add(extraction.targetField);
    }

    // Compound extractions
    for (const compound of Object.values(sampleRow.compound)) {
      for (const extraction of compound.extractions) {
        fields.add(extraction.targetField);
      }
    }

    return Array.from(fields);
  }

  /**
   * Get all source columns from an extraction result
   */
  getSourceColumns(result: ExtractionResult): {
    direct: string[];
    compound: string[];
    unmapped: string[];
  } {
    if (result.data.length === 0) {
      return { direct: [], compound: [], unmapped: [] };
    }

    const sampleRow = result.data[0];

    return {
      direct: Object.keys(sampleRow.direct),
      compound: Object.keys(sampleRow.compound),
      unmapped: Object.keys(sampleRow.unmapped),
    };
  }

  /**
   * Calculate extraction statistics
   */
  getExtractionStats(result: ExtractionResult): {
    totalRows: number;
    directMappings: number;
    compoundExtractions: number;
    averageConfidence: number;
    lowConfidenceCount: number;
  } {
    let totalConfidence = 0;
    let confidenceCount = 0;
    let lowConfidenceCount = 0;

    for (const row of result.data) {
      // Direct mappings
      for (const extraction of Object.values(row.direct)) {
        totalConfidence += extraction.confidence;
        confidenceCount++;
        if (extraction.confidence < 5) {
          lowConfidenceCount++;
        }
      }

      // Compound extractions
      for (const compound of Object.values(row.compound)) {
        for (const extraction of compound.extractions) {
          totalConfidence += extraction.confidence;
          confidenceCount++;
          if (extraction.confidence < 5) {
            lowConfidenceCount++;
          }
        }
      }
    }

    const sampleRow = result.data[0];

    return {
      totalRows: result.data.length,
      directMappings: sampleRow ? Object.keys(sampleRow.direct).length : 0,
      compoundExtractions: sampleRow
        ? Object.values(sampleRow.compound).reduce(
            (sum, c) => sum + c.extractions.length,
            0,
          )
        : 0,
      averageConfidence:
        confidenceCount > 0
          ? Math.round((totalConfidence / confidenceCount) * 10) / 10
          : 0,
      lowConfidenceCount,
    };
  }
}

