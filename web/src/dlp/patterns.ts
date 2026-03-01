import type { EntityType, DetectedSpan, DetectorKind } from './types'

interface RegexPattern {
  entityType: EntityType
  pattern: RegExp
  confidence: number
}

// All patterns are non-overlapping by design. Ordered from most specific to
// least specific so that more precise matches win during span merge.
const PATTERNS: RegexPattern[] = [
  // ── Secrets ──────────────────────────────────────────────────────────────
  // PEM blocks
  { entityType: 'SECRET', confidence: 1.0,
    pattern: /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g },
  // JWTs: three base64url segments separated by dots
  { entityType: 'SECRET', confidence: 0.98,
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  // Common API key prefixes (sk-, pk-, rk-, ak-, ghp_, ghs_, glpat-, xox)
  // Min length 6 to catch short demo/test keys as well as real production keys
  { entityType: 'SECRET', confidence: 0.95,
    pattern: /\b(?:sk|pk|rk|ak)-[A-Za-z0-9]{6,}/g },
  { entityType: 'SECRET', confidence: 0.95,
    pattern: /\bgh[psor]_[A-Za-z0-9]{36,}\b/g },
  { entityType: 'SECRET', confidence: 0.95,
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { entityType: 'SECRET', confidence: 0.95,
    pattern: /\bxox[bpoars]-[A-Za-z0-9-]{10,}\b/g },
  // Generic 32–64 char hex/base64 that follows a key-like label
  { entityType: 'SECRET', confidence: 0.85,
    pattern: /(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer)\s*[=:]\s*["']?([A-Za-z0-9+/=_-]{32,})/gi },

  // ── Credentials ──────────────────────────────────────────────────────────
  { entityType: 'CRED', confidence: 0.9,
    pattern: /(?:password|passwd|pwd|secret|api[_-]?key)\s*[=:]\s*["']?([^\s"']{6,})/gi },
  { entityType: 'CRED', confidence: 0.95,
    pattern: /Authorization:\s*Bearer\s+[^\s]+/gi },

  // ── URLs (before DOMAIN so URL is preferred over bare domain) ─────────────
  { entityType: 'URL', confidence: 1.0,
    pattern: /https?:\/\/[^\s"'<>)\]]+/g },

  // ── IP addresses ─────────────────────────────────────────────────────────
  { entityType: 'IP', confidence: 1.0,
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },

  // ── Hostnames / domains (bare, not inside a URL) ─────────────────────────
  // {1,} (one or more dot segments) catches single-dot internal names like
  // prod-db.internal, app.corp, etc. URL spans (confidence 1.0) beat these
  // in the merger when they overlap with a full https://... match.
  { entityType: 'DOMAIN', confidence: 0.8,
    pattern: /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,}\b/g },

  // ── Organisation abbreviations after "at" ────────────────────────────────
  // "Worked with [NAME] at ORG" is the dominant pattern in field service notes.
  // Capturing only the ALL-CAPS token (2-6 letters) after "at" is structurally
  // reliable — it will not match times ("at 5pm"), hostnames, or prose words.
  { entityType: 'ORG', confidence: 0.85,
    pattern: /\bat\s+([A-Z]{2,6})\b/g },

  // ── Ticket references ────────────────────────────────────────────────────
  // NOTE: The Jira-style WORD-NUMBER pattern (e.g. PROJ-123) is intentionally
  // NOT matched here. That format is identical to device/switch naming conventions
  // (IDF-1, PICS-1, SW-2) so regex cannot disambiguate the two. TICKET detection
  // is delegated to the NER pass, which uses surrounding context to decide.
  { entityType: 'TICKET', confidence: 0.8,
    pattern: /#\d{1,6}\b/g },                   // GitHub issue: #42 — unambiguous

  // ── Environment names in context ─────────────────────────────────────────
  // Negative lookahead [-.a-z0-9] prevents matching "prod" when it is part of
  // a hostname like "prod-db.internal" (those are caught by DOMAIN above).
  { entityType: 'ENV', confidence: 0.8,
    pattern: /\b(?:prod(?:uction)?|staging|preprod|pre-prod|sandbox|uat)(?![-.a-z0-9])/gi },
]

/**
 * Run all regex patterns against `text` and return detected spans.
 * Patterns use the /g flag so all occurrences within a string are found.
 */
export function runPatterns(text: string): DetectedSpan[] {
  const spans: DetectedSpan[] = []
  const detector: DetectorKind = 'regex'

  for (const { entityType, pattern, confidence } of PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      // For capture-group patterns (creds), prefer the captured group text if present.
      const matchedText = match[1] ?? match[0]
      const offset = match[1] !== undefined ? match.index + match[0].indexOf(match[1]) : match.index
      spans.push({
        spanStart: offset,
        spanEnd: offset + matchedText.length,
        originalText: matchedText,
        entityType,
        confidence,
        detector,
      })
    }
  }

  return spans
}

/** Export patterns for echo-check use in Reinjector (SECRET + CRED only). */
export { PATTERNS }
