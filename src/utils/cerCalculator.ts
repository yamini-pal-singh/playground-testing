/**
 * Character Error Rate (CER) Calculator
 * CER measures the accuracy of speech recognition at the character level.
 * It's useful for languages with complex scripts or when word boundaries are ambiguous.
 * 
 * Formula: CER = (S + D + I) / N
 * Where:
 * - S = Character substitutions
 * - D = Character deletions
 * - I = Character insertions
 * - N = Total number of characters in reference
 */

/**
 * Calculate Character Error Rate between reference and hypothesis text
 * @param reference - Expected/ground truth text
 * @param hypothesis - Predicted/ASR output text
 * @returns CER value between 0 and 1 (0 = perfect match, 1 = completely different)
 */
export function calculateCER(reference: string, hypothesis: string): number {
  // Normalize texts and cap length to avoid OOM on long audio transcriptions
  const refChars = normalizeText(reference).slice(0, MAX_CER_CHARS).split('');
  const hypChars = normalizeText(hypothesis).slice(0, MAX_CER_CHARS).split('');

  // If reference is empty, CER is undefined (return 1.0 as worst case)
  if (refChars.length === 0) {
    return hypChars.length > 0 ? 1.0 : 0.0;
  }

  // Use dynamic programming (Levenshtein distance) at character level
  const n = refChars.length;
  const m = hypChars.length;

  // Create DP table: dp[i][j] = minimum edits to transform ref[0..i-1] to hyp[0..j-1]
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= n; i++) {
    dp[i][0] = i; // Deletions needed
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j; // Insertions needed
  }

  // Fill DP table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (refChars[i - 1] === hypChars[j - 1]) {
        // Characters match, no edit needed
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // Take minimum of substitution, deletion, or insertion
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // Substitution
          dp[i - 1][j] + 1, // Deletion
          dp[i][j - 1] + 1 // Insertion
        );
      }
    }
  }

  // Total errors = dp[n][m]
  const totalErrors = dp[n][m];
  const cer = totalErrors / n;

  return Math.min(cer, 1.0); // Cap at 1.0
}

// Maximum characters to compare — avoids allocating a ~225M cell DP table for long audio
const MAX_CER_CHARS = 5000;

/**
 * Normalize text for character-level comparison
 * - Trim whitespace
 * - Convert to lowercase
 * - Remove punctuation
 * - Remove extra spaces (but preserve character sequence)
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFC') // Normalize Unicode (critical for Indic scripts)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // remove punctuation, keep letters/numbers/spaces
    .replace(/\s+/g, ' ');
}

