/**
 * Safely replaces a substring in the full text based on start and end offsets,
 * verifying that the content at the range matches the expected original text.
 * 
 * @param {string} fullText The current editor content.
 * @param {string} replacement The suggested text from AI.
 * @param {number} start The selection start index.
 * @param {number} end The selection end index.
 * @param {string} expectedText The original text that was sent to the AI.
 * @returns {{ success: boolean, updatedText?: string, error?: string }}
 */
export function replaceTextSafe(fullText, replacement, start, end, expectedText) {
  // Validate index bounds
  if (start < 0 || end > fullText.length || start > end) {
    return {
      success: false,
      error: 'Selection bounds are out of range. Please re-select the text.',
    };
  }

  // Extract actual text in the range
  const actualText = fullText.substring(start, end);

  // Compare actual text in the range to what was sent to the AI
  if (actualText !== expectedText) {
    return {
      success: false,
      error: 'The editor content in the selected range has changed. Please select the text and try again.',
    };
  }

  // Perform the replacement
  const updatedText = fullText.slice(0, start) + replacement + fullText.slice(end);

  return {
    success: true,
    updatedText,
  };
}
