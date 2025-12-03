# Generic Data Importer - Implementation Plan

## Overview

A two-repository architecture for importing and extracting structured data from files using AI/ML inference. The system intelligently maps source data to a user-defined schema using LLM-based field extraction.

**Repository Structure:**
- **Backend Repository** - TypeScript/Node.js API service (Express or Fastify)
- **Frontend Repository** - React component library + demo application

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND REPOSITORY (React + MUI)                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Demo Application                        │ │
│  │                   (Next.js or Vite)                        │ │
│  └─────────────────────┬─────────────────────────────────────┘ │
│                        │ uses                                   │
│  ┌─────────────────────▼─────────────────────────────────────┐ │
│  │              Component Library (npm package)               │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │ │
│  │  │FileDropzone│ │ImportDialog│ │ResultsTable│ │CompoundCell│  │ │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘  │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │              ImportService (API Client)              │  │ │
│  │  └─────────────────────────┬───────────────────────────┘  │ │
│  └────────────────────────────┼──────────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────────┘
                                │ HTTP/REST
┌───────────────────────────────▼─────────────────────────────────┐
│              BACKEND REPOSITORY (TypeScript/Node.js)            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Service                           │   │
│  │  ┌───────────┐ ┌───────────┐ ┌────────────────────────┐ │   │
│  │  │FileParser │ │  Sampler  │ │  ExtractionOrchestrator │ │   │
│  │  └───────────┘ └───────────┘ └────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │                    LLM Service                       ││   │
│  │  │  ┌─────────────────┐    ┌─────────────────────────┐ ││   │
│  │  │  │ Pass 1: Discover │    │ Pass 2: Extract Compounds│ ││   │
│  │  │  └─────────────────┘    └─────────────────────────┘ ││   │
│  │  └─────────────────────────────────────────────────────┘│   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │                   Mapping Engine                     ││   │
│  │  └─────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│           External Inference Endpoint                           │
│        (OpenAI / Azure / Local LLM / etc.)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Backend API Routes (Next.js)

### 1.1 File Normalization Layer

All file types are converted to a normalized JSON format before LLM interaction.

**Supported File Types (Initial):**
- CSV
- Excel (.xlsx, .xls)

**Future File Types:**
- PDF
- Images
- JSON

**Normalized JSON Schema (Rows as Objects):**

```json
{
  "source": {
    "filename": "sales_data.xlsx",
    "type": "excel",
    "sheet": "Sheet1"
  },
  "data": {
    "headers": ["Date", "Product", "Revenue", "Units"],
    "rows": [
      {"Date": "2024-01-15", "Product": "Widget A", "Revenue": "1500.00", "Units": "30"},
      {"Date": "2024-01-16", "Product": "Widget B", "Revenue": "2300.50", "Units": "45"}
    ],
    "rowCount": 150,
    "columnCount": 4
  },
  "metadata": {
    "parsedAt": "2024-12-03T10:30:00Z",
    "parserVersion": "1.0.0"
  }
}
```

**Parser Rules:**
- Only parse ONE sheet (Excel)
- Optional `sheetName` parameter (defaults to first sheet)
- All values converted to strings for consistency

### 1.2 Context Schema

Users provide context describing what to extract:

```json
{
  "description": "Monthly sales report from regional distributors. Used for revenue forecasting and inventory planning.",
  "fields": [
    {
      "field": "transaction_date",
      "description": "The date the sale occurred"
    },
    {
      "field": "product_sku",
      "description": "The product identifier or SKU code"
    },
    {
      "field": "quantity_sold",
      "description": "Number of units sold in the transaction"
    },
    {
      "field": "unit_price",
      "description": "Price per unit at time of sale"
    },
    {
      "field": "customer_region",
      "description": "Geographic region of the customer"
    }
  ]
}
```

### 1.3 Two-Pass Extraction Strategy

#### Sampling Logic

```
if total_rows <= 50:
    sample = all_rows
else:
    sample = first_30_rows
```

#### Pass 1: Discovery

**Purpose:** Identify direct column mappings and compound/generic columns.

**Input:** Sample rows (max 30) + Context

**Output:**
```json
{
  "direct_mappings": {
    "total_amount": { "source_column": "Amount", "confidence": 9 },
    "order_date": { "source_column": "Date", "confidence": 8 }
  },
  "compound_columns": {
    "Order Ref": ["product_type", "region", "order_year"],
    "Data": ["customer_name", "sales_rep"]
  },
  "unmapped_fields": ["tax_rate"]
}
```

#### Pass 2: Compound Extraction (Conditional)

**Triggered:** Only if compound columns are identified in Pass 1.

**Purpose:** Extract values from compound/generic columns using LLM.

**Input:** ALL compound column values (batched), fields to extract

```json
{
  "compound_columns": {
    "Order Ref": {
      "fields_to_extract": [
        {"field": "product_type", "description": "The type of product sold"},
        {"field": "region", "description": "Geographic region code"},
        {"field": "order_year", "description": "Year the order was placed"}
      ],
      "values": [
        "ORD-2024-NYC-WIDGET",
        "ORD-2024-LA-GADGET",
        "ORD-2023-CHI-GIZMO"
      ]
    },
    "Data": {
      "fields_to_extract": [
        {"field": "customer_name", "description": "Name of the customer"},
        {"field": "sales_rep", "description": "Sales representative name"}
      ],
      "values": [
        "Acme Corp - John Smith",
        "BigCo Inc - Jane Doe"
      ]
    }
  }
}
```

**Output:** Extracted values per row with confidence scores

```json
{
  "extractions": [
    {
      "row_index": 0,
      "Order Ref": {
        "product_type": { "value": "WIDGET", "confidence": 9 },
        "region": { "value": "NYC", "confidence": 10 },
        "order_year": { "value": "2024", "confidence": 10 }
      },
      "Data": {
        "customer_name": { "value": "Acme Corp", "confidence": 8 },
        "sales_rep": { "value": "John Smith", "confidence": 7 }
      }
    },
    {
      "row_index": 1,
      "Order Ref": {
        "product_type": { "value": "GADGET", "confidence": 9 },
        "region": { "value": "LA", "confidence": 10 },
        "order_year": { "value": "2024", "confidence": 10 }
      },
      "Data": {
        "customer_name": { "value": "BigCo Inc", "confidence": 9 },
        "sales_rep": { "value": "Jane Doe", "confidence": 8 }
      }
    }
  ]
}
```

#### Extraction Method Summary

| Column Type | Extraction Method | Applied To |
|-------------|-------------------|------------|
| **Direct mapping** | Programmatic (rename column) | All rows automatically |
| **Compound/Generic** | LLM extraction (Pass 2) | All rows via LLM |

#### Confidence Scores

The LLM provides a confidence score (1-10) for every extraction:

| Score Range | Meaning | UI Indicator |
|-------------|---------|--------------|
| **8-10** | High confidence - strong match or clear pattern | ●●● (green) |
| **5-7** | Medium confidence - reasonable inference with some ambiguity | ●●○ (yellow) |
| **1-4** | Low confidence - weak match, user verification recommended | ●○○ (red) |

**Confidence is included in:**
- Each extracted value in the API response
- The final output returned to the calling application
- Extraction metadata (average confidence across all extractions)

**User overrides:** When a user manually corrects an AI extraction:
- The cell is marked with `isUserModified: true`
- No confidence score is displayed (user selections are assumed correct)
- The UI shows a neutral gray highlight instead of confidence-based colors

### 1.4 Large File Handling

For files where compound column data exceeds token limits:

```
if compound_column_data > TOKEN_THRESHOLD:
    chunk compound values into batches
    make multiple Pass 2 calls
    merge all extraction results
```

| Rows | Pass 2 Calls |
|------|--------------|
| ≤200 | 1 call |
| 200-400 | 2 calls |
| 400-600 | 3 calls |
| etc. | chunk as needed |

### 1.5 API Conventions

**Case Convention:** The API uses **camelCase** for all JSON field names, matching TypeScript conventions throughout the application.

**Null Handling:** Empty/missing values are represented as:
- Empty strings for text fields that exist but have no value
- `null` for fields that could not be extracted

---

### 1.6 Async API Design

The API uses an **async request-reply pattern** to handle long-running LLM operations. This approach:
- Prevents HTTP timeouts during multi-pass extraction
- Enables progress tracking for better UX
- Allows operations to continue if client disconnects
- Supports cancellation of in-progress operations

#### Endpoint Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/extract` | POST | Initiate extraction → returns `operation_id` |
| `/operations/{operation_id}` | GET | Get operation status and result (when complete) |
| `/operations/{operation_id}/cancel` | POST | Cancel a running operation |
| `/health` | GET | Service health check |

#### Operation State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌─────────┐    ┌────────────┐    ┌─────────────┐    ┌────┴────┐
│ pending │───▶│ processing │───▶│  completed  │    │cancelled│
└─────────┘    └────────────┘    └─────────────┘    └─────────┘
                    │
                    │ error
                    ▼
               ┌─────────┐
               │ failed  │
               └─────────┘
```

| Status | Description |
|--------|-------------|
| `pending` | Operation created, queued for processing |
| `processing` | Actively parsing/extracting |
| `completed` | Successfully finished, result available |
| `failed` | Error occurred, see `error` field |
| `cancelled` | User cancelled the operation |

#### Progress Tracking

During processing, operations report progress through phases:

| Phase | Description |
|-------|-------------|
| `parsing` | File being parsed to normalized JSON |
| `discovery` | Pass 1: Identifying column mappings |
| `extraction` | Pass 2: Extracting from compound columns |
| `mapping` | Applying mappings and merging results |

---

#### `POST /extract`

Initiate an extraction operation.

**Request:**
```json
{
  "file": "<base64 or multipart>",
  "filename": "sales_report.xlsx",
  "sheet_name": "Q1 Sales",
  "context": {
    "description": "Monthly sales report from regional distributors...",
    "fields": [
      {"field": "transaction_date", "description": "The date the sale occurred"},
      {"field": "product_sku", "description": "The product identifier or SKU code"}
    ]
  },
  "options": {
    "include_unmapped_columns": false,
    "null_handling": "empty_string"
  }
}
```

**Response (202 Accepted):**
```json
{
  "operation_id": "op_a1b2c3d4e5f6",
  "status": "pending",
  "created_at": "2024-12-03T10:30:00Z",
  "links": {
    "self": "/operations/op_a1b2c3d4e5f6",
    "cancel": "/operations/op_a1b2c3d4e5f6/cancel"
  }
}
```

---

#### `GET /operations/{operation_id}`

Get operation status and result. Single endpoint serves both status checks and result retrieval.

**Response (Processing):**
```json
{
  "operation_id": "op_a1b2c3d4e5f6",
  "status": "processing",
  "created_at": "2024-12-03T10:30:00Z",
  "started_at": "2024-12-03T10:30:01Z",
  "progress": {
    "phase": "extraction",
    "current_step": "pass_2_chunk_2",
    "rows_processed": 150,
    "total_rows": 500,
    "percent_complete": 30
  }
}
```

**Response (Completed):**

The result uses a **categorized row structure** where each row separates data by extraction type (direct, compound, unmapped). This enables:
- Enumerating all source columns from the file
- Supporting multiple target fields from a single compound column
- Preserving original values for UI display and user override

```json
{
  "operation_id": "op_a1b2c3d4e5f6",
  "status": "completed",
  "created_at": "2024-12-03T10:30:00Z",
  "started_at": "2024-12-03T10:30:01Z",
  "completed_at": "2024-12-03T10:30:18Z",
  "result": {
    "data": [
      {
        "direct": {
          "Date": {
            "value": "2024-01-15",
            "targetField": "transaction_date",
            "confidence": 9
          },
          "Amount": {
            "value": "1500.00",
            "targetField": "total_amount",
            "confidence": 10
          },
          "SKU": {
            "value": "WGT-001",
            "targetField": "product_sku",
            "confidence": 10
          }
        },
        "compound": {
          "Order Ref": {
            "sourceValue": "ORD-2024-NYC-WIDGET",
            "extractions": [
              { "targetField": "region", "extractedValue": "NYC", "confidence": 9 },
              { "targetField": "order_year", "extractedValue": "2024", "confidence": 10 },
              { "targetField": "product_type", "extractedValue": "WIDGET", "confidence": 8 }
            ]
          }
        },
        "unmapped": {
          "Notes": "Rush order",
          "Internal Code": "X-42"
        }
      },
      {
        "direct": {
          "Date": {
            "value": "2024-01-16",
            "targetField": "transaction_date",
            "confidence": 9
          },
          "Amount": {
            "value": "2300.50",
            "targetField": "total_amount",
            "confidence": 10
          },
          "SKU": {
            "value": "WGT-002",
            "targetField": "product_sku",
            "confidence": 10
          }
        },
        "compound": {
          "Order Ref": {
            "sourceValue": "ORD-2024-LA-GADGET",
            "extractions": [
              { "targetField": "region", "extractedValue": "LA", "confidence": 9 },
              { "targetField": "order_year", "extractedValue": "2024", "confidence": 10 },
              { "targetField": "product_type", "extractedValue": "GADGET", "confidence": 9 }
            ]
          }
        },
        "unmapped": {
          "Notes": "",
          "Internal Code": "X-43"
        }
      }
    ],
    "metadata": {
      "sourceFile": "sales_report.xlsx",
      "sourceSheet": "Q1 Sales",
      "rowsProcessed": 500,
      "extractionSummary": {
        "directMappings": 3,
        "compoundExtractions": 3,
        "unmappedColumns": ["Notes", "Internal Code"],
        "unmappedFields": ["tax_rate"],
        "llmCalls": 4,
        "processingTimeMs": 17523,
        "averageConfidence": 9.2
      }
    }
  }
}
```

**Key Design Decisions:**
- All source columns are enumerable via `Object.keys(row.direct)`, `Object.keys(row.compound)`, `Object.keys(row.unmapped)`
- Compound columns support multiple `extractions`, each with its own `targetField` and `confidence`
- Original values are preserved: `sourceValue` for compound columns, values directly for unmapped
- API uses **camelCase** throughout (native TypeScript conventions)

**Response (Failed):**
```json
{
  "operation_id": "op_a1b2c3d4e5f6",
  "status": "failed",
  "created_at": "2024-12-03T10:30:00Z",
  "started_at": "2024-12-03T10:30:01Z",
  "failed_at": "2024-12-03T10:30:05Z",
  "error": {
    "code": "LLM_ERROR",
    "message": "LLM inference failed after 3 retries",
    "phase": "discovery",
    "details": {
      "last_error": "Rate limit exceeded"
    }
  }
}
```

---

#### `POST /operations/{operation_id}/cancel`

Cancel a running operation.

**Response (200 OK):**
```json
{
  "operation_id": "op_a1b2c3d4e5f6",
  "status": "cancelled",
  "cancelled_at": "2024-12-03T10:30:10Z"
}
```

---

#### Error Response Format

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "PARSE_ERROR",
    "message": "Unable to parse Excel file: Sheet 'Q1 Sales' not found",
    "details": {
      "available_sheets": ["Sheet1", "Q1-Sales", "Summary"]
    }
  }
}
```

