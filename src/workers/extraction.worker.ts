import { Injectable } from '@nestjs/common';
import { OperationsManager } from '../operations/operations.manager';
import { ParserFactory } from '../parsers/parser.factory';
import { ExtractorService } from '../extraction/extractor.service';
import { OperationError } from '../shared/types';

/**
 * Worker service for processing extraction operations
 * Handles the async extraction workflow
 */
@Injectable()
export class ExtractionWorker {
  constructor(
    private operationsManager: OperationsManager,
    private parserFactory: ParserFactory,
    private extractor: ExtractorService,
  ) {}

  /**
   * Process an extraction operation
   * This method is called asynchronously after operation creation
   */
  async processOperation(operationId: string): Promise<void> {
    console.log(`[ExtractionWorker] Starting operation ${operationId}`);

    try {
      // Update status to processing
      this.operationsManager.updateStatus(operationId, 'processing');

      // Get operation details
      const operation = this.operationsManager.get(operationId);

      // Check if operation was cancelled
      if (operation.status === 'cancelled') {
        console.log(`[ExtractionWorker] Operation ${operationId} was cancelled`);
        return;
      }

      // Phase 1: Parse file
      this.operationsManager.updateProgress(operationId, {
        phase: 'parsing',
        currentStep: 'Parsing file...',
        rowsProcessed: 0,
        totalRows: 0,
        percentComplete: 0,
      });

      const parser = this.parserFactory.getParser(operation.filename);
      const normalizedData = await parser.parse(
        operation.fileContent,
        operation.filename,
        { sheetName: operation.sheetName },
      );

      console.log(
        `[ExtractionWorker] Parsed ${normalizedData.data.rowCount} rows from ${operation.filename}`,
      );

      // Check for cancellation again
      const opAfterParse = this.operationsManager.get(operationId);
      if (opAfterParse.status === 'cancelled') {
        console.log(`[ExtractionWorker] Operation ${operationId} was cancelled after parsing`);
        return;
      }

      // Phase 2-3: Extract data (discovery + compound extraction + mapping)
      const result = await this.extractor.extract(
        normalizedData,
        operation.context,
        (progress) => {
          // Check for cancellation during extraction
          const currentOp = this.operationsManager.get(operationId);
          if (currentOp.status === 'cancelled') {
            throw new Error('Operation cancelled');
          }

          this.operationsManager.updateProgress(operationId, progress);
        },
      );

      // Complete the operation
      this.operationsManager.complete(operationId, result);
      console.log(`[ExtractionWorker] Completed operation ${operationId}`);
    } catch (error) {
      console.error(`[ExtractionWorker] Error processing operation ${operationId}:`, error);

      // Check if the operation still exists (might have been cleaned up)
      if (!this.operationsManager.exists(operationId)) {
        console.log(`[ExtractionWorker] Operation ${operationId} no longer exists`);
        return;
      }

      // Handle cancellation
      if (error.message === 'Operation cancelled') {
        return;
      }

      // Build error object
      const operationError: OperationError = {
        code: this.getErrorCode(error),
        message: error.message || 'Unknown error during extraction',
        phase: this.getCurrentPhase(operationId),
        details: {
          errorName: error.name,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      };

      this.operationsManager.fail(operationId, operationError);
    }
  }

  /**
   * Determine error code based on error type
   */
  private getErrorCode(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('parse') || message.includes('sheet')) {
      return 'PARSE_ERROR';
    }
    if (message.includes('llm') || message.includes('bedrock') || message.includes('inference')) {
      return 'LLM_ERROR';
    }
    if (message.includes('unsupported') || message.includes('format')) {
      return 'UNSUPPORTED_FORMAT';
    }
    return 'EXTRACTION_ERROR';
  }

  /**
   * Get current phase from operation progress
   */
  private getCurrentPhase(operationId: string): 'parsing' | 'discovery' | 'extraction' | 'mapping' {
    try {
      const operation = this.operationsManager.get(operationId);
      return operation.progress?.phase || 'parsing';
    } catch {
      return 'parsing';
    }
  }
}

