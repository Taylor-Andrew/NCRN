import { PATTERNS } from './patterns'
import { getPolicy } from './Policy'
import type { Vault } from './Vault'

// Matches any ⟦TYPE:NN⟧ placeholder in the LLM output.
const PLACEHOLDER_RE = /\u27E6([A-Z]+):(\d+)\u27E7/g

// Sensitive entity types whose raw values must never appear in the output.
const ECHO_CHECK_TYPES = new Set(['SECRET', 'CRED', 'CERT', 'FIN', 'PHI'])

/**
 * Validate the raw LLM response and reinject original values per policy.
 *
 * 1. Echo check — if raw sensitive patterns appear outside placeholders,
 *    fail validation and return the response with placeholders intact.
 * 2. Placeholder scan — replace ⟦TYPE:NN⟧ with original values where policy
 *    allows; leave disallowed placeholders as-is.
 */
export function reinject(
  rawResponse: string,
  vault: Vault,
): { finalAnswer: string; validationPassed: boolean } {
  // ── 1. Echo check ─────────────────────────────────────────────────────────
  // Temporarily strip all placeholders before scanning so the original values
  // we already redacted don't trigger a false positive on themselves.
  const stripped = rawResponse.replace(PLACEHOLDER_RE, '')
  for (const { entityType, pattern } of PATTERNS) {
    if (!ECHO_CHECK_TYPES.has(entityType)) continue
    pattern.lastIndex = 0
    if (pattern.test(stripped)) {
      return { finalAnswer: rawResponse, validationPassed: false }
    }
  }

  // ── 2. Placeholder-based reinjection ──────────────────────────────────────
  PLACEHOLDER_RE.lastIndex = 0
  const finalAnswer = rawResponse.replace(PLACEHOLDER_RE, (match) => {
    const entry = vault.lookup(match)
    if (entry === undefined) return match   // unknown placeholder — leave as-is

    const policy = getPolicy(entry.entityType)
    return policy.allowed ? entry.original : match
  })

  return { finalAnswer, validationPassed: true }
}
