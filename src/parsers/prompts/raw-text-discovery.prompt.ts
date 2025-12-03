/**
 * Prompt for discovering and extracting structured data from raw text files
 */

const RAW_TEXT_SYSTEM_CONTEXT = `You are a data extraction specialist. Your task is to analyze raw text content and extract any structured or tabular data it contains.

You must identify patterns in the data and convert them into a normalized JSON format with headers and rows.`;

const JSON_OUTPUT_INSTRUCTIONS = `Important:
- Respond with ONLY a valid JSON object, no additional text
- All values must be strings
- If no structured data can be extracted, return an empty result`;

/**
 * Build a prompt to extract structured data from raw text
 */
export function buildRawTextDiscoveryPrompt(rawContent: string, maxContentLength = 50000): string {
  // Truncate content if too long to avoid token limits
  const truncatedContent =
    rawContent.length > maxContentLength
      ? rawContent.slice(0, maxContentLength) + '\n\n[Content truncated...]'
      : rawContent;

  return `${RAW_TEXT_SYSTEM_CONTEXT}

## Task: Extract Structured Data from Raw Text

Analyze the following raw text content and extract any structured or tabular data you can identify.

### Raw Content:
\`\`\`
${truncatedContent}
\`\`\`

### Instructions:
1. Look for any patterns that suggest tabular data (SQL INSERT statements, key-value pairs, repeated structures, delimited data, etc.)
2. Identify column headers/field names from the data pattern
3. Extract all rows of data you can find
4. Convert all values to strings

${JSON_OUTPUT_INSTRUCTIONS}

### Expected JSON Structure:
\`\`\`json
{
  "success": true,
  "headers": ["column1", "column2", "column3"],
  "rows": [
    {"column1": "value1", "column2": "value2", "column3": "value3"},
    {"column1": "value4", "column2": "value5", "column3": "value6"}
  ],
  "dataPattern": "Brief description of the data pattern found (e.g., 'SQL INSERT statements', 'CSV-like data', 'JSON array')"
}
\`\`\`

If you cannot identify any structured data, respond with:
\`\`\`json
{
  "success": false,
  "reason": "Description of why structured data could not be extracted"
}
\`\`\`

Respond with only the JSON object:`;
}

/**
 * Result from parsing the raw text discovery response
 */
export interface RawTextDiscoveryResult {
  success: boolean;
  headers?: string[];
  rows?: Record<string, string>[];
  dataPattern?: string;
  reason?: string;
}

/**
 * Parse the LLM response for raw text discovery
 */
export function parseRawTextDiscoveryResponse(response: string): RawTextDiscoveryResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      success: false,
      reason: 'No JSON object found in LLM response',
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.success) {
      return {
        success: false,
        reason: parsed.reason || 'LLM could not extract structured data',
      };
    }

    // Validate the response structure
    if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
      return {
        success: false,
        reason: 'Invalid response structure: missing headers or rows arrays',
      };
    }

    // Ensure all row values are strings
    const normalizedRows = parsed.rows.map((row: Record<string, unknown>) => {
      const normalizedRow: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalizedRow[key] = value !== null && value !== undefined ? String(value) : '';
      }
      return normalizedRow;
    });

    return {
      success: true,
      headers: parsed.headers,
      rows: normalizedRows,
      dataPattern: parsed.dataPattern,
    };
  } catch (error) {
    return {
      success: false,
      reason: `Failed to parse LLM response: ${error.message}`,
    };
  }
}

