/**
 * Shared type definitions for the Generic Data Importer
 */

// ─────────────────────────────────────────────────────────────
// Normalized Data Types (Parser Output)
// ─────────────────────────────────────────────────────────────

export interface NormalizedSource {
  filename: string;
  type: 'csv' | 'excel';
  sheet?: string;
}

export interface NormalizedDataContent {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  columnCount: number;
}

export interface NormalizedMetadata {
  parsedAt: string;
  parserVersion: string;
}

export interface NormalizedData {
  source: NormalizedSource;
  data: NormalizedDataContent;
  metadata: NormalizedMetadata;
}

// ─────────────────────────────────────────────────────────────
// Extraction Context Types
// ─────────────────────────────────────────────────────────────

export interface FieldDefinition {
  field: string;
  description: string;
}

export interface ExtractionContext {
  description: string;
  fields: FieldDefinition[];
}

// ─────────────────────────────────────────────────────────────
// Discovery (Pass 1) Types
// ─────────────────────────────────────────────────────────────

export interface DirectMapping {
  sourceColumn: string;
  confidence: number;
}

export interface DiscoveryResult {
  directMappings: Record<string, DirectMapping>;
  compoundColumns: Record<string, string[]>;
  unmappedFields: string[];
}

// ─────────────────────────────────────────────────────────────
// Compound Extraction (Pass 2) Types
// ─────────────────────────────────────────────────────────────

export interface CompoundFieldExtraction {
  value: string | null;
  confidence: number;
}

export interface CompoundRowExtraction {
  rowIndex: number;
  extractions: Record<string, Record<string, CompoundFieldExtraction>>;
}

export interface CompoundExtractionResult {
  extractions: CompoundRowExtraction[];
}

// ─────────────────────────────────────────────────────────────
// Final Extraction Result Types
// ─────────────────────────────────────────────────────────────

export interface DirectExtraction {
  value: string;
  targetField: string;
  confidence: number;
}

export interface CompoundExtractionItem {
  targetField: string;
  extractedValue: string | null;
  confidence: number;
}

export interface CompoundExtraction {
  sourceValue: string;
  extractions: CompoundExtractionItem[];
}

export interface ExtractedRowData {
  direct: Record<string, DirectExtraction>;
  compound: Record<string, CompoundExtraction>;
  unmapped: Record<string, string>;
}

export interface ExtractionSummary {
  directMappings: number;
  compoundExtractions: number;
  unmappedColumns: string[];
  unmappedFields: string[];
  llmCalls: number;
  processingTimeMs: number;
  averageConfidence: number;
}

export interface ExtractionMetadata {
  sourceFile: string;
  sourceSheet?: string;
  rowsProcessed: number;
  extractionSummary: ExtractionSummary;
}

export interface ExtractionResult {
  data: ExtractedRowData[];
  metadata: ExtractionMetadata;
}

// ─────────────────────────────────────────────────────────────
// Operation Types
// ─────────────────────────────────────────────────────────────

export type OperationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type OperationPhase = 'parsing' | 'discovery' | 'extraction' | 'mapping';

export interface OperationProgress {
  phase: OperationPhase;
  currentStep: string;
  rowsProcessed: number;
  totalRows: number;
  percentComplete: number;
}

export interface OperationError {
  code: string;
  message: string;
  phase?: OperationPhase;
  details?: Record<string, unknown>;
}

export interface Operation {
  operationId: string;
  status: OperationStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  progress?: OperationProgress;
  result?: ExtractionResult;
  error?: OperationError;
  // Request data for processing
  fileContent: Buffer;
  filename: string;
  sheetName?: string;
  context: ExtractionContext;
}

// ─────────────────────────────────────────────────────────────
// API Request/Response Types
// ─────────────────────────────────────────────────────────────

export interface ExtractRequestOptions {
  includeUnmappedColumns?: boolean;
  nullHandling?: 'empty_string' | 'null';
}

export interface ExtractRequest {
  filename: string;
  sheetName?: string;
  context: ExtractionContext;
  options?: ExtractRequestOptions;
}

export interface OperationLinks {
  self: string;
  cancel: string;
}

export interface ExtractResponse {
  operationId: string;
  status: OperationStatus;
  createdAt: string;
  links: OperationLinks;
}

export interface OperationStatusResponse {
  operationId: string;
  status: OperationStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  progress?: OperationProgress;
  result?: ExtractionResult;
  error?: OperationError;
}

// ─────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_SCHEMA'
  | 'LLM_ERROR'
  | 'EXTRACTION_ERROR'
  | 'VALIDATION_ERROR'
  | 'OPERATION_NOT_FOUND'
  | 'OPERATION_EXPIRED';

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

