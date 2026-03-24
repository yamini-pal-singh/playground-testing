/**
 * Shared utilities for audio file handling and API response parsing.
 * Eliminates duplicated code across all service clients.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AudioFileData {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Validates, reads, and detects MIME type of an audio file.
 * Replaces the repeated 9-line validation+read+MIME block in every service client.
 */
export function readAudioFile(filePath: string): AudioFileData {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Audio path is not a file: ${resolvedPath}`);
  }
  const buffer = fs.readFileSync(resolvedPath);
  const fileName = path.basename(resolvedPath);
  const ext = path.extname(fileName).toLowerCase();
  let mimeType = 'audio/wav';
  if (ext === '.mp4' || ext === '.m4a') {
    mimeType = 'audio/mp4';
  } else if (ext === '.mp3' || ext === '.mpeg') {
    mimeType = 'audio/mpeg';
  }
  return { buffer, fileName, mimeType };
}

/**
 * Parses an API response body, handling JSON and non-JSON responses.
 * Replaces the repeated 15-20 line content-type check block in every service client.
 */
export async function parseApiResponse<T>(response: any): Promise<T> {
  const contentType = response.headers()['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as T;
    } catch {
      try {
        return { error: await response.text() } as T;
      } catch {
        return { error: 'Failed to parse response' } as T;
      }
    }
  }
  try {
    return { error: await response.text() } as T;
  } catch {
    return { error: 'Unknown error response format' } as T;
  }
}

/**
 * Returns today's date as YYYY-MM-DD in local time.
 * Replaces the repeated 5-line date formatting block in every test file.
 */
export function getLocalDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
