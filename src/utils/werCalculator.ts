/**
 * Word Error Rate (WER) Calculator
 * WER measures the accuracy of speech recognition by comparing the number of word errors
 * between the reference (expected) and hypothesis (predicted) transcriptions.
 * 
 * Formula: WER = (S + D + I) / N
 * Where:
 * - S = Substitutions (words that were replaced)
 * - D = Deletions (words that were missed)
 * - I = Insertions (words that were added)
 * - N = Total number of words in reference
 */

/**
 * Calculate Word Error Rate between reference and hypothesis text
 * @param reference - Expected/ground truth text
 * @param hypothesis - Predicted/ASR output text
 * @returns WER value between 0 and 1 (0 = perfect match, 1 = completely different)
 */
export function calculateWER(reference: string, hypothesis: string): number {
  // Normalize texts: convert to lowercase and split into words
  const refWords = normalizeText(reference).split(/\s+/).filter((w) => w.length > 0);
  const hypWords = normalizeText(hypothesis).split(/\s+/).filter((w) => w.length > 0);

  // If reference is empty, WER is undefined (return 1.0 as worst case)
  if (refWords.length === 0) {
    return hypWords.length > 0 ? 1.0 : 0.0;
  }

  // Use dynamic programming (Levenshtein distance) to find minimum edit distance
  const n = refWords.length;
  const m = hypWords.length;

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
      if (refWords[i - 1] === hypWords[j - 1]) {
        // Words match, no edit needed
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
  const wer = totalErrors / n;

  return Math.min(wer, 1.0); // Cap at 1.0
}

/**
 * Normalize text for comparison
 * - Trim whitespace
 * - Convert to lowercase
 * - Remove punctuation
 * - Remove extra spaces
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFC') // Normalize Unicode (critical for Indic scripts)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // remove punctuation, keep letters/numbers/spaces
    .replace(/\s+/g, ' ');
}

