import type { DeduplicationInput } from '../types';

export interface BatchDeduplicationResult {
  unique: DeduplicationInput[];
  duplicates: DeduplicationInput[];
}

/**
 * Removes within-batch duplicates by normalizedDomain.
 * First occurrence wins; subsequent occurrences are duplicates.
 */
export function deduplicateBatch(inputs: DeduplicationInput[]): BatchDeduplicationResult {
  const seen = new Set<string>();
  const unique: DeduplicationInput[] = [];
  const duplicates: DeduplicationInput[] = [];

  for (const item of inputs) {
    if (seen.has(item.normalizedDomain)) {
      duplicates.push(item);
    } else {
      seen.add(item.normalizedDomain);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}