**Error Codes:**

| Code | Description |
|------|-------------|
| `PARSE_ERROR` | File parsing failed |
| `UNSUPPORTED_FORMAT` | File type not supported |
| `INVALID_SCHEMA` | Context schema validation failed |
| `LLM_ERROR` | LLM inference failed |
| `EXTRACTION_ERROR` | Extraction logic failed |
| `VALIDATION_ERROR` | Request validation failed |
| `OPERATION_NOT_FOUND` | Invalid operation_id |
| `OPERATION_EXPIRED` | Operation result has expired (TTL) |

---

### 1.7 Operation State Management

#### Storage

Operations are stored in an **in-memory Map** keyed by `operationId`. This provides:
- Simple implementation with no external dependencies
- Fast lookups and updates
- Sufficient for single-instance deployments

```typescript
// lib/operations/store.ts
import { Operation } from './models';

class OperationStore {
  private operations = new Map<string, Operation>();

  create(operation: Operation): void {
    this.operations.set(operation.operationId, operation);
  }

  get(operationId: string): Operation | undefined {
    return this.operations.get(operationId);
  }

  update(operationId: string, updates: Partial<Operation>): void {
    const op = this.operations.get(operationId);
    if (op) {
      Object.assign(op, updates);
    }
  }

  delete(operationId: string): void {
    this.operations.delete(operationId);
  }
}

export const operationStore = new OperationStore();
```

**Note:** Operations are lost on server restart. This is acceptable for this use case. For production, consider using Redis/Upstash KV.

#### TTL / Cleanup Policy

Operations are automatically cleaned up based on their status:

```typescript
// lib/operations/ttl.ts
const OPERATION_TTL_MS = {
  pending: 30 * 60 * 1000,       // 30 minutes - stale if never started
  processing: 60 * 60 * 1000,   // 1 hour - timeout for stuck operations
  completed: 24 * 60 * 60 * 1000, // 24 hours - keep results
  failed: 24 * 60 * 60 * 1000,   // 24 hours - keep error info for debugging
  cancelled: 60 * 60 * 1000,     // 1 hour - quick cleanup
} as const;
```

#### Client Polling Pattern

```typescript
async function extractWithPolling(
  file: File, 
  context: ExtractionContext,
  onProgress?: (progress: Progress) => void
): Promise<ExtractionResult> {
  // 1. Initiate extraction
  const { operation_id } = await api.post('/extract', { file, context });
  
  // 2. Poll for completion
  const pollInterval = 1000; // 1 second
  
  while (true) {
    const operation = await api.get(`/operations/${operation_id}`);
    
    switch (operation.status) {
      case 'completed':
        return operation.result;
      case 'failed':
        throw new ExtractionError(operation.error);
      case 'cancelled':
        throw new CancelledError();
      case 'processing':
        onProgress?.(operation.progress);
        break;
    }
    
    await sleep(pollInterval);
  }
}
```

### 1.8 Backend Repository Structure

```
data-importer-backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── extract.ts            # POST /api/extract
│   │   │   ├── operations.ts         # GET/POST /api/operations/:operationId
│   │   │   └── health.ts             # GET /api/health
│   │   ├── middleware/
│   │   │   ├── error-handler.ts      # Global error handling
│   │   │   ├── validation.ts         # Request validation middleware
│   │   │   └── cors.ts               # CORS configuration
│   │   └── schemas/
│   │       ├── extract.ts            # Zod schemas for extract endpoint
│   │       └── operations.ts         # Zod schemas for operations endpoint
│   │
│   ├── parsers/
│   │   ├── index.ts                  # Parser registry and factory
│   │   ├── base-parser.ts            # Parser interface definition
│   │   ├── csv-parser.ts             # CSV file → Normalized JSON
│   │   └── excel-parser.ts           # Excel file → Normalized JSON
│   │
│   ├── prompts/
│   │   ├── index.ts                  # Prompt exports
│   │   ├── base-extraction.ts        # Generic extraction prompt template (static)
│   │   ├── discovery.ts              # Pass 1: Column discovery prompt builder
│   │   └── compound.ts               # Pass 2: Compound extraction prompt builder
│   │
│   ├── extraction/
│   │   ├── index.ts                  # Extraction exports
│   │   ├── llm-client.ts             # Interface to external LLM (OpenAI/Azure/etc.)
│   │   ├── extractor.ts              # Orchestrates: normalized JSON + context → LLM → results
│   │   └── sampler.ts                # Row sampling logic (30 rows if >50 total)
│   │
│   ├── mapping/
│   │   ├── index.ts                  # Mapping exports
│   │   └── mapper.ts                 # Apply direct + compound mappings to all rows
│   │
│   ├── operations/
│   │   ├── index.ts                  # Operations exports
│   │   ├── models.ts                 # Operation state types (status, progress, result)
│   │   ├── store.ts                  # In-memory operation storage (Map)
│   │   └── manager.ts                # Create, update, get, cleanup operations
│   │
│   ├── workers/
│   │   ├── index.ts                  # Worker exports
│   │   └── extraction-worker.ts      # Async task processing extraction operations
│   │
│   ├── config/
│   │   └── index.ts                  # Environment configuration
│   │
│   ├── types/
│   │   └── index.ts                  # Shared TypeScript type definitions
│   │
│   └── app.ts                        # Express/Fastify app setup
│
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

### 1.9 Module Responsibilities

#### Parsers Module

| File | Responsibility |
|------|----------------|
| `base-parser.ts` | Parser interface with `parse(file, options) → NormalizedData` |
| `csv-parser.ts` | Reads CSV file using PapaParse, converts to normalized JSON schema |
| `excel-parser.ts` | Reads Excel file (single sheet) using SheetJS, converts to normalized JSON |

**Parser Interface:**
```typescript
// lib/parsers/base-parser.ts
export interface ParseOptions {
  sheetName?: string;
}

export interface NormalizedData {
  source: {
    filename: string;
    type: 'csv' | 'excel';
    sheet?: string;
  };
  data: {
    headers: string[];
    rows: Record<string, string>[];
    rowCount: number;
    columnCount: number;
  };
  metadata: {
    parsedAt: string;
    parserVersion: string;
  };
}

export interface Parser {
  parse(fileContent: Buffer, filename: string, options?: ParseOptions): Promise<NormalizedData>;
  supportedExtensions(): string[];
}
```

#### Prompts Module

| File | Responsibility |
|------|----------------|
| `base-extraction.ts` | Contains the **static prompt template** with generic extraction instructions |
| `discovery.ts` | Builds Pass 1 prompt: appends context + sampled data to base template |
| `compound.ts` | Builds Pass 2 prompt: appends compound column values + field definitions |

**Note:** Actual prompt templates will be written during implementation. The prompts should be iteratively refined based on LLM output quality during development.

**Confidence Score Instructions:**

The LLM is instructed to provide a confidence score (1-10) for each extraction:

| Score | Meaning |
|-------|---------|
| 10 | Perfect match - exact column name or unambiguous value |
| 8-9 | High confidence - strong semantic match or clear pattern |
| 6-7 | Medium confidence - reasonable inference but some ambiguity |
| 4-5 | Low confidence - educated guess based on limited evidence |
| 1-3 | Very low confidence - weak match, may need user verification |

**Prompt Composition Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│  base-extraction.ts (static template)                       │
│  "You are a data extraction assistant. Given JSON data      │
│   and field definitions, identify which source columns      │
│   map to the requested fields..."                           │
└─────────────────────────────┬───────────────────────────────┘
                              │ + append
┌─────────────────────────────▼───────────────────────────────┐
│  API-provided context                                        │
│  - description: "Monthly sales report..."                   │
│  - fields: [{field: "transaction_date", description:...}]   │
└─────────────────────────────┬───────────────────────────────┘
                              │ + append
┌─────────────────────────────▼───────────────────────────────┐
│  Sampled normalized JSON data                               │
│  - headers: ["Date", "Product", "Order Ref"...]             │
│  - rows: [{...}, {...}] (max 30 rows)                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                    Final Prompt → LLM
```

#### Extraction Module

| File | Responsibility |
|------|----------------|
| `llm-client.ts` | Interface to external LLM endpoint (pluggable: OpenAI, Azure, local) |
| `extractor.ts` | Main orchestrator: receives normalized JSON + context, builds prompts, calls LLM, parses response |
| `sampler.ts` | Implements sampling logic (return all rows if ≤50, else first 30) |

**Extractor Flow:**
```typescript
// src/extraction/extractor.ts
import { NormalizedData, ExtractionContext, ExtractionResult } from '../types';
import { LLMClient } from './llm-client';
import { Sampler } from './sampler';
import { buildDiscoveryPrompt } from '../prompts/discovery';
import { buildCompoundPrompt } from '../prompts/compound';
import { Mapper } from '../mapping/mapper';

export class Extractor {
  constructor(
    private llmClient: LLMClient,
    private sampler: Sampler,
    private mapper: Mapper
  ) {}

  async extract(
    normalizedData: NormalizedData,
    context: ExtractionContext
  ): Promise<ExtractionResult> {
    // 1. Sample rows for discovery
    const sample = this.sampler.sample(normalizedData);

    // 2. Build Pass 1 prompt (base template + context + sample)
    const discoveryPrompt = buildDiscoveryPrompt(sample, context);

    // 3. Call LLM for discovery
    const discoveryResult = await this.llmClient.infer(discoveryPrompt);

    // 4. If compound columns found, run Pass 2
    let compoundResult = null;
    if (discoveryResult.compoundColumns?.length > 0) {
      const extractionPrompt = buildCompoundPrompt(
        normalizedData,
        discoveryResult.compoundColumns,
        context
      );
      compoundResult = await this.llmClient.infer(extractionPrompt);
    }

    // 5. Merge results
    return this.mapper.merge(normalizedData, discoveryResult, compoundResult);
  }
}
```

#### Mapping Module

| File | Responsibility |
|------|----------------|
| `mapper.ts` | Applies direct column mappings (programmatic rename) and merges compound extractions from LLM |

#### Operations Module

| File | Responsibility |
|------|----------------|
| `models.ts` | TypeScript types for operation state (status, progress, timestamps, result/error) |
| `store.ts` | In-memory Map storage for operations |
| `manager.ts` | High-level operations CRUD: create, update status, get, list, cleanup expired |

**Operation Model:**
```typescript
// lib/operations/models.ts
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
  // Store request data for processing
  fileContent: Buffer;
  filename: string;
  sheetName?: string;
  context: ExtractionContext;
}
```

#### Workers Module

| File | Responsibility |
|------|----------------|
| `extraction-worker.ts` | Async function that processes pending operations (parse → extract → update status) |

**Background Task Pattern:**

The worker uses a fire-and-forget async pattern to run extraction without blocking the API response:

```typescript
// src/api/routes/extract.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { operationsManager } from '../../operations/manager';
import { processOperation } from '../../workers/extraction-worker';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  const context = JSON.parse(req.body.context);

  if (!file) {
    return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file provided' } });
  }

  // Create operation record
  const operation = await operationsManager.create({
    fileContent: file.buffer,
    filename: file.originalname,
    sheetName: req.body.sheetName,
    context,
  });

  // Schedule background processing (non-blocking)
  void processOperation(operation.operationId);

  // Return immediately with operationId
  return res.status(202).json({
    operationId: operation.operationId,
    status: 'pending',
    createdAt: operation.createdAt.toISOString(),
    links: {
      self: `/api/operations/${operation.operationId}`,
      cancel: `/api/operations/${operation.operationId}/cancel`,
    },
  });
});

export default router;
```

**Worker Flow:**
```typescript
// src/workers/extraction-worker.ts
import { operationsManager } from '../operations/manager';
import { getParser } from '../parsers';
import { Extractor } from '../extraction/extractor';

export async function processOperation(operationId: string): Promise<void> {
  try {
    // Update status to processing
    await operationsManager.updateStatus(operationId, 'processing');

    // Get operation details
    const operation = await operationsManager.get(operationId);
    if (!operation) throw new Error('Operation not found');

    // Phase 1: Parse file
    await operationsManager.updateProgress(operationId, { phase: 'parsing' });
    const parser = getParser(operation.filename);
    const normalizedData = await parser.parse(
      operation.fileContent,
      operation.filename,
      { sheetName: operation.sheetName }
    );

    // Phase 2: Discovery (Pass 1)
    await operationsManager.updateProgress(operationId, { phase: 'discovery' });
    const extractor = new Extractor(/* dependencies */);
    const result = await extractor.extract(normalizedData, operation.context);

    // Complete
    await operationsManager.complete(operationId, result);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await operationsManager.fail(operationId, message);
  }
}
```

**Note:** This async approach is suitable for MVP. For production scale with persistent job queues, consider Inngest, Trigger.dev, or BullMQ with Redis.

---

## 2. Frontend Repository (Component Library + Demo App)

### 2.1 Frontend Repository Structure

```
data-importer-frontend/
├── packages/
│   ├── ui-library/                   # Component Library (npm package)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── FileDropzone.tsx
│   │   │   │   ├── ImportDialog.tsx
│   │   │   │   ├── SheetSelector.tsx
│   │   │   │   ├── LoadingOverlay.tsx
│   │   │   │   ├── ErrorDialog.tsx
│   │   │   │   ├── ResultsTable.tsx
│   │   │   │   ├── MappingSelector.tsx
│   │   │   │   ├── CompoundCell.tsx
│   │   │   │   ├── ColumnHeader.tsx
│   │   │   │   ├── ContextEditor.tsx
│   │   │   │   ├── ValidationPanel.tsx
│   │   │   │   └── index.ts          # Component exports
│   │   │   ├── services/
│   │   │   │   ├── import-service.ts
│   │   │   │   ├── file-validator.ts
│   │   │   │   └── sheet-inspector.ts
│   │   │   ├── types/
│   │   │   │   └── index.ts          # Shared type definitions
│   │   │   ├── hooks/
│   │   │   │   └── useImportFlow.ts  # Import flow state management
│   │   │   └── index.ts              # Main package exports
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts            # Build configuration
│   │
│   └── demo-app/                     # Demo Application
│       ├── src/
│       │   ├── app/                  # Next.js App Router
│       │   │   ├── page.tsx          # Demo page
│       │   │   ├── layout.tsx        # Root layout with MUI theme
│       │   │   └── globals.css
│       │   └── components/
│       │       ├── ContextSection.tsx
│       │       ├── DescriptionInput.tsx
│       │       ├── FieldsEditor.tsx
│       │       ├── PresetButtons.tsx
│       │       └── ResultsSection.tsx
│       ├── package.json
│       ├── next.config.ts
│       └── Dockerfile
│
├── package.json                      # Workspace root
├── pnpm-workspace.yaml               # pnpm workspace config
└── turbo.json                        # Turborepo config (optional)
```

### 2.2 Core Components

The component library (`packages/ui-library`) exports reusable components for the import workflow.

