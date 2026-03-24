/**
 * CSV Reader Utility
 * Reads test data from CSV files and parses them into structured objects
 */

import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';

export interface TestDataRow {
  audio_path: string;
  lang: string;
  lang_code: string;
  text: string;
  duration: string;
}

/**
 * Read and parse CSV file containing test data
 * @param csvFilePath - Path to the CSV file
 * @returns Promise resolving to array of test data rows
 */
export async function readCsvFile(csvFilePath: string): Promise<TestDataRow[]> {
  return new Promise((resolve, reject) => {
    const results: TestDataRow[] = [];
    const absolutePath = path.isAbsolute(csvFilePath)
      ? csvFilePath
      : path.resolve(process.cwd(), csvFilePath);

    if (!fs.existsSync(absolutePath)) {
      reject(new Error(`CSV file not found: ${absolutePath}`));
      return;
    }

    fs.createReadStream(absolutePath)
      .pipe(csv())
      .on('data', (data: TestDataRow) => {
        // Validate required fields
        if (data.audio_path && data.lang && data.lang_code && data.text) {
          results.push(data);
        } else {
          console.warn('Skipping invalid row:', data);
        }
      })
      .on('end', () => {
        console.log(`Successfully parsed ${results.length} rows from CSV`);
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Get absolute path for audio file
 * @param audioPath - Relative path from CSV
 * @param csvFilePath - Path to the CSV file (for resolving relative paths)
 * @returns Absolute path to the audio file
 */
export function getAudioFilePath(audioPath: string, csvFilePath: string): string {
  const csvDir = path.dirname(
    path.isAbsolute(csvFilePath)
      ? csvFilePath
      : path.resolve(process.cwd(), csvFilePath)
  );
  
  // If audioPath starts with directory name, remove it since CSV is already in that directory
  let normalizedAudioPath = audioPath;
  if (audioPath.startsWith('indicvoices_data/')) {
    normalizedAudioPath = audioPath.replace(/^indicvoices_data\//, '');
  } else if (audioPath.startsWith('CodeSwitchvoices_data/')) {
    normalizedAudioPath = audioPath.replace(/^CodeSwitchvoices_data\//, '');
  }
  
  return path.resolve(csvDir, normalizedAudioPath);
}

