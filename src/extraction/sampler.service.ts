import { Injectable } from '@nestjs/common';
import { NormalizedData } from '../shared/types';

/**
 * Sampling thresholds
 */
const SAMPLE_THRESHOLD = 50;
const MAX_SAMPLE_SIZE = 30;

/**
 * Service for sampling rows from normalized data
 * Used to reduce the amount of data sent to LLM for discovery
 */
@Injectable()
export class SamplerService {
  /**
   * Sample rows from normalized data for discovery
   * 
   * Logic:
   * - If total rows <= 50, return all rows
   * - Otherwise, return first 30 rows
   */
  sample(normalizedData: NormalizedData): NormalizedData {
    const { rows, headers, rowCount, columnCount } = normalizedData.data;

    if (rowCount <= SAMPLE_THRESHOLD) {
      // Return all data as-is
      return normalizedData;
    }

    // Sample first MAX_SAMPLE_SIZE rows
    const sampledRows = rows.slice(0, MAX_SAMPLE_SIZE);

    return {
      ...normalizedData,
      data: {
        headers,
        rows: sampledRows,
        rowCount: sampledRows.length,
        columnCount,
      },
    };
  }

  /**
   * Get the sample size for a given dataset
   */
  getSampleSize(totalRows: number): number {
    return totalRows <= SAMPLE_THRESHOLD ? totalRows : MAX_SAMPLE_SIZE;
  }

  /**
   * Check if sampling will be applied
   */
  willSample(totalRows: number): boolean {
    return totalRows > SAMPLE_THRESHOLD;
  }
}