| Component | Responsibility |
|-----------|----------------|
| **FileDropzone** | Drag-and-drop file upload with preview |
| **ImportDialog** | Modal dialog containing the import workflow |
| **SheetSelector** | Sheet selection for multi-sheet spreadsheets |
| **LoadingOverlay** | Loading state with progress indicator |
| **ErrorDialog** | Error display with retry/dismiss actions |
| **ResultsTable** | Display extraction results with column organization |
| **MappingSelector** | Dropdown for changing non-compound field mappings |
| **CompoundCell** | Display compound value with highlighted extraction & right-click override |
| **ContextEditor** | Define/edit extraction context and field schema |
| **ValidationPanel** | Show extraction confidence/errors/unmapped fields |

### 2.3 Service Layer

Services handle client-side logic and API communication.

| Service | Responsibility |
|---------|----------------|
| **ImportService** | TypeScript client wrapping backend API calls |
| **FileValidator** | Client-side file type validation |
| **SheetInspector** | Read spreadsheet metadata (sheet names) without full parse |

### 2.4 Styling Approach

- **UI Framework:** MUI (Material-UI) - @mui/material, @emotion/react, @emotion/styled
- **Icons:** @mui/icons-material or Lucide React
- **Theming:** MUI's default theme with customization as needed

### 2.5 Package Publishing

The component library can be published to npm or used internally:

```json
// packages/ui-library/package.json
{
  "name": "@your-org/data-importer-ui",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0",
    "@mui/material": "^5.0.0 || ^6.0.0",
    "@emotion/react": "^11.0.0",
    "@emotion/styled": "^11.0.0"
  }
}
```

---

### 2.4 FileDropzone Component

#### Description
The entry point for the import flow. A styled drop zone that accepts files via drag-and-drop or click-to-browse.

#### Visual States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ┌─────────────┐                          │
│                    │   📁 Icon   │                          │
│                    └─────────────┘                          │
│                                                             │
│          Drag and drop a file here, or click to browse      │
│                                                             │
│              Accepts text files and spreadsheets            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                         DEFAULT STATE

┌─────────────────────────────────────────────────────────────┐
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  ┄                                                       ┄  │
│  ┄                  Drop file here                       ┄  │
│  ┄                                                       ┄  │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
└─────────────────────────────────────────────────────────────┘
                       DRAG HOVER STATE (highlighted border)
```

#### Props Interface

```typescript
interface FileDropzoneProps {
  /** Maximum file size in bytes */
  maxFileSize?: number;  // default: 50MB
  
  /** Callback when valid file is selected */
  onFileSelect: (file: File) => void;
  
  /** Callback when file validation fails */
  onError?: (error: FileValidationError) => void;
  
  /** Custom placeholder text */
  placeholder?: string;
  
  /** Disabled state */
  disabled?: boolean;
  
  /** Additional CSS class */
  className?: string;
}
```

#### File Type Philosophy

The system accepts **any file** and relies on binary detection to reject unsupported formats. This allows flexibility to import data from various text-based formats (CSV, TSV, JSON, XML, plain text, etc.) without maintaining a restrictive whitelist.

**Special Cases:**
- Excel files (`.xlsx`, `.xls`) are technically binary but are explicitly supported
- The backend parser will determine if the file content can be meaningfully extracted

| Category | Detection | Handling |
|----------|-----------|----------|
| Text files | No binary markers | Accept → send to backend |
| Spreadsheets | Binary but known signature | Accept → send to backend |
| Other binary | Binary markers detected | Reject on client |

#### File Validation (Client-Side)

```typescript
interface FileValidationResult {
  valid: boolean;
  error?: FileValidationError;
}

interface FileValidationError {
  code: 'FILE_TOO_LARGE' | 'BINARY_FILE' | 'EMPTY_FILE';
  message: string;
  details?: {
    fileType?: string;
    fileSize?: number;
    maxSize?: number;
  };
}
```

**Validation Steps:**
1. Verify file is not empty (size > 0)
2. Check file size against maximum
3. Check if file is binary (reject unless it's a known spreadsheet format)

#### Binary File Detection

Binary files are detected by reading the first few bytes and checking for:
- Null bytes (0x00) in the content
- Non-printable characters outside normal text range
- Known binary file signatures (magic bytes)

```typescript
async function isBinaryFile(file: File): Promise<boolean> {
  const chunk = await file.slice(0, 8192).arrayBuffer();
  const bytes = new Uint8Array(chunk);
  
  // Check for null bytes (strong indicator of binary)
  if (bytes.includes(0x00)) {
    // Exception: Allow known spreadsheet formats (they are binary but supported)
    if (isSpreadsheetFormat(file)) return false;
    return true;
  }
  
  // Check for high ratio of non-printable characters
  let nonPrintable = 0;
  for (const byte of bytes) {
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++;
    }
  }
  
  return (nonPrintable / bytes.length) > 0.1;
}
```

---

### 2.5 Import Flow State Machine

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         IMPORT FLOW STATE MACHINE                         │
└──────────────────────────────────────────────────────────────────────────┘

                              ┌─────────┐
                              │  IDLE   │◄──────────────────────┐
                              └────┬────┘                       │
                                   │ file selected              │
                                   ▼                            │
                           ┌──────────────┐                     │
                           │  VALIDATING  │                     │
                           └──────┬───────┘                     │
                                  │                             │
                    ┌─────────────┴─────────────┐               │
                    │                           │               │
              valid file                  invalid file          │
                    │                           │               │
                    ▼                           ▼               │
           ┌───────────────┐           ┌─────────────┐          │
           │ CHECKING_FILE │           │ ERROR_DIALOG│──────────┤
           │   METADATA    │           │ (unsupported)│  dismiss │
           └───────┬───────┘           └─────────────┘          │
                   │                                            │
     ┌─────────────┴─────────────┐                              │
     │                           │                              │
 single sheet            multiple sheets                        │
 (or CSV)                (spreadsheet)                          │
     │                           │                              │
     │                           ▼                              │
     │                  ┌─────────────────┐                     │
     │                  │ SHEET_SELECTION │                     │
     │                  └────────┬────────┘                     │
     │                           │ sheet selected               │
     │                           │                              │
     └───────────┬───────────────┘                              │
                 │                                              │
                 ▼                                              │
        ┌─────────────────┐                                     │
        │ CALLING_API     │                                     │
        │ (loading state) │                                     │
        └────────┬────────┘                                     │
                 │                                              │
       ┌─────────┴─────────┐                                    │
       │                   │                                    │
   success              failure                                 │
       │                   │                                    │
       ▼                   ▼                                    │
┌─────────────┐    ┌─────────────┐                              │
│  COMPLETE   │    │ ERROR_DIALOG│──────────────────────────────┘
│  (results)  │    │  (API error)│       dismiss/retry
└─────────────┘    └─────────────┘
```

---

### 2.6 ImportDialog Component

#### Description
Modal dialog that manages the import workflow after a file is selected. Contains sub-components for sheet selection, context editing, loading states, and error display.

#### Visual Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════════╗   │
│  ║  Import: sales_report.xlsx                                   [X] ║   │
│  ╠══════════════════════════════════════════════════════════════════╣   │
│  ║                                                                  ║   │
│  ║  [Dynamic content area - changes based on state]                 ║   │
│  ║                                                                  ║   │
│  ║  • Sheet Selection (if multi-sheet)                              ║   │
│  ║  • Loading indicator (during API call)                           ║   │
│  ║  • Error message (on failure)                                    ║   │
│  ║  • Results (on success) - future phase                           ║   │
│  ║                                                                  ║   │
│  ╠══════════════════════════════════════════════════════════════════╣   │
│  ║                                    [Cancel]  [Continue/Import]   ║   │
│  ╚══════════════════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Props Interface

```typescript
interface ImportDialogProps {
  /** The file to import */
  file: File;
  
  /** Whether the dialog is open */
  open: boolean;
  
  /** Callback when dialog is closed */
  onClose: () => void;
  
  /** Callback when import completes successfully */
  onSuccess: (result: ExtractionResult) => void;
  
  /** Extraction context (field definitions) */
  context: ExtractionContext;
  
  /** API endpoint configuration */
  apiConfig?: ApiConfig;
}

interface ApiConfig {
  baseUrl: string;
  timeout?: number;  // default: 30000ms for initial request
  pollingInterval?: number;  // default: 1000ms
}
```

---

### 2.7 SheetSelector Component

#### Description
Displayed when an Excel file with multiple sheets is detected. Allows the user to select which sheet to import.

#### Visual Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   This workbook contains multiple sheets.                                │
│   Please select the sheet you want to import:                            │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │  ○  Sheet1                                          (150 rows) │     │
│   ├────────────────────────────────────────────────────────────────┤     │
│   │  ●  Q1 Sales                                        (320 rows) │     │
│   ├────────────────────────────────────────────────────────────────┤     │
│   │  ○  Summary                                          (25 rows) │     │
│   ├────────────────────────────────────────────────────────────────┤     │
│   │  ○  Metadata                                          (8 rows) │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Props Interface

```typescript
interface SheetSelectorProps {
  /** Available sheets with metadata */
  sheets: SheetInfo[];
  
  /** Currently selected sheet name */
  selectedSheet: string | null;
  
  /** Callback when sheet is selected */
  onSelect: (sheetName: string) => void;
}

interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  isHidden?: boolean;
}
```

#### Sheet Metadata Extraction

Sheet metadata is extracted client-side using a lightweight parser (e.g., SheetJS/xlsx) without fully parsing all data:

```typescript
async function getSheetMetadata(file: File): Promise<SheetInfo[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { 
    type: 'array',
    bookSheets: true,  // Only read sheet names initially
  });
  
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
    return {
      name,
      rowCount: range.e.r - range.s.r + 1,
      columnCount: range.e.c - range.s.c + 1,
      isHidden: workbook.Workbook?.Sheets?.find(s => s.name === name)?.Hidden === 1
    };
  }).filter(sheet => !sheet.isHidden);  // Filter out hidden sheets
}
```

---

### 2.8 LoadingOverlay Component

#### Description
Displayed while waiting for API response. Shows progress information when available.

#### Visual Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                           ┌──────────────┐                               │
│                           │   [spinner]  │                               │
│                           └──────────────┘                               │
│                                                                          │
│                        Processing your file...                           │
│                                                                          │
│                    ┌────────────────────────────┐                        │
│                    │████████████░░░░░░░░░░░░░░░░│ 45%                    │
│                    └────────────────────────────┘                        │
│                                                                          │
│                    Phase: Extracting data (Pass 1)                       │
│                    Rows processed: 45 of 100                             │
│                                                                          │
│                              [Cancel]                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Props Interface

```typescript
interface LoadingOverlayProps {
  /** Loading message */
  message?: string;
  
  /** Progress information (optional) */
  progress?: OperationProgress;
  
  /** Whether cancellation is allowed */
  cancellable?: boolean;
  
  /** Callback when cancel is clicked */
  onCancel?: () => void;
}

interface OperationProgress {
  phase: 'parsing' | 'discovery' | 'extraction' | 'mapping';
  currentStep: string;
  rowsProcessed: number;
  totalRows: number;
  percentComplete: number;
}
```

#### Phase Display Labels

| Phase | Display Label |
|-------|---------------|
| `parsing` | "Parsing file..." |
| `discovery` | "Analyzing columns..." |
| `extraction` | "Extracting data..." |
| `mapping` | "Finalizing results..." |

---

### 2.9 ErrorDialog Component

#### Description
Displays error messages with appropriate actions based on error type.

#### Visual Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════════════╗   │
│  ║  ⚠️  Import Error                                            [X] ║   │
│  ╠══════════════════════════════════════════════════════════════════╣   │
│  ║                                                                  ║   │
│  ║   ┌────────────────────────────────────────────────────────┐     ║   │
│  ║   │  ❌  Unable to process file                            │     ║   │
│  ║   │                                                        │     ║   │
│  ║   │  The file "report.pdf" is not supported.               │     ║   │
│  ║   │                                                        │     ║   │
│  ║   │  Supported formats:                                    │     ║   │
│  ║   │  • CSV (.csv)                                          │     ║   │
│  ║   │  • Excel (.xlsx, .xls)                                 │     ║   │
│  ║   └────────────────────────────────────────────────────────┘     ║   │
│  ║                                                                  ║   │
│  ╠══════════════════════════════════════════════════════════════════╣   │
│  ║                                      [Select Different File]     ║   │
│  ╚══════════════════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Props Interface

```typescript
interface ErrorDialogProps {
  /** Error details */
  error: ImportError;
  
  /** Whether the dialog is open */
  open: boolean;
  
  /** Callback when dialog is dismissed */
  onDismiss: () => void;
  
  /** Callback to retry the operation (if retryable) */
  onRetry?: () => void;
  
  /** Callback to select a different file */
  onSelectDifferentFile?: () => void;
}

interface ImportError {
  code: ErrorCode;
  title: string;
  message: string;
  details?: string;
  retryable: boolean;
}

type ErrorCode = 
  | 'BINARY_FILE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_FORMAT'
  | 'SHEET_NOT_FOUND'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'OPERATION_CANCELLED'
  | 'UNKNOWN';
```

---

### 2.10 Error Scenarios & Handling

#### Client-Side Errors (Before API Call)

| Error Code | Trigger | Message | Actions |
|------------|---------|---------|---------|
| `BINARY_FILE` | Binary content detected in non-spreadsheet file | "This file appears to be a binary file and cannot be imported. Please select a text-based file or spreadsheet." | Select Different File |
| `FILE_TOO_LARGE` | File exceeds max size | "File size (52MB) exceeds the maximum allowed (50MB)." | Select Different File |
| `EMPTY_FILE` | File has 0 bytes | "The selected file is empty." | Select Different File |

#### Server-Side Errors (API Errors)

| Error Code | Trigger | Message | Actions |
|------------|---------|---------|---------|
| `PARSE_ERROR` | Backend cannot parse file structure | "Unable to parse the file. It may be corrupted or in an unexpected format." | Retry, Select Different File |
| `UNSUPPORTED_FORMAT` | Backend doesn't have a parser for this file type | "This file format is not supported for data extraction." | Select Different File |
| `SHEET_NOT_FOUND` | Selected sheet doesn't exist | "Sheet 'Q1 Sales' was not found in the workbook." | Select Different File |
| `API_ERROR` | Generic backend error | "An error occurred while processing your file." | Retry |
| `NETWORK_ERROR` | Request failed (no response) | "Unable to connect to the server. Please check your connection." | Retry |
| `TIMEOUT` | Request or polling timeout | "The operation timed out. This may be due to a large file." | Retry |
| `OPERATION_CANCELLED` | User cancelled operation | "The import was cancelled." | Dismiss |

#### Error Recovery Flow

```typescript
function handleError(error: ImportError, actions: ErrorActions) {
  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
    case 'API_ERROR':
      // Retryable - show retry button
      return { 
        showRetry: true, 
        showSelectFile: true 
      };
      
    case 'BINARY_FILE':
    case 'EMPTY_FILE':
    case 'FILE_TOO_LARGE':
    case 'UNSUPPORTED_FORMAT':
      // Not retryable - need different file
      return { 
        showRetry: false, 
        showSelectFile: true 
      };
      
    case 'PARSE_ERROR':
    case 'SHEET_NOT_FOUND':
      // Could retry with different options
      return { 
        showRetry: true, 
        showSelectFile: true 
      };
      
    default:
      return { 
        showRetry: false, 
        showSelectFile: true 
      };
  }
}
```

