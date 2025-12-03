import { ExtractionContext, NormalizedData } from '../../shared/types';
import { BASE_EXTRACTION_PROMPT, JSON_OUTPUT_INSTRUCTIONS } from './base-extraction.prompt';

/**
 * Build the discovery prompt for Pass 1
 * Identifies direct mappings and compound columns
 */
export function buildDiscoveryPrompt(
  sample: NormalizedData,
  context: ExtractionContext,
): string {
  const { headers, rows } = sample.data;

  // Format sample data
  const sampleDataStr = JSON.stringify(
    {
      headers,
      sampleRows: rows.slice(0, 10), // Show first 10 rows for context
      totalRows: rows.length,
    },
    null,
    2,
  );

  // Format field definitions
  const fieldsStr = context.fields
    .map((f) => `- "${f.field}": ${f.description}`)
    .join('\n');

  return `${BASE_EXTRACTION_PROMPT}

## Task: Column Discovery (Pass 1)

Analyze the source data and identify how columns map to the requested target fields.

### Business Context:
${context.description}

### Target Fields to Extract:
${fieldsStr}

### Source Data:
\`\`\`json
${sampleDataStr}
\`\`\`

### Instructions:
1. For each target field, determine if there's a source column that directly contains that data
2. Identify any "compound" columns that contain multiple pieces of information (e.g., "Order-2024-NYC-WIDGET" contains order year, region, and product type)
3. List any target fields that cannot be mapped to any source column

${JSON_OUTPUT_INSTRUCTIONS}

### Expected JSON Structure:
\`\`\`json
{
  "directMappings": {
    "target_field_name": {
      "sourceColumn": "Source Column Name",
      "confidence": 8
    }
  },
  "compoundColumns": {
    "Source Column Name": ["target_field_1", "target_field_2"]
  },
  "unmappedFields": ["field_that_could_not_be_mapped"]
}
\`\`\`

Respond with only the JSON object:`;
}

/**
 * Parse the discovery response from LLM
 */
export interface ParsedDiscoveryResult {
  directMappings: Record<string, { sourceColumn: string; confidence: number }>;
  compoundColumns: Record<string, string[]>;
  unmappedFields: string[];
}

export function parseDiscoveryResponse(response: string): ParsedDiscoveryResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in discovery response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      directMappings: parsed.directMappings || {},
      compoundColumns: parsed.compoundColumns || {},
      unmappedFields: parsed.unmappedFields || [],
    };
  } catch (error) {
    throw new Error(`Failed to parse discovery response: ${error.message}`);
  }
}

