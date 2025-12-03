/**
 * Utility functions for detecting binary file content
 */

/**
 * Check if a buffer contains binary (non-text) content
 * Uses heuristics to detect binary content:
 * - Checks for null bytes (common in binary files)
 * - Checks ratio of non-printable characters
 *
 * @param buffer - The file content buffer to check
 * @param sampleSize - Number of bytes to sample (default: 8192)
 * @returns true if the content appears to be binary
 */
export function isBinaryContent(buffer: Buffer, sampleSize = 8192): boolean {
  // Sample the beginning of the file
  const sample = buffer.slice(0, Math.min(sampleSize, buffer.length));

  // Count null bytes and non-printable characters
  let nullBytes = 0;
  let nonPrintable = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];

    // Null byte is a strong indicator of binary content
    if (byte === 0) {
      nullBytes++;
    }

    // Check for non-printable characters (excluding common whitespace)
    // Printable ASCII range is 32-126, plus tab (9), newline (10), carriage return (13)
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++;
    }

    // Also count bytes outside ASCII range that aren't valid UTF-8
    // (though we'll be lenient here since UTF-8 is common)
  }

  // If we have any null bytes, it's likely binary
  if (nullBytes > 0) {
    return true;
  }

  // If more than 10% of the sample is non-printable, consider it binary
  const nonPrintableRatio = nonPrintable / sample.length;
  if (nonPrintableRatio > 0.1) {
    return true;
  }

  return false;
}

/**
 * Get a string description of why content was detected as binary
 * Useful for error messages
 */
export function getBinaryDetectionReason(buffer: Buffer, sampleSize = 8192): string | null {
  const sample = buffer.slice(0, Math.min(sampleSize, buffer.length));

  let nullBytes = 0;
  let nonPrintable = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];

    if (byte === 0) {
      nullBytes++;
    }

    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintable++;
    }
  }

  if (nullBytes > 0) {
    return `File contains ${nullBytes} null byte(s) in the first ${sample.length} bytes`;
  }

  const nonPrintableRatio = nonPrintable / sample.length;
  if (nonPrintableRatio > 0.1) {
    return `File contains ${(nonPrintableRatio * 100).toFixed(1)}% non-printable characters`;
  }

  return null;
}