---

### 2.11 Import Service

#### Client API Wrapper

```typescript
class ImportService {
  private baseUrl: string;
  private timeout: number;
  private pollingInterval: number;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? 30000;
    this.pollingInterval = config.pollingInterval ?? 1000;
  }

  /**
   * Initiate an extraction operation
   */
  async startExtraction(params: {
    file: File;
    sheetName?: string;
    context: ExtractionContext;
  }): Promise<{ operationId: string }> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('filename', params.file.name);
    if (params.sheetName) {
      formData.append('sheet_name', params.sheetName);
    }
    formData.append('context', JSON.stringify(params.context));

    const response = await fetch(`${this.baseUrl}/extract`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw await this.parseErrorResponse(response);
    }

    const data = await response.json();
    return { operationId: data.operation_id };
  }

  /**
   * Poll for operation completion
   */
  async pollOperation(
    operationId: string,
    onProgress?: (progress: OperationProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<ExtractionResult> {
    while (true) {
      if (abortSignal?.aborted) {
        throw new ImportError('OPERATION_CANCELLED', 'Operation was cancelled');
      }

      const response = await fetch(
        `${this.baseUrl}/operations/${operationId}`,
        { signal: abortSignal }
      );

      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      const operation = await response.json();

      switch (operation.status) {
        case 'completed':
          return operation.result;
        case 'failed':
          throw this.parseOperationError(operation.error);
        case 'cancelled':
          throw new ImportError('OPERATION_CANCELLED', 'Operation was cancelled');
        case 'processing':
          onProgress?.(operation.progress);
          break;
      }

      await this.sleep(this.pollingInterval);
    }
  }

  /**
   * Cancel a running operation
   */
  async cancelOperation(operationId: string): Promise<void> {
    await fetch(`${this.baseUrl}/operations/${operationId}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Full extraction workflow with polling
   */
  async extract(params: {
    file: File;
    sheetName?: string;
    context: ExtractionContext;
    onProgress?: (progress: OperationProgress) => void;
    abortSignal?: AbortSignal;
  }): Promise<ExtractionResult> {
    const { operationId } = await this.startExtraction(params);

    try {
      return await this.pollOperation(
        operationId,
        params.onProgress,
        params.abortSignal
      );
    } catch (error) {
      if (params.abortSignal?.aborted) {
        // Attempt to cancel server-side operation
        await this.cancelOperation(operationId).catch(() => {});
      }
      throw error;
    }
  }

  private async parseErrorResponse(response: Response): Promise<ImportError> {
    try {
      const data = await response.json();
      return new ImportError(
        data.error?.code ?? 'API_ERROR',
        data.error?.message ?? 'An unexpected error occurred'
      );
    } catch {
      return new ImportError('API_ERROR', `HTTP ${response.status}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 2.12 Complete Import Flow Example

```typescript
function ImportWorkflow() {
  const [file, setFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<ImportError | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setError(null);
    
    // Validate file on client side
    const validation = await validateFile(selectedFile);
    
    if (!validation.valid) {
      setError(createErrorFromValidation(validation.error));
      return;
    }
    
    setFile(selectedFile);
    setDialogOpen(true);
  };

  const handleImportComplete = (result: ExtractionResult) => {
    setDialogOpen(false);
    // Handle successful extraction...
  };

  const handleError = (error: ImportError) => {
    setDialogOpen(false);
    setError(error);
  };

  return (
    <>
      <FileDropzone
        onFileSelect={handleFileSelect}
        onError={(err) => setError(createErrorFromValidation(err))}
      />

      {file && (
        <ImportDialog
          file={file}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleImportComplete}
          onError={handleError}
          context={extractionContext}
        />
      )}

      {error && (
        <ErrorDialog
          error={error}
          open={!!error}
          onDismiss={() => setError(null)}
          onRetry={error.retryable ? () => handleFileSelect(file!) : undefined}
          onSelectDifferentFile={() => {
            setError(null);
            setFile(null);
          }}
        />
      )}
    </>
  );
}
```

---

### 2.13 ResultsTable Component

#### Description
Displays extraction results in a table format after successful API response. Shows source columns from the file, matched target fields, and allows users to adjust non-compound mappings.

#### Table Structure

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    RESULTS TABLE LAYOUT                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                    DIRECT MATCHES              │    COMPOUND EXTRACTIONS    │      UNMATCHED
                    (user can change)           │    (from single column)    │      COLUMNS
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Source     │   Date      │  Amount   │  SKU    ║   Order Ref  │  Order Ref  │  Order Ref  ║  Notes     │
│ Column     │             │           │         ║              │             │             ║            │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Matched    │ [▼ trans_   │ [▼ total_ │ [▼prod_ ║   region     │  order_year │  product_   ║    —       │
│ Field      │    date   ] │   amount] │   _sku] ║   (auto)     │  (auto)     │  type(auto) ║            │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 1      │ 2024-01-15  │ $1,500.00 │ WGT-001 ║     NYC      │    2024     │   WIDGET    ║ Rush order │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 2      │ 2024-01-16  │ $2,300.50 │ WGT-002 ║     LA       │    2024     │   GADGET    ║            │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 3      │ 2024-01-17  │ $890.00   │ GDG-001 ║     CHI      │    2023     │   GIZMO     ║ Fragile    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
       ▲              ▲                                  ▲                                        ▲
       │              │                                  │                                        │
   Row labels    Dropdown for              Compound columns shown as               Unmatched columns
                 field selection           separate columns with                   have no field
                 (non-compound only)       auto-assigned fields                    selector (dash)
```

#### Column Ordering

Columns are displayed in a specific order to prioritize important data:

| Order | Category | Description | Editable |
|-------|----------|-------------|----------|
| 1 | **Direct Matches** | Source columns mapped 1:1 to target fields | Yes (dropdown) |
| 2 | **Compound Extractions** | Multiple target fields extracted from one source column | No (auto) |
| 3 | **Unmatched Columns** | Source columns with no target field mapping | No |

#### Visual Layout Detail

**Header Row (Source Columns):**
```
┌────────────────────────────────────────────────────────────────────────────┐
│  Date          │  Amount       │  Order Ref    │  Order Ref    │  Notes   │
│  (source)      │  (source)     │  (source)     │  (source)     │  (source)│
└────────────────────────────────────────────────────────────────────────────┘
```

**Mapping Row (Target Fields):**
```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────┐ │ ┌───────────┐ │               │               │          │
│ │▼ trans_date│ │ │▼ total_amt│ │    region     │  order_year   │    —     │
│ └────────────┘ │ └───────────┘ │    (locked)   │   (locked)    │          │
│   [editable]   │  [editable]   │  [compound]   │  [compound]   │ [no map] │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Mapping Dropdown Behavior

For **direct match** columns, users can change the target field mapping:

```
┌─────────────────────────────────────┐
│  ▼ transaction_date              │ ← Currently selected
├─────────────────────────────────────┤
│    transaction_date    ✓            │ ← Current selection (checked)
│    order_date                       │ ← Available (not used elsewhere)
│    ship_date                        │ ← Available
│  ─────────────────────────────────  │
│    total_amount        (in use)     │ ← Disabled (used by another column)
│    product_sku         (in use)     │ ← Disabled (used by another column)
│  ─────────────────────────────────  │
│    — None                           │ ← Option to unmap this column
└─────────────────────────────────────┘
```

**Rules:**
- Each target field can only be selected **once** across all columns
- Fields already mapped to other columns are shown but **disabled**
- User can select "None" to unmap a column (moves to unmatched section)
- Compound extraction fields are **not shown** in dropdown (auto-assigned)

#### Props Interface

```typescript
interface ResultsTableProps {
  /** Extraction result from API */
  result: ExtractionResult;
  
  /** Original extraction context (for field definitions) */
  context: ExtractionContext;
  
  /** Current field mappings (can be modified by user) */
  mappings: FieldMappings;
  
  /** Callback when user changes a mapping */
  onMappingChange: (sourceColumn: string, targetField: string | null) => void;
  
  /** Maximum rows to display (with "show more" option) */
  maxPreviewRows?: number;  // default: 10
  
  /** Callback when user confirms mappings and wants to proceed */
  onConfirm: (finalMappings: FieldMappings) => void;
  
  /** Callback to cancel/go back */
  onCancel: () => void;
}
```

#### Field Mappings State

```typescript
interface FieldMappings {
  /** Direct mappings: source column → target field */
  direct: Map<string, string | null>;
  
  /** Compound mappings: source column → array of extracted fields */
  compound: Map<string, CompoundMapping>;
  
  /** Source columns with no mapping */
  unmapped: string[];
}

interface CompoundMapping {
  sourceColumn: string;
  extractedFields: string[];  // Target fields extracted from this column
  isLocked: true;  // Compound mappings cannot be changed by user
}

/** Get available fields for dropdown (excluding already-used fields) */
function getAvailableFields(
  allFields: FieldDefinition[],
  currentMappings: FieldMappings,
  excludeColumn: string
): FieldDefinition[] {
  const usedFields = new Set<string>();
  
  // Collect all used fields from direct mappings (except current column)
  for (const [column, field] of currentMappings.direct) {
    if (column !== excludeColumn && field) {
      usedFields.add(field);
    }
  }
  
  // Collect all fields used by compound extractions (always locked)
  for (const mapping of currentMappings.compound.values()) {
    mapping.extractedFields.forEach(f => usedFields.add(f));
  }
  
  return allFields.filter(f => !usedFields.has(f.field));
}
```

#### Column Organization Logic

```typescript
interface OrganizedColumns {
  directMatches: DirectMatchColumn[];
  compoundExtractions: CompoundColumn[];
  unmatchedColumns: UnmatchedColumn[];
}

interface DirectMatchColumn {
  sourceColumn: string;
  targetField: string | null;
  values: string[];  // Values across all rows
  confidence: number;
  isUserModified: boolean;
  canEdit: true;
}

interface CompoundColumn {
  sourceColumn: string;      // Original column name (e.g., "Order Ref")
  targetField: string;       // One extracted field (e.g., "region")
  cells: CompoundCellValue[];  // Per-row: original value + extracted portion
  canEdit: false;
}

interface UnmatchedColumn {
  sourceColumn: string;
  values: string[];
  canEdit: false;
}

/**
 * Organizes extraction result data into display columns.
 * Uses the categorized row structure (direct/compound/unmapped).
 */
function organizeColumns(result: ExtractionResult): OrganizedColumns {
  const directMatches: DirectMatchColumn[] = [];
  const compoundExtractions: CompoundColumn[] = [];
  const unmatchedColumns: UnmatchedColumn[] = [];
  
  // Use first row as reference for column structure (all rows have same columns)
  const sampleRow = result.data[0];
  if (!sampleRow) {
    return { directMatches, compoundExtractions, unmatchedColumns };
  }
  
  // Process direct mappings
  for (const [sourceColumn, directData] of Object.entries(sampleRow.direct)) {
    directMatches.push({
      sourceColumn,
      targetField: directData.targetField,
      values: result.data.map(row => row.direct[sourceColumn]?.value ?? ''),
      confidence: directData.confidence,
      isUserModified: false,
      canEdit: true,
    });
  }
  
  // Process compound columns - flatten into separate columns per target field
  for (const [sourceColumn, compoundData] of Object.entries(sampleRow.compound)) {
    // Each extraction becomes its own display column
    for (const extraction of compoundData.extractions) {
      compoundExtractions.push({
        sourceColumn,
        targetField: extraction.targetField,
        cells: result.data.map((row, rowIndex) => {
          const rowCompound = row.compound[sourceColumn];
          const rowExtraction = rowCompound?.extractions.find(
            e => e.targetField === extraction.targetField
          );
          return {
            originalValue: rowCompound?.sourceValue ?? '',
            extractedValue: rowExtraction?.extractedValue ?? null,
            confidence: rowExtraction?.confidence ?? 0,
            isUserModified: false,
            aiOriginalValue: rowExtraction?.extractedValue ?? null,
          };
        }),
        canEdit: false,
      });
    }
  }
  
  // Process unmapped columns
  for (const [sourceColumn, value] of Object.entries(sampleRow.unmapped)) {
    unmatchedColumns.push({
      sourceColumn,
      values: result.data.map(row => row.unmapped[sourceColumn] ?? ''),
      canEdit: false,
    });
  }
  
  return { directMatches, compoundExtractions, unmatchedColumns };
}

/**
 * Get all source columns from the result (for dropdown options, etc.)
 */
function getAllSourceColumns(result: ExtractionResult): string[] {
  const sampleRow = result.data[0];
  if (!sampleRow) return [];
  
  return [
    ...Object.keys(sampleRow.direct),
    ...Object.keys(sampleRow.compound),
    ...Object.keys(sampleRow.unmapped),
  ];
}
```

#### Visual Indicators

| Column Type | Header Style | Mapping Row | Indicator |
|-------------|--------------|-------------|-----------|
| Direct Match | Normal | Dropdown selector | — |
| Compound | Grouped header | Field name (locked) | 🔗 or "compound" badge |
| Unmatched | Muted/gray | "—" (dash) | — |

#### Confidence Score Display

Confidence is displayed differently for direct vs compound columns:

**Direct (Non-Compound) Columns:**
- Confidence is shown as a **background color on the column header**
- The entire column mapping is either correct or not - no per-cell indicators needed
- Color scale: Green (high) → Yellow (medium) → Red (low)

**Compound Columns:**
- Confidence is shown via the **highlight color of the extracted text** within each cell
- The extracted portion uses a green-to-red gradient based on confidence
- This allows per-extraction confidence since compound values vary by row

| Score Range | Color | CSS Variable |
|-------------|-------|--------------|
| 9-10 | Bright green | `--confidence-high: #22c55e` |
| 7-8 | Light green | `--confidence-good: #84cc16` |
| 5-6 | Yellow/amber | `--confidence-medium: #eab308` |
| 3-4 | Orange | `--confidence-low: #f97316` |
| 1-2 | Red | `--confidence-very-low: #ef4444` |
| User modified | Gray | `--user-modified: #9ca3af` |

**Important:** Confidence colors are only shown for AI-driven results. When a user modifies a value:
- **Direct columns:** Header loses confidence color (reverts to default)
- **Compound columns:** Highlight changes to neutral gray (still visible but no confidence implied)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE VISUALIZATION (AI Results Only)                                             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

DIRECT COLUMNS: Header background shows confidence (only for AI mappings)
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Source     │░░░ Date ░░░░│░░ Amount ░░│   SKU      ║                      │                              │
│ Column     │ (green bg)  │ (green bg) │ (no color) ║   Order Ref          │   Notes                      │
│            │   AI: 9     │   AI: 8    │  user edit ║                      │                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Matched    │ [▼ trans_   │ [▼ total_  │ [▼ prod_   ║   region    year     │      —                       │
│ Field      │    date   ] │   amount]  │   _sku]    ║   (auto)   (auto)    │                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 1      │ 2024-01-15  │ $1,500.00  │ WGT-001    ║ ORD-2024-[NYC]-WGT   │ Rush order                   │
│            │             │            │            ║      ▲ green highlight (AI confidence: 9)           │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 2      │ 2024-01-16  │ $2,300.50  │ WGT-002    ║ ORD-2024-[LA?]-WGT   │                              │
│            │             │            │            ║      ▲ yellow highlight (AI confidence: 5)          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Row 3      │ 2024-01-17  │ $890.00    │ GDG-001    ║ ORD-2023-[CHI]-GDG   │ Fragile                      │
│            │             │            │            ║      ▲ gray highlight (user modified)               │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                             ▲
                                             │
                            User changed "region" from AI suggestion
                            → gray highlight (no confidence color)
```

**Tooltip on Hover:** Show exact confidence score (e.g., "Confidence: 6/10") on both headers and highlighted text

#### Compound Column Grouping (Visual)

When multiple fields are extracted from the same source column, they should be visually grouped:

```
┌──────────────────────────────────────────────────────────┐
│                    Order Ref                              │  ← Spanning header
│         (contains: region, year, product_type)           │
├──────────────┬──────────────┬────────────────────────────┤
│    region    │  order_year  │      product_type          │  ← Individual fields
├──────────────┼──────────────┼────────────────────────────┤
│ ORD-[2024]-  │ ORD-2024-    │  ORD-2024-NYC-             │  ← Full value with
│ [NYC]-WIDGET │ [NYC]-WIDGET │  [WIDGET]                  │    highlight
└──────────────┴──────────────┴────────────────────────────┘
```

#### Compound Cell Display Behavior

**Key Feature:** Each compound cell shows the **full original value** with the **AI-extracted portion highlighted**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPOUND CELL DISPLAY                                 │
└─────────────────────────────────────────────────────────────────────────┘

  Original cell value: "ORD-2024-NYC-WIDGET"
  
  For "region" field:           For "order_year" field:      For "product_type" field:
  ┌─────────────────────┐       ┌─────────────────────┐      ┌─────────────────────┐
  │ ORD-2024-[NYC]-     │       │ ORD-[2024]-NYC-     │      │ ORD-2024-NYC-       │
  │ WIDGET              │       │ WIDGET              │      │ [WIDGET]            │
  └─────────────────────┘       └─────────────────────┘      └─────────────────────┘
        ▲                             ▲                            ▲
        │                             │                            │
   "NYC" highlighted            "2024" highlighted           "WIDGET" highlighted
   (AI extraction)              (AI extraction)              (AI extraction)
```

#### User Selection & Override

Users can **correct AI extractions** by selecting different text and using a context menu:

**Step 1: User selects different text**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   Cell content: ORD-2024-NYC-WIDGET                                     │
│                                                                          │
│   Current highlight: ORD-2024-[NYC]-WIDGET   (AI thinks region = "NYC") │
│                                                                          │
│   User selects: ORD-[2024-NYC]-WIDGET        (user highlights "2024-NYC")│
│                      ════════                                            │
│                         ▲                                                │
│                    text selection                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Step 2: User right-clicks → Context menu appears**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ORD-[2024-NYC]-WIDGET                                                 │
│       ════════                                                           │
│       ┌─────────────────────────────┐                                   │
│       │ Use "2024-NYC" as region    │  ← Set selection as value         │
│       ├─────────────────────────────┤                                   │
│       │ Clear extraction            │  ← Remove value (set to null)     │
│       └─────────────────────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Step 3: Cell updates with new highlight**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ORD-[2024-NYC]-WIDGET    ← Now shows "2024-NYC" as highlighted        │
│                                                                          │
│   (field "region" now has value "2024-NYC" instead of "NYC")            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 2.14 CompoundCell Component

#### Description
Displays a compound extraction cell with full original value and highlighted extracted portion. Supports user text selection and right-click override.

#### Props Interface

```typescript
interface CompoundCellProps {
  /** Full original value from source column */
  originalValue: string;
  
  /** Currently extracted/highlighted value */
  extractedValue: string | null;
  
  /** The target field this cell represents */
  fieldName: string;
  
  /** AI confidence score (1-10) - determines highlight color */
  confidence: number;
  
  /** Callback when user overrides the extraction */
  onOverride: (newValue: string | null) => void;
  
  /** Whether user has modified this from AI's original */
  isUserModified?: boolean;
}
```

#### Confidence Level Helper

```typescript
type ConfidenceLevel = 'high' | 'good' | 'medium' | 'low' | 'very-low';

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 9) return 'high';
  if (score >= 7) return 'good';
  if (score >= 5) return 'medium';
  if (score >= 3) return 'low';
  return 'very-low';
}

function getConfidenceLabel(score: number): string {
  const level = getConfidenceLevel(score);
  const labels: Record<ConfidenceLevel, string> = {
    'high': 'High confidence',
    'good': 'Good confidence',
    'medium': 'Medium confidence',
    'low': 'Low confidence',
    'very-low': 'Very low confidence'
  };
  return `${labels[level]} (${score}/10)`;
}
```

#### Highlight Rendering

```typescript
interface HighlightedText {
  segments: TextSegment[];
}

interface TextSegment {
  text: string;
  isHighlighted: boolean;
  confidence?: number;  // Only set for highlighted segments
}

function buildHighlightedText(original: string, extracted: string | null, confidence?: number): HighlightedText {
  if (!extracted) {
    return { segments: [{ text: original, isHighlighted: false }] };
  }
  
  const index = original.indexOf(extracted);
  if (index === -1) {
    // Extracted value not found in original (edge case)
    return { segments: [{ text: original, isHighlighted: false }] };
  }
  
  const segments: TextSegment[] = [];
  
  // Text before highlight
  if (index > 0) {
    segments.push({ text: original.slice(0, index), isHighlighted: false });
  }
  
  // Highlighted portion with confidence
  segments.push({ text: extracted, isHighlighted: true, confidence });
  
  // Text after highlight
  const afterIndex = index + extracted.length;
  if (afterIndex < original.length) {
    segments.push({ text: original.slice(afterIndex), isHighlighted: false });
  }
  
  return { segments };
}
```

#### Context Menu Component

```typescript
interface CompoundCellContextMenuProps {
  /** The text the user has selected */
  selectedText: string;
  
  /** Position for the context menu */
  position: { x: number; y: number };
  
  /** The field name for display */
  fieldName: string;
  
  /** Callback when user confirms selection */
  onConfirm: (value: string) => void;
  
  /** Callback to clear the extraction */
  onClear: () => void;
  
  /** Callback when menu is dismissed */
  onDismiss: () => void;
}
```

#### Visual Styling

```css
/* CSS variables for confidence colors */
:root {
  --confidence-high: #22c55e;       /* 9-10: Bright green */
  --confidence-good: #84cc16;       /* 7-8: Light green */
  --confidence-medium: #eab308;     /* 5-6: Yellow/amber */
  --confidence-low: #f97316;        /* 3-4: Orange */
  --confidence-very-low: #ef4444;   /* 1-2: Red */
  --user-modified: #9ca3af;         /* Gray for user overrides (no confidence implied) */
}

/* Direct column header with confidence background (AI results only) */
.column-header {
  padding: 8px 12px;
  font-weight: 600;
}

/* Confidence colors only shown for AI-driven mappings */
.column-header[data-confidence="high"]:not([data-user-modified]) { background-color: color-mix(in srgb, var(--confidence-high) 30%, white); }
.column-header[data-confidence="good"]:not([data-user-modified]) { background-color: color-mix(in srgb, var(--confidence-good) 30%, white); }
.column-header[data-confidence="medium"]:not([data-user-modified]) { background-color: color-mix(in srgb, var(--confidence-medium) 30%, white); }
.column-header[data-confidence="low"]:not([data-user-modified]) { background-color: color-mix(in srgb, var(--confidence-low) 30%, white); }
.column-header[data-confidence="very-low"]:not([data-user-modified]) { background-color: color-mix(in srgb, var(--confidence-very-low) 30%, white); }

/* User-modified columns have no confidence color (default background) */
.column-header[data-user-modified] { background-color: transparent; }

/* Compound cell styles */
.compound-cell {
  font-family: monospace;  /* Better for seeing exact characters */
  user-select: text;       /* Allow text selection */
  cursor: text;
}

/* Compound cell highlight uses confidence-based colors (AI results only) */
.compound-cell .highlight {
  border-radius: 2px;
  padding: 0 2px;
}

/* Confidence colors only for AI-driven extractions */
.compound-cell .highlight:not(.user-modified)[data-confidence="high"] { background-color: color-mix(in srgb, var(--confidence-high) 40%, white); }
.compound-cell .highlight:not(.user-modified)[data-confidence="good"] { background-color: color-mix(in srgb, var(--confidence-good) 40%, white); }
.compound-cell .highlight:not(.user-modified)[data-confidence="medium"] { background-color: color-mix(in srgb, var(--confidence-medium) 40%, white); }
.compound-cell .highlight:not(.user-modified)[data-confidence="low"] { background-color: color-mix(in srgb, var(--confidence-low) 40%, white); }
.compound-cell .highlight:not(.user-modified)[data-confidence="very-low"] { background-color: color-mix(in srgb, var(--confidence-very-low) 40%, white); }

/* User-modified extractions use neutral gray (still highlighted but no confidence implied) */
.compound-cell .highlight.user-modified {
  background-color: color-mix(in srgb, var(--user-modified) 30%, white);
}

.compound-cell:hover {
  background-color: #f5f5f5;  /* Subtle hover to indicate interactivity */
}

/* Context menu */
.compound-context-menu {
  position: fixed;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  padding: 4px 0;
  min-width: 200px;
}

.compound-context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
}

.compound-context-menu-item:hover {
  background-color: #f0f0f0;
}
```

#### Interaction Flow

```typescript
function CompoundCell({ originalValue, extractedValue, fieldName, onOverride }: CompoundCellProps) {
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    selectedText: string;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      setContextMenu({
        visible: true,
        position: { x: event.clientX, y: event.clientY },
        selectedText,
      });
    }
  };

  const handleConfirmSelection = (value: string) => {
    onOverride(value);
    setContextMenu(null);
  };

  const handleClearExtraction = () => {
    onOverride(null);
    setContextMenu(null);
  };

  // Only pass confidence for AI results (not user-modified)
  const highlighted = buildHighlightedText(originalValue, extractedValue, isUserModified ? undefined : confidence);

  return (
    <div className="compound-cell" onContextMenu={handleContextMenu}>
      {highlighted.segments.map((segment, i) => {
        const showConfidenceColor = segment.isHighlighted && !isUserModified && segment.confidence !== undefined;
        
        return (
          <span 
            key={i} 
            className={cn(
              segment.isHighlighted && 'highlight',
              segment.isHighlighted && isUserModified && 'user-modified'
            )}
            data-confidence={showConfidenceColor ? getConfidenceLevel(segment.confidence!) : undefined}
            title={
              segment.isHighlighted 
                ? (isUserModified ? 'User modified' : getConfidenceLabel(segment.confidence ?? 5))
                : undefined
            }
          >
            {segment.text}
          </span>
        );
      })}
      
      {contextMenu?.visible && (
        <CompoundCellContextMenu
          selectedText={contextMenu.selectedText}
          position={contextMenu.position}
          fieldName={fieldName}
          onConfirm={handleConfirmSelection}
          onClear={handleClearExtraction}
          onDismiss={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

---

### 2.15 ColumnHeader Component (for Direct Columns)

#### Description
Renders a column header with confidence-based background color for direct (non-compound) columns.

#### Props Interface

```typescript
interface ColumnHeaderProps {
  /** Source column name */
  sourceColumn: string;
  
  /** Mapped target field (or null if unmapped) */
  targetField: string | null;
  
  /** Confidence score (1-10) - determines background color (AI results only) */
  confidence: number;
  
  /** Whether user changed the mapping from AI's original */
  isUserModified: boolean;
  
  /** Whether the column type allows editing */
  canEdit: boolean;
}
```

#### Rendering

```typescript
function ColumnHeader({ sourceColumn, targetField, confidence, isUserModified, canEdit }: ColumnHeaderProps) {
  const confidenceLevel = getConfidenceLevel(confidence);
  
  // Only show confidence color for AI-driven mappings
  const showConfidence = !isUserModified && targetField !== null;
  
  return (
    <div 
      className="column-header"
      data-confidence={showConfidence ? confidenceLevel : undefined}
      data-user-modified={isUserModified || undefined}
      title={showConfidence ? getConfidenceLabel(confidence) : (isUserModified ? 'User modified' : undefined)}
    >
      <div className="source-column-name">{sourceColumn}</div>
      {targetField && (
        <div className="target-field-badge">
          → {targetField}
        </div>
      )}
    </div>
  );
}
```

---

### 2.16 MappingSelector Component

#### Description
Dropdown component for selecting target field mappings. Shows available fields and indicates which fields are already in use.

#### Props Interface

```typescript
interface MappingSelectorProps {
  /** Currently selected target field (null if unmapped) */
  value: string | null;
  
  /** All target fields defined in context */
  allFields: FieldDefinition[];
  
  /** Fields currently available for selection */
  availableFields: FieldDefinition[];
  
  /** Fields already used by other columns (shown but disabled) */
  usedFields: Array<{ field: FieldDefinition; usedBy: string }>;
  
  /** Callback when selection changes */
  onChange: (fieldName: string | null) => void;
  
  /** Disabled state (for compound columns) */
  disabled?: boolean;
  
  /** Placeholder text */
  placeholder?: string;  // default: "Select field..."
}
```

#### Dropdown Structure

```typescript
interface DropdownOption {
  value: string | null;
  label: string;
  description?: string;  // Field description from context
  disabled: boolean;
  disabledReason?: string;  // e.g., "Used by 'Amount' column"
  isSelected: boolean;
}

function buildDropdownOptions(props: MappingSelectorProps): DropdownOption[] {
  const options: DropdownOption[] = [];
  
  // Add "None" option at top
  options.push({
    value: null,
    label: '— None',
    disabled: false,
    isSelected: props.value === null,
  });
  
  // Add available fields (enabled)
  for (const field of props.availableFields) {
    options.push({
      value: field.field,
      label: field.field,
      description: field.description,
      disabled: false,
      isSelected: props.value === field.field,
    });
  }
  
  // Add separator if there are used fields
  if (props.usedFields.length > 0) {
    // Visual separator in dropdown
  }
  
  // Add used fields (disabled)
  for (const { field, usedBy } of props.usedFields) {
    options.push({
      value: field.field,
      label: field.field,
      description: field.description,
      disabled: true,
      disabledReason: `In use by "${usedBy}"`,
      isSelected: false,
    });
  }
  
  return options;
}
```

---

### 2.17 Results State Management

#### State Flow After API Success

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RESULTS STATE FLOW                                    │
└─────────────────────────────────────────────────────────────────────────┘

    API Response                     Initial State                User Action
         │                                │                            │
         ▼                                ▼                            ▼
┌─────────────────┐             ┌─────────────────┐           ┌─────────────────┐
│ ExtractionResult│────────────▶│ Build initial   │──────────▶│ User changes    │
│ from backend    │             │ FieldMappings   │           │ dropdown value  │
└─────────────────┘             │ from result     │           └────────┬────────┘
                                └─────────────────┘                    │
                                                                       ▼
                                                              ┌─────────────────┐
                                                              │ Update mappings │
                                                              │ state           │
                                                              └────────┬────────┘
                                                                       │
                                                                       ▼
                                                              ┌─────────────────┐
                                                              │ Re-render table │
                                                              │ with new column │
                                                              │ organization    │
                                                              └─────────────────┘
```

#### Mapping State Reducer

```typescript
type MappingAction =
  | { type: 'SET_INITIAL'; result: ExtractionResult }
  | { type: 'CHANGE_MAPPING'; sourceColumn: string; targetField: string | null }
  | { type: 'RESET' };

/** Extended direct mapping entry that tracks user modifications */
interface DirectMappingEntry {
  targetField: string | null;
  confidence: number;
  isUserModified: boolean;  // true when user changed from AI's original mapping
}

function mappingReducer(state: FieldMappings, action: MappingAction): FieldMappings {
  switch (action.type) {
    case 'SET_INITIAL':
      return buildInitialMappings(action.result);
      
    case 'CHANGE_MAPPING': {
      const newDirect = new Map(state.direct);
      
      // If selecting a field, check if it was used elsewhere and clear it
      if (action.targetField) {
        for (const [column, entry] of newDirect) {
          if (entry.targetField === action.targetField && column !== action.sourceColumn) {
            newDirect.set(column, { 
              ...entry, 
              targetField: null, 
              isUserModified: true  // Mark as modified when cleared
            });
          }
        }
      }
      
      // Get current entry (or create default)
      const currentEntry = newDirect.get(action.sourceColumn) ?? { 
        targetField: null, 
        confidence: 0, 
        isUserModified: false 
      };
      
      // Set the new mapping, marking as user modified
      newDirect.set(action.sourceColumn, {
        ...currentEntry,
        targetField: action.targetField,
        isUserModified: true,  // User changed this mapping
      });
      
      // Recalculate unmapped columns
      const unmapped = [...state.unmapped];
      if (action.targetField === null && !unmapped.includes(action.sourceColumn)) {
        unmapped.push(action.sourceColumn);
      } else if (action.targetField !== null) {
        const idx = unmapped.indexOf(action.sourceColumn);
        if (idx >= 0) unmapped.splice(idx, 1);
      }
      
      return {
        ...state,
        direct: newDirect,
        unmapped,
      };
    }
    
    case 'RESET':
      return { direct: new Map(), compound: new Map(), unmapped: [] };
      
    default:
      return state;
  }
}
```

**Note:** When `isUserModified` is `true`, the column header should NOT display confidence-based background color (user selections are assumed correct).

#### Results Dialog State

```typescript
interface ResultsDialogState {
  /** Current view mode */
  view: 'table' | 'loading' | 'error';
  
  /** Raw extraction result from API */
  result: ExtractionResult | null;
  
  /** User-modifiable field mappings */
  mappings: FieldMappings;
  
  /** Validation errors (e.g., required fields not mapped) */
  validationErrors: ValidationError[];
  
  /** Whether user has made changes to AI mappings */
  hasChanges: boolean;
}

interface ValidationError {
  type: 'REQUIRED_FIELD_UNMAPPED' | 'DUPLICATE_MAPPING';
  field: string;
  message: string;
}
```

---

### 2.18 Confirm Flow & Final Output

#### Final Output Format

When the user confirms their mappings, the system transforms the extraction result into a **clean JSON array** ready for the calling application:

```typescript
/**
 * The final output returned to the calling application.
 * A simple array of objects where keys are target field names
 * and values are the extracted string values.
 */
type FinalOutput = FinalOutputRow[];

interface FinalOutputRow {
  [fieldName: string]: string | null;
}
```

**Example Output:**
```json
[
  {
    "transaction_date": "2024-01-15",
    "product_sku": "WGT-001",
    "total_amount": "1500.00",
    "region": "NYC",
    "order_year": "2024",
    "product_type": "WIDGET"
  },
  {
    "transaction_date": "2024-01-16",
    "product_sku": "WGT-002",
    "total_amount": "2300.50",
    "region": "LA",
    "order_year": "2024",
    "product_type": "GADGET"
  }
]
```

**Note:** The final output is intentionally simple. Confidence scores and user modification tracking are used internally for UI display but are not passed to the calling application.

#### Transformation Logic

```typescript
/**
 * Transform extraction result + final mappings into clean JSON output.
 * Returns simple field → value pairs for the calling application.
 * Confidence and user modification info is NOT included in final output.
 * 
 * Uses the categorized row structure (direct/compound/unmapped).
 */
function buildFinalOutput(
  result: ExtractionResult,
  mappings: FieldMappings,
  compoundOverrides: CompoundOverrides
): FinalOutput {
  return result.data.map((row, rowIndex) => {
    const outputRow: FinalOutputRow = {};
    
    // Apply direct mappings (respecting user's dropdown changes)
    for (const [sourceColumn, targetField] of mappings.direct) {
      if (targetField) {
        // Check if this source column is in direct mappings
        if (row.direct[sourceColumn]) {
          outputRow[targetField] = row.direct[sourceColumn].value;
        }
        // Or if user mapped an unmapped column to this field
        else if (row.unmapped[sourceColumn] !== undefined) {
          outputRow[targetField] = row.unmapped[sourceColumn];
        }
      }
    }
    
    // Apply compound extractions (with user overrides)
    for (const [sourceColumn, compoundData] of Object.entries(row.compound)) {
      for (const extraction of compoundData.extractions) {
        const targetField = extraction.targetField;
        
        // Check for user override first
        const overrideKey = `${rowIndex}:${sourceColumn}:${targetField}`;
        const override = compoundOverrides.get(overrideKey);
        
        if (override !== undefined) {
          // User override takes precedence
          outputRow[targetField] = override;
        } else {
          // Use AI-extracted value
          outputRow[targetField] = extraction.extractedValue;
        }
      }
    }
    
    return outputRow;
  });
}

/**
 * Track user overrides for compound cell values
 * Key format: "rowIndex:sourceColumn:fieldName"
 */
type CompoundOverrides = Map<string, string | null>;

/**
 * Build initial FieldMappings state from extraction result
 */
function buildInitialMappings(result: ExtractionResult): FieldMappings {
  const sampleRow = result.data[0];
  if (!sampleRow) {
    return { direct: new Map(), compound: new Map(), unmapped: [] };
  }
  
  // Build direct mappings
  const direct = new Map<string, string | null>();
  for (const [sourceColumn, data] of Object.entries(sampleRow.direct)) {
    direct.set(sourceColumn, data.targetField);
  }
  
  // Build compound mappings
  const compound = new Map<string, CompoundMapping>();
  for (const [sourceColumn, data] of Object.entries(sampleRow.compound)) {
    compound.set(sourceColumn, {
      sourceColumn,
      extractedFields: data.extractions.map(e => e.targetField),
      isLocked: true,
    });
  }
  
  // Build unmapped list
  const unmapped = Object.keys(sampleRow.unmapped);
  
  return { direct, compound, unmapped };
}
```

#### Callback Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONFIRM FLOW (Dialog → Caller)                        │
└─────────────────────────────────────────────────────────────────────────┘

User clicks "Confirm"
        │
        ▼
┌─────────────────┐
│  ResultsTable   │  onConfirm(finalMappings, compoundOverrides)
│                 │───────────────────────────────────────────────┐
└─────────────────┘                                               │
                                                                  ▼
                                                    ┌─────────────────────┐
                                                    │   ImportDialog      │
                                                    │                     │
                                                    │   1. Build final    │
                                                    │      output JSON    │
                                                    │   2. Close dialog   │
                                                    │   3. Call onSuccess │
                                                    └──────────┬──────────┘
                                                               │
                                                               │ onSuccess(finalOutput)
                                                               ▼
                                                    ┌─────────────────────┐
                                                    │  Calling Component  │
                                                    │                     │
                                                    │  Receives clean     │
                                                    │  JSON array         │
                                                    └─────────────────────┘
```

#### Updated Props Interfaces

```typescript
// ResultsTable - updated onConfirm signature
interface ResultsTableProps {
  /** Extraction result from API */
  result: ExtractionResult;
  
  /** Original extraction context (for field definitions) */
  context: ExtractionContext;
  
  /** Current field mappings (can be modified by user) */
  mappings: FieldMappings;
  
  /** Callback when user changes a direct mapping */
  onMappingChange: (sourceColumn: string, targetField: string | null) => void;
  
  /** Callback when user overrides a compound cell value */
  onCompoundOverride: (rowIndex: number, sourceColumn: string, fieldName: string, value: string | null) => void;
  
  /** Maximum rows to display (with "show more" option) */
  maxPreviewRows?: number;  // default: 10
  
  /** Callback when user confirms mappings and wants to proceed */
  onConfirm: () => void;
  
  /** Callback to cancel/go back */
  onCancel: () => void;
}

// ImportDialog - updated onSuccess signature  
interface ImportDialogProps {
  /** The file to import */
  file: File;
  
  /** Whether the dialog is open */
  open: boolean;
  
  /** Callback when dialog is closed (cancelled) */
  onClose: () => void;
  
  /** Callback when import completes successfully with final data */
  onSuccess: (data: FinalOutput) => void;
  
  /** Extraction context (field definitions) */
  context: ExtractionContext;
  
  /** API endpoint configuration */
  apiConfig?: ApiConfig;
}
```

#### ImportDialog Internal State & Handlers

```typescript
function ImportDialog({ file, open, onClose, onSuccess, context, apiConfig }: ImportDialogProps) {
  // State for extraction result (from API)
  const [result, setResult] = useState<ExtractionResult | null>(null);
  
  // State for user-modified mappings
  const [mappings, dispatch] = useReducer(mappingReducer, initialMappings);
  
  // State for compound cell overrides
  const [compoundOverrides, setCompoundOverrides] = useState<CompoundOverrides>(new Map());
  
  // Handle direct mapping change
  const handleMappingChange = (sourceColumn: string, targetField: string | null) => {
    dispatch({ type: 'CHANGE_MAPPING', sourceColumn, targetField });
  };
  
  // Handle compound cell override
  const handleCompoundOverride = (
    rowIndex: number, 
    sourceColumn: string, 
    fieldName: string, 
    value: string | null
  ) => {
    setCompoundOverrides(prev => {
      const next = new Map(prev);
      const key = `${rowIndex}:${sourceColumn}:${fieldName}`;
      next.set(key, value);
      return next;
    });
  };
  
  // Handle confirm - build final output and close
  const handleConfirm = () => {
    if (!result) return;
    
    const finalOutput = buildFinalOutput(result, mappings, compoundOverrides);
    onSuccess(finalOutput);
    // Dialog will close because parent sets open=false after receiving data
  };
  
  // ... rest of component (loading, API calls, etc.)
  
  return (
    <Dialog open={open} onClose={onClose}>
      {/* ... other states ... */}
      
      {result && (
        <ResultsTable
          result={result}
          context={context}
          mappings={mappings}
          onMappingChange={handleMappingChange}
          onCompoundOverride={handleCompoundOverride}
          onConfirm={handleConfirm}
          onCancel={onClose}
        />
      )}
    </Dialog>
  );
}
```

#### Complete Usage Example

```typescript
function MyDataImportFeature() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importedData, setImportedData] = useState<FinalOutput | null>(null);
  
  const extractionContext: ExtractionContext = {
    description: "Monthly sales report from regional distributors",
    fields: [
      { field: "transaction_date", description: "The date the sale occurred" },
      { field: "product_sku", description: "The product identifier or SKU code" },
      { field: "total_amount", description: "Total sale amount" },
      { field: "region", description: "Geographic region of the customer" },
    ]
  };
  
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setDialogOpen(true);
  };
  
  const handleImportSuccess = (data: FinalOutput) => {
    // Receive the clean JSON array
    setImportedData(data);
    setDialogOpen(false);
    setSelectedFile(null);
    
    // Now you can use the data:
    // - Send to your backend
    // - Display in a data grid
    // - Process further
    console.log('Imported rows:', data.length);
    console.log('First row:', data[0]);
  };
  
  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedFile(null);
  };
  
  return (
    <div>
      <FileDropzone onFileSelect={handleFileSelect} />
      
      {selectedFile && (
        <ImportDialog
          file={selectedFile}
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleImportSuccess}
          context={extractionContext}
          apiConfig={{ baseUrl: '/api' }}
        />
      )}
      
      {importedData && (
        <div>
          <h3>Imported {importedData.length} rows</h3>
          <pre>{JSON.stringify(importedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

#### Confirm Button State

The confirm button should be disabled if required fields are unmapped:

```typescript
interface ConfirmButtonState {
  disabled: boolean;
  tooltip?: string;
}

function getConfirmButtonState(
  context: ExtractionContext,
  mappings: FieldMappings
): ConfirmButtonState {
  // Check which context fields are mapped (via direct or compound)
  const mappedFields = new Set<string>();
  
  // Collect directly mapped fields
  for (const targetField of mappings.direct.values()) {
    if (targetField) mappedFields.add(targetField);
  }
  
  // Collect compound-extracted fields
  for (const compound of mappings.compound.values()) {
    compound.extractedFields.forEach(f => mappedFields.add(f));
  }
  
  // Find unmapped fields from context
  const unmappedFields = context.fields
    .map(f => f.field)
    .filter(f => !mappedFields.has(f));
  
  if (unmappedFields.length > 0) {
    return {
      disabled: true,
      tooltip: `Unmapped fields: ${unmappedFields.join(', ')}`
    };
  }
  
  return { disabled: false };
}
```

#### Results Dialog Footer

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│                                                                          │
│   ⚠️ 2 fields unmapped: tax_rate, shipping_cost                          │
│                                                                          │
│                                    [Cancel]  [Confirm Import] (disabled) │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

OR when all fields mapped:

┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ✓ All 6 fields mapped                           150 rows will be imported │
│                                                                          │
│                                    [Cancel]  [Confirm Import]            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### 2.19 TypeScript Type Definitions

```typescript
// types/index.ts

// ─────────────────────────────────────────────────────────────
// File Types
// ─────────────────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: FileValidationError;
}

export interface FileValidationError {
  code: 'FILE_TOO_LARGE' | 'BINARY_FILE' | 'EMPTY_FILE';
  message: string;
  details?: Record<string, unknown>;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  isHidden?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Extraction Context
// ─────────────────────────────────────────────────────────────

export interface ExtractionContext {
  description: string;
  fields: FieldDefinition[];
}

export interface FieldDefinition {
  field: string;
  description: string;
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

export interface OperationProgress {
  phase: 'parsing' | 'discovery' | 'extraction' | 'mapping';
  currentStep: string;
  rowsProcessed: number;
  totalRows: number;
  percentComplete: number;
}

// ─────────────────────────────────────────────────────────────
// Results Types (Categorized Row Structure)
// ─────────────────────────────────────────────────────────────

export interface ExtractionResult {
  data: ExtractedRowData[];
  metadata: ExtractionMetadata;
}

/**
 * Each row is categorized by extraction type.
 * This structure enables:
 * - Enumerating all source columns from the file
 * - Supporting multiple target fields from a single compound column
 * - Preserving original values for UI display and user override
 */
export interface ExtractedRowData {
  /** Direct mappings: one source column → one target field */
  direct: {
    [sourceColumn: string]: DirectExtraction;
  };
  
  /** Compound extractions: one source column → multiple target fields */
  compound: {
    [sourceColumn: string]: CompoundExtraction;
  };
  
  /** Unmapped columns: source columns with no target field */
  unmapped: {
    [sourceColumn: string]: string;  // Just the original value
  };
}

export interface DirectExtraction {
  value: string;
  targetField: string;
  /** AI confidence score (1-10, where 10 is highest confidence) */
  confidence: number;
}

export interface CompoundExtraction {
  /** Original full value from source column (for display + highlighting) */
  sourceValue: string;
  /** Multiple target fields extracted from this single source value */
  extractions: Array<{
    targetField: string;
    /** The extracted portion of sourceValue */
    extractedValue: string | null;
    /** AI confidence score (1-10, where 10 is highest confidence) */
    confidence: number;
  }>;
}

export interface ExtractionMetadata {
  sourceFile: string;
  sourceSheet?: string;
  rowsProcessed: number;
  extractionSummary: {
    directMappings: number;
    compoundExtractions: number;
    /** Source columns that have no mapping */
    unmappedColumns: string[];
    /** Target fields from context that could not be matched */
    unmappedFields: string[];
    llmCalls: number;
    processingTimeMs: number;
    /** Average confidence score across all extractions (1-10) */
    averageConfidence: number;
  };
}

// ─────────────────────────────────────────────────────────────
// Field Mapping Types (for ResultsTable)
// ─────────────────────────────────────────────────────────────

export interface FieldMappings {
  /** Direct mappings: source column → mapping entry with modification tracking */
  direct: Map<string, DirectMappingEntry>;
  
  /** Compound mappings: source column → extracted fields */
  compound: Map<string, CompoundMapping>;
  
  /** Source columns with no mapping */
  unmapped: string[];
}

/** Tracks a direct column mapping with user modification state */
export interface DirectMappingEntry {
  /** The target field this column maps to (null if unmapped) */
  targetField: string | null;
  
  /** AI confidence score for the original mapping (1-10) */
  confidence: number;
  
  /** True when user changed from AI's original mapping - hides confidence color */
  isUserModified: boolean;
}

export interface CompoundMapping {
  sourceColumn: string;
  extractedFields: string[];
  isLocked: true;
}

// ─────────────────────────────────────────────────────────────
// Compound Cell Types (for user override)
// ─────────────────────────────────────────────────────────────

export interface CompoundCellValue {
  /** Original full value from source column */
  originalValue: string;
  
  /** Extracted portion (highlighted in UI) */
  extractedValue: string | null;
  
  /** Whether user has modified this from AI's original extraction */
  isUserModified: boolean;
  
  /** AI's original extraction (for reset/comparison) */
  aiOriginalValue: string | null;
  
  /** AI confidence score (1-10, where 10 is highest confidence) */
  confidence: number;
}

export interface HighlightedText {
  segments: TextSegment[];
}

export interface TextSegment {
  text: string;
  isHighlighted: boolean;
  /** Confidence score for highlighted segments (1-10) */
  confidence?: number;
}

// ─────────────────────────────────────────────────────────────
// Confidence Types
// ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'good' | 'medium' | 'low' | 'very-low';

/** Maps numeric confidence (1-10) to semantic level for styling */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 9) return 'high';
  if (score >= 7) return 'good';
  if (score >= 5) return 'medium';
  if (score >= 3) return 'low';
  return 'very-low';
}

export interface OrganizedColumns {
  directMatches: DirectMatchColumn[];
  compoundExtractions: CompoundColumn[];
  unmatchedColumns: UnmatchedColumn[];
}

export interface DirectMatchColumn {
  sourceColumn: string;
  targetField: string | null;
  /** Values across all rows */
  values: string[];
  /** Confidence score for the column mapping (1-10) - displayed in header if AI-driven */
  confidence: number;
  /** Whether user changed the mapping from AI's original suggestion */
  isUserModified: boolean;
  canEdit: true;
}

export interface CompoundColumn {
  /** Original source column name (e.g., "Order Ref") - may appear multiple times */
  sourceColumn: string;
  /** One of the target fields extracted from this source column */
  targetField: string;
  /** Per-row cell data: original value + extracted portion for highlighting */
  cells: CompoundCellValue[];
  canEdit: false;
}

export interface UnmatchedColumn {
  sourceColumn: string;
  /** Values across all rows */
  values: string[];
  canEdit: false;
}

/**
 * Get all source columns from extraction result (for dropdown options, remapping, etc.)
 */
export function getAllSourceColumns(result: ExtractionResult): string[] {
  const sampleRow = result.data[0];
  if (!sampleRow) return [];
  
  return [
    ...Object.keys(sampleRow.direct),
    ...Object.keys(sampleRow.compound),
    ...Object.keys(sampleRow.unmapped),
  ];
}

// ─────────────────────────────────────────────────────────────
// Final Output Types (returned to calling application)
// ─────────────────────────────────────────────────────────────

/**
 * The final output returned to the calling application.
 * A simple array of objects where keys are target field names
 * and values are the extracted string values.
 * 
 * Note: Confidence scores and user modification flags are used internally
 * for UI display but are NOT included in the final output. The calling
 * application receives clean, simple data.
 */
export type FinalOutput = FinalOutputRow[];

export interface FinalOutputRow {
  [fieldName: string]: string | null;
}

/**
 * Track user overrides for compound cell values
 * Key format: "rowIndex:sourceColumn:fieldName"
 */
export type CompoundOverrides = Map<string, string | null>;

// ─────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'BINARY_FILE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_FORMAT'  // Backend cannot parse the file content
  | 'SHEET_NOT_FOUND'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'OPERATION_CANCELLED'
  | 'UNKNOWN';

export class ImportError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
```

---

## 3. Demo Application

### 3.1 Purpose

The demo application (`packages/demo-app`) demonstrates the component library's import workflow. It is a Next.js app that allows users to configure extraction context, upload files, and view the resulting JSON output.

### 3.2 Page Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Generic Data Importer                            │
│                              Demo App                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    CONTEXT CONFIGURATION                         │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                  │    │
│  │  Presets: [ Sales Data ] [ Legal Billing ] [ HR Records ]       │    │
│  │                                                                  │    │
│  │  Description:                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │ Monthly sales report from regional distributors...      │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │  Fields:                                                         │    │
│  │  ┌───────────────────┬─────────────────────────────────────┐    │    │
│  │  │ Field Name        │ Description                         │    │    │
│  │  ├───────────────────┼─────────────────────────────────────┤    │    │
│  │  │ [transaction_date]│ [The date the sale occurred       ] │    │    │
│  │  │ [product_sku    ] │ [The product identifier or SKU    ] │    │    │
│  │  │ [quantity_sold  ] │ [Number of units sold             ] │    │    │
│  │  │ [unit_price     ] │ [Price per unit at time of sale   ] │    │    │
│  │  └───────────────────┴─────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │  [ + Add Field ]                                                 │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       FILE UPLOAD                                │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                  │    │
│  │         ┌───────────────────────────────────────────┐           │    │
│  │         │                                           │           │    │
│  │         │     📁 Drop file here or click to browse  │           │    │
│  │         │         CSV, Excel (.xlsx, .xls)          │           │    │
│  │         │                                           │           │    │
│  │         └───────────────────────────────────────────┘           │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Page States

The demo page has two main states:

#### State: READY (Initial)

Shows the context configuration and file upload sections. User can:
- Edit the context description
- Add/edit/remove fields
- Click preset buttons to load predefined configurations
- Upload a file to start the import flow

#### State: RESULTS

After import completes and user confirms, displays:
- The final JSON output in a formatted code block
- A "Reset" button to return to READY state

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Generic Data Importer                            │
│                              Demo App                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      EXTRACTION RESULT                           │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │ {                                                       │    │    │
│  │  │   "extraction_id": "ext_abc123",                        │    │    │
│  │  │   "source_file": "sales_data.xlsx",                     │    │    │
│  │  │   "row_count": 150,                                     │    │    │
│  │  │   "fields_extracted": ["transaction_date", "product_s.. │    │    │
│  │  │   "rows": [                                             │    │    │
│  │  │     {                                                   │    │    │
│  │  │       "transaction_date": "2024-01-15",                 │    │    │
│  │  │       "product_sku": "SKU-001",                         │    │    │
│  │  │       ...                                               │    │    │
│  │  │     }                                                   │    │    │
│  │  │   ]                                                     │    │    │
│  │  │ }                                                       │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │                        [ Reset ]                                 │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Context Configuration Section

#### Description Input

A multi-line text area for the business context description.

```typescript
interface ContextConfig {
  description: string;
  fields: FieldDefinition[];
}

interface FieldDefinition {
  id: string;          // unique ID for React key
  field: string;       // field name
  description: string; // field description
}
```

#### Fields Editor

An editable table/list of field definitions:
- Each row has two text inputs: field name and description
- Each row has a delete button (×) to remove the field
- "Add Field" button appends a new empty row

#### Preset Buttons

Three buttons that populate the context with predefined values:

```typescript
interface Preset {
  name: string;           // Button label
  context: ContextConfig; // Predefined values
}

// Presets to be defined during implementation
const PRESETS: Preset[] = [
  { name: "Preset 1", context: { /* TBD */ } },
  { name: "Preset 2", context: { /* TBD */ } },
  { name: "Preset 3", context: { /* TBD */ } },
];
```

Clicking a preset button:
1. Replaces the current description with the preset description
2. Replaces all fields with the preset fields

### 3.5 File Upload Section

Uses the `ImportWorkflow` component which encapsulates:
- `FileDropzone` for file selection
- `ImportDialog` that opens **automatically** when a file is dropped
- The entire import flow (validation, sheet selection, API call, results review)

**Key Point:** The demo page does NOT manage dialog state. When the user drops a file, the `ImportWorkflow` component handles everything automatically. The page only needs to:
1. Provide the context configuration
2. Receive the `FinalOutput` when the user confirms

```typescript
// packages/demo-app/src/app/page.tsx
'use client';

import { useState } from 'react';
import { Container, Box, Typography } from '@mui/material';
// Import from the component library package
import { FileDropzone, ImportDialog } from '@your-org/data-importer-ui';
import type { ExtractionContext, FinalOutput } from '@your-org/data-importer-ui';
// Local demo-app components
import { ContextSection } from '../components/ContextSection';
import { ResultsSection } from '../components/ResultsSection';

const DEFAULT_CONTEXT: ExtractionContext = {
  description: '',
  fields: [],
};

export default function DemoPage() {
  const [pageState, setPageState] = useState<'READY' | 'RESULTS'>('READY');
  const [context, setContext] = useState<ExtractionContext>(DEFAULT_CONTEXT);
  const [result, setResult] = useState<FinalOutput | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setDialogOpen(true);
  };

  const handleImportSuccess = (output: FinalOutput) => {
    setResult(output);
    setDialogOpen(false);
    setSelectedFile(null);
    setPageState('RESULTS');
  };

  const handleReset = () => {
    setResult(null);
    setPageState('READY');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>
        Generic Data Importer
      </Typography>

      {pageState === 'READY' && (
        <>
          <ContextSection context={context} onChange={setContext} />
          <Box sx={{ mt: 4 }}>
            <FileDropzone onFileSelect={handleFileSelect} />
          </Box>
        </>
      )}

      {pageState === 'RESULTS' && (
        <ResultsSection result={result} onReset={handleReset} />
      )}

      {selectedFile && (
        <ImportDialog
          file={selectedFile}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleImportSuccess}
          context={context}
          apiConfig={{
            baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL!,
          }}
        />
      )}
    </Container>
  );
}
```

**Flow:**
1. User drops file onto `ImportWorkflow`
2. `ImportDialog` opens automatically
3. User goes through sheet selection (if Excel), reviews results, confirms
4. `onSuccess` callback fires with `FinalOutput`
5. Page transitions to RESULTS state

### 3.6 Results Display Section

Displays the `FinalOutput` JSON with:
- Syntax highlighting (optional, can use `<pre>` with basic styling)
- Scrollable container for large outputs
- Copy-to-clipboard button (nice to have)

### 3.7 Component Breakdown

```
packages/demo-app/src/app/page.tsx (DemoPage)
├── Header (MUI Typography)
├── ContextSection (when READY) ─────────────────── [demo-app local]
│   ├── PresetButtons
│   ├── DescriptionInput
│   └── FieldsEditor
│       ├── FieldRow (×N)
│       └── AddFieldButton
├── FileDropzone (when READY) ───────────────────── [from ui-library]
├── ImportDialog (modal, opens on file drop) ────── [from ui-library]
│   ├── SheetSelector (if multi-sheet Excel)
│   ├── LoadingOverlay (during extraction)
│   ├── ErrorDialog (on error)
│   └── ResultsTable (on success)
└── ResultsSection (when RESULTS) ───────────────── [demo-app local]
    ├── JsonDisplay
    └── ResetButton
```

### 3.8 Styling

**Framework:** MUI (Material-UI)

**Design Goals:**
- Clean, minimal interface using MUI's default theme
- Clear visual hierarchy between sections
- Responsive layout (works on desktop, reasonable on tablet)
- Code/JSON display with monospace font and subtle background
- Use MUI components: `Card`, `TextField`, `Button`, `Dialog`, `Table`, etc.

---

## 4. Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER WORKFLOW                               │
└─────────────────────────────────────────────────────────────────┘

1. User uploads file (CSV/Excel)
                │
                ▼
2. User provides context:
   - Business description
   - Field definitions (name + description)
                │
                ▼
3. System parses file → Normalized JSON
                │
                ▼
4. PASS 1: Sample (30 rows) + Context → LLM
   - Identify direct mappings
   - Identify compound columns
                │
                ▼
5. Compound columns found?
   ├── NO  → Skip to step 7
   └── YES → PASS 2
                │
                ▼
6. PASS 2: All compound column values → LLM
   - Extract embedded fields
   - Return values per row
                │
                ▼
7. Merge:
   - Apply direct mappings (programmatic)
   - Merge compound extractions (from LLM)
                │
                ▼
8. Return extracted data to user
```

---

## 5. Open Questions / Future Decisions

### Backend Repository
- [x] Chunking threshold for Pass 2 → **~4000 tokens per LLM call** (configurable via `TOKEN_THRESHOLD`)
- [x] Error handling: If LLM fails to extract a value → return `null` for that extraction
- [ ] Validation: Verify Pass 2 returns correct number of rows?
- [x] Inference provider selection → **OpenAI (pluggable interface for future providers)**
- [ ] Authentication requirements (API keys, sessions, etc.)
- [ ] Retry logic for failed LLM calls (count, backoff strategy)
- [x] Background task execution → **Async fire-and-forget (consider BullMQ/Redis for production)**
- [ ] Rate limiting strategy?
- [x] API framework → **Express.js or Fastify**

### Frontend Repository
- [x] Styling framework → **MUI (Material-UI)**
- [x] UI components → **MUI components (@mui/material)**
- [x] State management approach → Internal state machine with useReducer for import flow
- [x] Repository structure → **Monorepo with ui-library + demo-app packages**
- [x] Package management → **pnpm workspaces**
- [ ] Preview mode before full extraction?
- [ ] Sheet inspection library (xlsx/SheetJS) - bundle size considerations
- [ ] Maximum number of sheets to display in selector?
- [x] Show row/column count preview in sheet selector? → Yes
- [x] Binary file detection threshold → 10% non-printable characters
- [x] Track user modifications to mappings → **`isUserModified` flag in `DirectMappingEntry`**
- [ ] Publish ui-library to npm? (internal vs public)

### General
- [ ] Data transformation by LLM (e.g., date format normalization)?
- [x] Confidence scores per field mapping? → **Yes, 1-10 scale in API response**
- [x] API case convention → **camelCase** (native TypeScript)
- [x] User override confidence → **No confidence shown, marked `isUserModified: true`, gray highlight**
- [x] Compound column data structure → **Categorized rows: direct/compound/unmapped sections**
- [x] Repository structure → **Two repos: backend + frontend (component library + demo)**
- [ ] Backend deployment → AWS Copilot (ECS) or Docker hosting
- [ ] Frontend deployment → Vercel or AWS (S3/CloudFront)

---

## 6. Technology Stack

### Backend Repository

#### Runtime & Framework
- **Runtime:** Node.js 20+
- **Framework:** Express.js or Fastify
- **Language:** TypeScript 5+

#### Core Libraries
- **File Parsing:** xlsx (SheetJS) for Excel, papaparse for CSV
- **LLM Integration:** openai (Node.js SDK)
- **Token Counting:** tiktoken (for chunking decisions)
- **Validation:** Zod schemas
- **Storage:** In-memory Map (MVP), Redis (production)

#### Development & Deployment
- **Package Manager:** npm or pnpm
- **Build:** tsup or tsc
- **Linting:** ESLint 9
- **Deployment:** AWS Copilot (ECS/Fargate) or Docker

---

### Frontend Repository

#### Component Library (`packages/ui-library`)
- **React:** React 18+ or 19
- **UI Framework:** MUI (Material-UI) - @mui/material, @emotion/react, @emotion/styled
- **Icons:** @mui/icons-material
- **Build:** tsup (for library bundling)
- **Excel Metadata:** xlsx (SheetJS) - client-side sheet inspection

#### Demo Application (`packages/demo-app`)
- **Framework:** Next.js 14+ (App Router)
- **Styling:** MUI theming
- **State Management:** React hooks + useReducer

#### Workspace Management
- **Package Manager:** pnpm (workspaces)
- **Monorepo Tool:** Turborepo (optional)
- **Linting:** ESLint 9
- **Deployment:** Vercel or AWS Copilot

---

## 7. Environment Configuration

### Backend Repository Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server port |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origins (comma-separated) |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for LLM inference |
| `OPENAI_MODEL` | No | `gpt-4o` | Model to use for extraction |
| `TOKEN_THRESHOLD` | No | `4000` | Max tokens per LLM call before chunking |
| `OPERATION_TTL_COMPLETED_HOURS` | No | `24` | TTL for completed operations |
| `OPERATION_TTL_FAILED_HOURS` | No | `24` | TTL for failed operations |
| `OPERATION_TTL_PENDING_MINUTES` | No | `30` | TTL for pending operations |
| `OPERATION_TTL_PROCESSING_HOURS` | No | `1` | TTL for stuck processing operations |
| `OPERATION_TTL_CANCELLED_HOURS` | No | `1` | TTL for cancelled operations |
| `MAX_FILE_SIZE_MB` | No | `50` | Maximum upload file size in MB |

**Backend Configuration Loading:**
```typescript
// src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3001),
  corsOrigin: z.string().default('*'),
  openaiApiKey: z.string().min(1),
  openaiModel: z.string().default('gpt-4o'),
  tokenThreshold: z.coerce.number().default(4000),
  maxFileSizeMb: z.coerce.number().default(50),
  operationTtl: z.object({
    completedHours: z.coerce.number().default(24),
    failedHours: z.coerce.number().default(24),
    pendingMinutes: z.coerce.number().default(30),
    processingHours: z.coerce.number().default(1),
    cancelledHours: z.coerce.number().default(1),
  }).default({}),
});

export const config = configSchema.parse({
  port: process.env.PORT,
  corsOrigin: process.env.CORS_ORIGIN,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL,
  tokenThreshold: process.env.TOKEN_THRESHOLD,
  maxFileSizeMb: process.env.MAX_FILE_SIZE_MB,
  operationTtl: {
    completedHours: process.env.OPERATION_TTL_COMPLETED_HOURS,
    failedHours: process.env.OPERATION_TTL_FAILED_HOURS,
    pendingMinutes: process.env.OPERATION_TTL_PENDING_MINUTES,
    processingHours: process.env.OPERATION_TTL_PROCESSING_HOURS,
    cancelledHours: process.env.OPERATION_TTL_CANCELLED_HOURS,
  },
});
```

**Backend `.env.example`:**
```bash
# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Required
OPENAI_API_KEY=sk-...

# Optional
OPENAI_MODEL=gpt-4o
TOKEN_THRESHOLD=4000
MAX_FILE_SIZE_MB=50
```

---

### Frontend Repository Environment Variables

**Demo App (`packages/demo-app`):**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | - | Backend API base URL (e.g., `http://localhost:3001`) |
| `NEXT_PUBLIC_POLLING_INTERVAL_MS` | No | `1000` | Polling interval for operation status |
| `NEXT_PUBLIC_REQUEST_TIMEOUT_MS` | No | `30000` | HTTP request timeout |

**Component Library (`packages/ui-library`):**

The component library accepts configuration via props, not environment variables:

```typescript
// ImportService configuration passed at runtime
const importService = new ImportService({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  pollingIntervalMs: 1000,
  requestTimeoutMs: 30000,
});
```

**Frontend `.env.local` (demo-app):**
```bash
# Required - Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# Optional
NEXT_PUBLIC_POLLING_INTERVAL_MS=1000
NEXT_PUBLIC_REQUEST_TIMEOUT_MS=30000
```

---

## 8. Next Steps

### BACKEND REPOSITORY

#### Phase 1: Backend - Project Setup
1. [ ] Create `data-importer-backend` repository
2. [ ] Initialize Node.js/TypeScript project with Express or Fastify
3. [ ] Install dependencies: `xlsx`, `papaparse`, `openai`, `zod`, `cors`, `multer`
4. [ ] Set up project folder structure (`src/api/`, `src/parsers/`, `src/extraction/`, etc.)
5. [ ] Create environment configuration (`src/config/index.ts`)
6. [ ] Define TypeScript interfaces (`src/types/index.ts`)
7. [ ] Set up basic Express/Fastify app with CORS and error handling

#### Phase 2: Backend - Parsers & Normalization
8. [ ] Implement `src/parsers/base-parser.ts` - parser interface
9. [ ] Implement `src/parsers/csv-parser.ts` - CSV → Normalized JSON using papaparse
10. [ ] Implement `src/parsers/excel-parser.ts` - Excel → Normalized JSON using xlsx
11. [ ] Implement `src/parsers/index.ts` - parser factory/registry
12. [ ] Write unit tests for parsers

#### Phase 3: Backend - Operations Management
13. [ ] Implement `src/operations/models.ts` - operation state types
14. [ ] Implement `src/operations/store.ts` - in-memory Map storage
15. [ ] Implement `src/operations/manager.ts` - operation lifecycle management
16. [ ] Implement TTL cleanup logic (background interval)

#### Phase 4: Backend - LLM Integration
17. [ ] Implement `src/prompts/base-extraction.ts` - static prompt template
18. [ ] Implement `src/prompts/discovery.ts` - Pass 1 prompt builder
19. [ ] Implement `src/extraction/sampler.ts` - row sampling logic (≤50 → all, >50 → first 30)
20. [ ] Implement `src/extraction/llm-client.ts` - OpenAI client wrapper
21. [ ] Implement `src/extraction/extractor.ts` - main orchestrator (Pass 1 only)
22. [ ] Test end-to-end with CSV file (direct mappings only)

#### Phase 5: Backend - API Endpoints
23. [ ] Implement `src/api/routes/extract.ts` - POST /api/extract endpoint
24. [ ] Implement `src/api/routes/operations.ts` - GET /api/operations/:operationId
25. [ ] Implement `src/api/routes/operations.ts` - POST /api/operations/:operationId/cancel
26. [ ] Implement `src/api/routes/health.ts` - GET /api/health
27. [ ] Implement `src/workers/extraction-worker.ts` - async extraction processing
28. [ ] Add request validation middleware with Zod
29. [ ] Add error handling middleware

#### Phase 6: Backend - Compound Extraction
30. [ ] Implement `src/prompts/compound.ts` - Pass 2 prompt builder
31. [ ] Implement `src/mapping/mapper.ts` - merge direct + compound results
32. [ ] Add compound extraction to `extractor.ts`
33. [ ] Implement chunking for large files (token threshold)
34. [ ] Add progress updates during chunked extraction
35. [ ] Add confidence score instructions to LLM prompts (1-10 scale)
36. [ ] Parse and validate confidence scores from LLM responses
37. [ ] Calculate and include average confidence in extraction metadata

#### Phase 7: Backend - Production Hardening
38. [ ] Add retry logic for LLM failures
39. [ ] Add proper error logging
40. [ ] Create Dockerfile
41. [ ] Add rate limiting (optional)
42. [ ] Consider persistent storage for operations (Redis)

---

### FRONTEND REPOSITORY

#### Phase 8: Frontend - Project Setup
43. [ ] Create `data-importer-frontend` repository
44. [ ] Initialize pnpm workspace with `packages/ui-library` and `packages/demo-app`
45. [ ] Set up ui-library with tsup for building
46. [ ] Set up demo-app with Next.js
47. [ ] Install MUI dependencies: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`
48. [ ] Install xlsx for client-side sheet inspection
49. [ ] Configure MUI theme provider in demo-app layout

#### Phase 9: Frontend - Component Library Services
50. [ ] Implement `packages/ui-library/src/services/file-validator.ts`
51. [ ] Implement `packages/ui-library/src/services/sheet-inspector.ts`
52. [ ] Implement `isBinaryFile()` utility function
53. [ ] Implement `packages/ui-library/src/services/import-service.ts` - API client with polling
54. [ ] Implement `startExtraction()`, `pollOperation()`, `cancelOperation()` methods

#### Phase 10: Frontend - Core Components
55. [ ] Implement `FileDropzone.tsx` - drag/drop file selection (MUI styled)
56. [ ] Implement `ErrorDialog.tsx` - error display with MUI Dialog
57. [ ] Implement `SheetSelector.tsx` - MUI List for sheet selection
58. [ ] Implement `LoadingOverlay.tsx` - MUI CircularProgress with progress

#### Phase 11: Frontend - Import Dialog Flow
59. [ ] Implement `ImportDialog.tsx` - MUI Dialog container
60. [ ] Implement import flow state machine (IDLE → VALIDATING → SHEET_SELECTION → CALLING_API → COMPLETE/ERROR)
61. [ ] Wire up state transitions and error handling
62. [ ] Add timeout and abort signal handling

#### Phase 12: Frontend - Results Display
63. [ ] Implement `ResultsTable.tsx` - MUI Table for extraction results
64. [ ] Implement column organization logic (direct → compound → unmatched)
65. [ ] Implement `MappingSelector.tsx` - MUI Select for field mappings
66. [ ] Add "field already in use" disabled state logic
67. [ ] Implement compound column grouping with spanning headers
68. [ ] Implement `CompoundCell.tsx` - value with highlighted extraction
69. [ ] Implement text selection detection in compound cells
70. [ ] Implement right-click context menu (MUI Menu) for compound cell override
71. [ ] Add highlight rendering logic
72. [ ] Implement `ColumnHeader.tsx` - header with confidence indicator
73. [ ] Implement field mappings state management (useReducer)
74. [ ] Add visual indicators for column types
75. [ ] Add confidence-based colors (headers + highlights)
76. [ ] Add confidence tooltips (MUI Tooltip)

#### Phase 13: Frontend - Confirm Flow
77. [ ] Implement `CompoundOverrides` state management
78. [ ] Implement `buildFinalOutput()` transformation function
79. [ ] Add confirm button state logic (disabled when required fields unmapped)
80. [ ] Add validation summary display (unmapped fields warning, row count)
81. [ ] Wire up confirm flow: ResultsTable → ImportDialog → consumer

#### Phase 14: Frontend - Component Library Export
82. [ ] Export all components from `packages/ui-library/src/index.ts`
83. [ ] Export types from `packages/ui-library/src/types/index.ts`
84. [ ] Configure tsup build for ESM and CJS output
85. [ ] Test library build and exports
86. [ ] Document component props and usage

#### Phase 15: Demo Application
87. [ ] Implement `ContextSection.tsx` - context configuration container
88. [ ] Implement `DescriptionInput.tsx` - MUI TextField multiline
89. [ ] Implement `FieldsEditor.tsx` - editable field list with MUI Table
90. [ ] Implement `PresetButtons.tsx` - MUI ButtonGroup for presets
91. [ ] Define preset configurations
92. [ ] Implement `ResultsSection.tsx` - JSON display + reset button
93. [ ] Implement `app/page.tsx` - main demo page with state management

#### Phase 16: Styling & Polish
94. [ ] Customize MUI theme (colors, typography)
95. [ ] Add dark mode support (optional, via MUI theme)
96. [ ] Ensure responsive layout (MUI breakpoints)
97. [ ] Add loading skeletons/animations (MUI Skeleton component)

---

### INTEGRATION & TESTING

#### Phase 17: Integration Testing
98. [ ] Test file validation (binary rejection, size limits)
99. [ ] Test multi-sheet Excel flow
100. [ ] Test error scenarios (network, timeout, API errors)
101. [ ] Test compound cell override flow
102. [ ] Test confirm flow and final output generation
103. [ ] Test confidence colors display
104. [ ] End-to-end test with sample files (backend + frontend)

#### Phase 18: Deployment
105. [ ] Deploy backend to AWS (Copilot/ECS) or other hosting
106. [ ] Deploy demo-app to Vercel or AWS
107. [ ] Configure CORS for production domains
108. [ ] Publish ui-library to npm (optional)

