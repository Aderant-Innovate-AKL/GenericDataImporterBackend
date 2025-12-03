import { FieldDefinition } from '../../shared/types';
import { BASE_EXTRACTION_PROMPT, JSON_OUTPUT_INSTRUCTIONS } from './base-extraction.prompt';

/**
 * Input for compound extraction prompt
 */
export interface CompoundExtractionInput {
  sourceColumn: string;
  fieldsToExtract: FieldDefinition[];
  values: Array<{ rowIndex: number; value: string }>;
}

/**
 * Build the compound extraction prompt for Pass 2
 * Extracts specific values from compound columns
 */
export function buildCompoundPrompt(inputs: CompoundExtractionInput[]): string {
  // Format the extraction requests
  const extractionRequests = inputs.map((input) => ({
    sourceColumn: input.sourceColumn,
    fieldsToExtract: input.fieldsToExtract.map((f) => ({
      field: f.field,
      description: f.description,
    })),
    values: input.values,
  }));

  return `${BASE_EXTRACTION_PROMPT}

## Task: Compound Value Extraction (Pass 2)

Extract specific values from compound/combined data fields. Each source value may contain multiple pieces of information that need to be separated.

### Extraction Requests:
\`\`\`json
${JSON.stringify(extractionRequests, null, 2)}
\`\`\`

### Instructions:
1. For each source column, analyze the provided values
2. Extract the requested fields from each value
3. Provide a confidence score (1-10) for each extraction
4. If a field cannot be extracted, set value to null with low confidence

${JSON_OUTPUT_INSTRUCTIONS}

### Expected JSON Structure:
\`\`\`json
{
  "extractions": [
    {
      "rowIndex": 0,
      "sourceColumn": "Order Ref",
      "fields": {
        "region": { "value": "NYC", "confidence": 9 },
        "order_year": { "value": "2024", "confidence": 10 }
      }
    }
  ]
}
\`\`\`

Respond with only the JSON object:`;
}

/**
 * Parsed extraction result for a single field
 */
export interface ParsedFieldExtraction {
  value: string | null;
  confidence: number;
}

/**
 * Parsed extraction result for a single row
 */
export interface ParsedRowExtraction {
  rowIndex: number;
  sourceColumn: string;
  fields: Record<string, ParsedFieldExtraction>;
}

/**
 * Parse the compound extraction response from LLM
 */
export interface ParsedCompoundResult {
  extractions: ParsedRowExtraction[];
}

export function parseCompoundResponse(response: string): ParsedCompoundResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in compound extraction response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!Array.isArray(parsed.extractions)) {
      throw new Error('Response missing "extractions" array');
    }

    return {
      extractions: parsed.extractions.map((ext: any) => ({
        rowIndex: ext.rowIndex ?? 0,
        sourceColumn: ext.sourceColumn ?? '',
        fields: ext.fields || {},
      })),
    };
  } catch (error) {
    throw new Error(`Failed to parse compound response: ${error.message}`);
  }
}

