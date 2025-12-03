import { Injectable } from '@nestjs/common';
import {
  NormalizedData,
  ExtractionContext,
  ExtractionResult,
  ExtractedRowData,
  DirectExtraction,
  CompoundExtraction,
  DiscoveryResult,
} from '../shared/types';
import { SamplerService } from './sampler.service';
import { LLMService } from './llm.service';
import {
  buildDiscoveryPrompt,
  parseDiscoveryResponse,
  ParsedDiscoveryResult,
} from './prompts/discovery.prompt';
import {
  buildCompoundPrompt,
  parseCompoundResponse,
  CompoundExtractionInput,
  ParsedCompoundResult,
} from './prompts/compound.prompt';

/**
 * Token threshold for chunking compound extractions
 */
const TOKEN_THRESHOLD = 4000;

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: {
  phase: 'discovery' | 'extraction' | 'mapping';
  currentStep: string;
  rowsProcessed: number;
  totalRows: number;
  percentComplete: number;
}) => void;

/**
 * Main extraction orchestrator
 * Coordinates the two-pass extraction process
 */
@Injectable()
export class ExtractorService {
  constructor(
    private sampler: SamplerService,
    private llm: LLMService,
  ) {}

  /**
   * Extract data from normalized input using context-driven LLM extraction
   */
  async extract(
    normalizedData: NormalizedData,
    context: ExtractionContext,
    onProgress?: ProgressCallback,
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    let llmCalls = 0;
    const allConfidences: number[] = [];

    // Phase 1: Sample and Discovery
    onProgress?.({
      phase: 'discovery',
      currentStep: 'Sampling data for analysis',
      rowsProcessed: 0,
      totalRows: normalizedData.data.rowCount,
      percentComplete: 5,
    });

    const sample = this.sampler.sample(normalizedData);

    onProgress?.({
      phase: 'discovery',
      currentStep: 'Analyzing column mappings',
      rowsProcessed: 0,
      totalRows: normalizedData.data.rowCount,
      percentComplete: 10,
    });

    // Build and execute discovery prompt
    const discoveryPrompt = buildDiscoveryPrompt(sample, context);
    const discoveryResponse = await this.llm.infer(discoveryPrompt);
    llmCalls++;

    const discoveryResult = parseDiscoveryResponse(discoveryResponse);
    console.log('[ExtractorService] Discovery result:', JSON.stringify(discoveryResult, null, 2));

    onProgress?.({
      phase: 'discovery',
      currentStep: 'Discovery complete',
      rowsProcessed: 0,
      totalRows: normalizedData.data.rowCount,
      percentComplete: 30,
    });

    // Phase 2: Compound Extraction (if needed)
    let compoundResult: ParsedCompoundResult | null = null;
    const compoundColumns = Object.keys(discoveryResult.compoundColumns);

    if (compoundColumns.length > 0) {
      onProgress?.({
        phase: 'extraction',
        currentStep: 'Extracting compound values',
        rowsProcessed: 0,
        totalRows: normalizedData.data.rowCount,
        percentComplete: 35,
      });

      const compoundCallCount = await this.extractCompoundValues(
        normalizedData,
        context,
        discoveryResult,
        (partial, rowsProcessed) => {
          compoundResult = partial;
          onProgress?.({
            phase: 'extraction',
            currentStep: `Processing row ${rowsProcessed} of ${normalizedData.data.rowCount}`,
            rowsProcessed,
            totalRows: normalizedData.data.rowCount,
            percentComplete: 35 + Math.round((rowsProcessed / normalizedData.data.rowCount) * 50),
          });
        },
      );

      llmCalls += compoundCallCount;
    }

    // Phase 3: Mapping - Build final result
    onProgress?.({
      phase: 'mapping',
      currentStep: 'Building final result',
      rowsProcessed: normalizedData.data.rowCount,
      totalRows: normalizedData.data.rowCount,
      percentComplete: 90,
    });

    const extractedData = this.buildExtractedData(
      normalizedData,
      discoveryResult,
      compoundResult,
      allConfidences,
    );

    // Calculate average confidence
    const avgConfidence =
      allConfidences.length > 0
        ? Math.round((allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 10) / 10
        : 0;

    // Build unmapped columns list
    const mappedSourceColumns = new Set<string>();
    for (const mapping of Object.values(discoveryResult.directMappings)) {
      mappedSourceColumns.add(mapping.sourceColumn);
    }
    for (const col of compoundColumns) {
      mappedSourceColumns.add(col);
    }
    const unmappedColumns = normalizedData.data.headers.filter(
      (h) => !mappedSourceColumns.has(h),
    );

    const result: ExtractionResult = {
      data: extractedData,
      metadata: {
        sourceFile: normalizedData.source.filename,
        sourceSheet: normalizedData.source.sheet,
        rowsProcessed: normalizedData.data.rowCount,
        extractionSummary: {
          directMappings: Object.keys(discoveryResult.directMappings).length,
          compoundExtractions: compoundColumns.reduce(
            (sum, col) => sum + discoveryResult.compoundColumns[col].length,
            0,
          ),
          unmappedColumns,
          unmappedFields: discoveryResult.unmappedFields,
          llmCalls,
          processingTimeMs: Date.now() - startTime,
          averageConfidence: avgConfidence,
        },
      },
    };

    onProgress?.({
      phase: 'mapping',
      currentStep: 'Complete',
      rowsProcessed: normalizedData.data.rowCount,
      totalRows: normalizedData.data.rowCount,
      percentComplete: 100,
    });

    return result;
  }

  /**
   * Extract values from compound columns using LLM
   * Handles chunking for large datasets
   */
  private async extractCompoundValues(
    normalizedData: NormalizedData,
    context: ExtractionContext,
    discoveryResult: ParsedDiscoveryResult,
    onPartialResult?: (result: ParsedCompoundResult, rowsProcessed: number) => void,
  ): Promise<number> {
    const compoundColumns = Object.keys(discoveryResult.compoundColumns);
    if (compoundColumns.length === 0) {
      return 0;
    }

    // Build extraction inputs
    const inputs: CompoundExtractionInput[] = compoundColumns.map((sourceColumn) => {
      const fieldNames = discoveryResult.compoundColumns[sourceColumn];
      const fieldsToExtract = context.fields.filter((f) => fieldNames.includes(f.field));

      const values = normalizedData.data.rows.map((row, index) => ({
        rowIndex: index,
        value: row[sourceColumn] || '',
      }));

      return {
        sourceColumn,
        fieldsToExtract,
        values,
      };
    });

    // Estimate tokens and chunk if necessary
    const promptPreview = buildCompoundPrompt(inputs);
    const estimatedTokens = this.llm.estimateTokenCount(promptPreview);

    let llmCalls = 0;
    const allExtractions: ParsedCompoundResult['extractions'] = [];

    if (estimatedTokens <= TOKEN_THRESHOLD) {
      // Single call
      const response = await this.llm.infer(promptPreview);
      llmCalls++;
      const result = parseCompoundResponse(response);
      allExtractions.push(...result.extractions);
      onPartialResult?.({ extractions: allExtractions }, normalizedData.data.rowCount);
    } else {
      // Chunk by rows
      const rowCount = normalizedData.data.rows.length;
      const chunkSize = Math.ceil(rowCount / Math.ceil(estimatedTokens / TOKEN_THRESHOLD));

      for (let start = 0; start < rowCount; start += chunkSize) {
        const end = Math.min(start + chunkSize, rowCount);

        // Build chunked inputs
        const chunkedInputs: CompoundExtractionInput[] = inputs.map((input) => ({
          ...input,
          values: input.values.slice(start, end),
        }));

        const chunkPrompt = buildCompoundPrompt(chunkedInputs);
        const response = await this.llm.infer(chunkPrompt);
        llmCalls++;

        const chunkResult = parseCompoundResponse(response);
        allExtractions.push(...chunkResult.extractions);
        onPartialResult?.({ extractions: allExtractions }, end);
      }
    }

    return llmCalls;
  }

  /**
   * Build the final extracted data structure
   */
  private buildExtractedData(
    normalizedData: NormalizedData,
    discoveryResult: ParsedDiscoveryResult,
    compoundResult: ParsedCompoundResult | null,
    allConfidences: number[],
  ): ExtractedRowData[] {
    const { rows, headers } = normalizedData.data;

    // Build lookup for compound extractions by row index and source column
    const compoundLookup = new Map<string, Map<string, { value: string | null; confidence: number }>>();
    if (compoundResult) {
      for (const extraction of compoundResult.extractions) {
        const key = `${extraction.rowIndex}:${extraction.sourceColumn}`;
        if (!compoundLookup.has(key)) {
          compoundLookup.set(key, new Map());
        }
        const fieldMap = compoundLookup.get(key)!;
        for (const [fieldName, fieldData] of Object.entries(extraction.fields)) {
          fieldMap.set(fieldName, {
            value: fieldData.value,
            confidence: fieldData.confidence,
          });
          allConfidences.push(fieldData.confidence);
        }
      }
    }

    // Determine which columns are mapped
    const mappedSourceColumns = new Set<string>();
    for (const mapping of Object.values(discoveryResult.directMappings)) {
      mappedSourceColumns.add(mapping.sourceColumn);
    }
    for (const col of Object.keys(discoveryResult.compoundColumns)) {
      mappedSourceColumns.add(col);
    }

    return rows.map((row, rowIndex) => {
      const direct: Record<string, DirectExtraction> = {};
      const compound: Record<string, CompoundExtraction> = {};
      const unmapped: Record<string, string> = {};

      // Process direct mappings
      for (const [targetField, mapping] of Object.entries(discoveryResult.directMappings)) {
        const sourceColumn = mapping.sourceColumn;
        direct[sourceColumn] = {
          value: row[sourceColumn] || '',
          targetField,
          confidence: mapping.confidence,
        };
        allConfidences.push(mapping.confidence);
      }

      // Process compound columns
      for (const [sourceColumn, targetFields] of Object.entries(discoveryResult.compoundColumns)) {
        const sourceValue = row[sourceColumn] || '';
        const extractions = targetFields.map((targetField) => {
          const key = `${rowIndex}:${sourceColumn}`;
          const fieldData = compoundLookup.get(key)?.get(targetField);
          return {
            targetField,
            extractedValue: fieldData?.value ?? null,
            confidence: fieldData?.confidence ?? 0,
          };
        });

        compound[sourceColumn] = {
          sourceValue,
          extractions,
        };
      }

      // Process unmapped columns
      for (const header of headers) {
        if (!mappedSourceColumns.has(header)) {
          unmapped[header] = row[header] || '';
        }
      }

      return { direct, compound, unmapped };
    });
  }
}

