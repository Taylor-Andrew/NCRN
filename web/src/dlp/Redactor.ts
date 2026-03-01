import type { DetectedSpan, VaultEntry } from './types'
import type { Vault } from './Vault'

/**
 * Replace every detected span in `text` with its ⟦TYPE:NN⟧ placeholder.
 *
 * Spans are processed in descending start-position order so that replacing
 * earlier characters does not shift the indices of later spans.
 */
export async function redact(
  text: string,
  spans: DetectedSpan[],
  vault: Vault,
): Promise<{ redactedText: string; entries: VaultEntry[] }> {
  if (spans.length === 0) {
    return { redactedText: text, entries: [] }
  }

  const sorted = [...spans].sort((a, b) => b.spanStart - a.spanStart)
  const usedEntries: VaultEntry[] = []
  let result = text

  for (const span of sorted) {
    const entry = await vault.getOrCreate(span.originalText, span.entityType)
    if (!usedEntries.some((e) => e.placeholder === entry.placeholder)) {
      usedEntries.push(entry)
    }
    result =
      result.slice(0, span.spanStart) +
      entry.placeholder +
      result.slice(span.spanEnd)
  }

  // Return entries ordered by first appearance (ascending placeholder id)
  usedEntries.sort((a, b) => a.placeholder.localeCompare(b.placeholder))

  return { redactedText: result, entries: usedEntries }
}
