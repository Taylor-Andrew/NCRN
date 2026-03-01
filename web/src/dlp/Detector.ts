import type { DetectedSpan, EntityType } from './types'
import { runPatterns } from './patterns'
import type { LLMService } from '@/llm'

// NER entity types Llama 3.2 targets — only those regex can't catch reliably.
// HOST is included here because single-label device names (upc3, Grc1) have no
// dots and are invisible to the DOMAIN regex pattern.
const NER_TYPES: EntityType[] = [
  'ORG', 'PERSON', 'CLIENT', 'PROJECT', 'LOCATION', 'HOST', 'TICKET', 'REPO', 'FIN', 'LEGAL', 'PHI',
]

const NER_SYSTEM_PROMPT = `Extract sensitive entities from IT work order notes. Output ONLY a JSON array. No prose, no markdown.
If nothing found output: []
Each item must have exactly: {"text":"exact characters from input","type":"TYPE"}

TYPES:
PERSON — any human name, first name only counts (Ben, Priya, Dixon, Sahil).
         Key patterns → always extract the NAME:
           "Worked with [NAME] at [ORG]"   "Released by [NAME]"   "Performed by [NAME]"
           "Performed: [NAME]"   "called [NAME]"   "spoke to [NAME]"   "verified by [NAME]"
         Do NOT second-guess — if a word follows one of these patterns, it is PERSON.
ORG — company, team, or ALL-CAPS abbreviation (NOC, TAC, WTS, Acme Corp).
      Key pattern: "[NAME] at [ORG]" or "called [NAME] at [ORG]" — the word after "at" is ORG.
HOST — network device name or short alphanumeric code (rtr1, ap02, Grc1, sw-03, upc3).
       May appear anywhere — standalone, after "patched to", after "port X on", or at start of sentence.
       Return ONLY the device token — never include port/interface notation like "1/0/1" or "Gi0/1".
TICKET — work order or ticket ID (WO-123, INC-501, PROJ-1234).
CLIENT — client site or company name.
PROJECT — internal project name.
LOCATION — physical location (store section, department, floor, named area): "Electronics", "deli section", "Register 70".

RULES:
Include single first names without hesitation. Short ALL-CAPS after "at" are ORG. Short alphanumeric codes are HOST wherever they appear. Output one JSON array only. Copy exact characters.

EXAMPLE 1:
Input: "Worked with Dixon at TAC. Patched cable to rtr1 port 4. Released by Priya. Work Verification Performed: Priya"
Output: [{"text":"Dixon","type":"PERSON"},{"text":"TAC","type":"ORG"},{"text":"rtr1","type":"HOST"},{"text":"Priya","type":"PERSON"}]

EXAMPLE 2:
Input: "Spoke to Ben about INC-501. Rebooted ap02 and gw4. Escalated to NOC."
Output: [{"text":"Ben","type":"PERSON"},{"text":"INC-501","type":"TICKET"},{"text":"ap02","type":"HOST"},{"text":"gw4","type":"HOST"},{"text":"NOC","type":"ORG"}]`

interface NerResult {
  text: string
  type: string
}

function parseNerJson(raw: string): NerResult[] {
  // Strip markdown fences, then extract ALL [...] blocks via bracket counting.
  // Models sometimes split entities across multiple arrays or add prose between
  // them — we collect every valid array and merge the results.
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const results: NerResult[] = []
  let cursor = 0

  while (cursor < cleaned.length) {
    const start = cleaned.indexOf('[', cursor)
    if (start === -1) break

    // Walk forward to find the matching closing bracket
    let depth = 0
    let end = -1
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '[') depth++
      else if (cleaned[i] === ']') {
        if (--depth === 0) { end = i; break }
      }
    }
    if (end === -1) break

    try {
      const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            typeof item === 'object' && item !== null &&
            typeof (item as Record<string, unknown>).text === 'string' &&
            typeof (item as Record<string, unknown>).type === 'string'
          ) {
            results.push(item as NerResult)
          }
        }
      }
    } catch { /* skip malformed block */ }

    cursor = end + 1
  }

  return results
}

function nerResultsToSpans(results: NerResult[], text: string): DetectedSpan[] {
  const spans: DetectedSpan[] = []
  const textLower = text.toLowerCase()

  for (const { text: rawEntityText, type } of results) {
    if (!NER_TYPES.includes(type as EntityType)) continue
    // For HOST entities strip trailing port/interface notation the model includes
    // despite being told not to: "Grc1 1/0/1" → "Grc1", "sw-03 Gi0/1" → "sw-03"
    const entityText = type === 'HOST'
      ? rawEntityText.split(/\s+/)[0]
      : rawEntityText
    const searchLower = entityText.toLowerCase()
    let searchFrom = 0

    while (searchFrom < text.length) {
      // Always search case-insensitively so "wts" and "WTS" both resolve to
      // whichever casing appears first in the original text. The slice below
      // recovers the original characters so the vault stores the real value.
      const idx = textLower.indexOf(searchLower, searchFrom)
      if (idx === -1) break

      const originalText = text.slice(idx, idx + entityText.length)
      let spanEnd = idx + originalText.length

      // For HOST: extend the span to consume any trailing interface notation
      // (e.g. " 1/0/1", " Gi0/1") so it doesn't leak into the redacted text.
      // The vault stores only the device name; the port suffix is silently dropped.
      if (type === 'HOST') {
        const afterDevice = text.slice(spanEnd)
        const ifaceMatch = afterDevice.match(/^\s+[A-Za-z]?\d+(?:\/\d+)+/)
        if (ifaceMatch) spanEnd += ifaceMatch[0].length
      }

      spans.push({
        spanStart: idx,
        spanEnd,
        originalText,
        entityType: type as EntityType,
        confidence: 0.75,
        detector: 'ner',
      })
      searchFrom = spanEnd
    }
  }
  return spans
}

/**
 * Merge two span lists, resolving overlaps deterministically.
 *
 * Rules:
 * - Sort by spanStart ascending
 * - If two spans overlap, keep the one with higher confidence
 * - Tie → prefer regex over ner
 * - Deduplicate by identical (spanStart, spanEnd) pairs
 */
function mergeSpans(a: DetectedSpan[], b: DetectedSpan[]): DetectedSpan[] {
  const all = [...a, ...b].sort((x, y) => {
    if (x.spanStart !== y.spanStart) return x.spanStart - y.spanStart
    // Prefer higher confidence, then longer span (e.g. DOMAIN over ENV keyword)
    if (y.confidence !== x.confidence) return y.confidence - x.confidence
    return (y.spanEnd - y.spanStart) - (x.spanEnd - x.spanStart)
  })

  const merged: DetectedSpan[] = []
  for (const span of all) {
    const last = merged[merged.length - 1]
    if (last === undefined || span.spanStart >= last.spanEnd) {
      merged.push(span)
    } else if (span.confidence > last.confidence) {
      // Incoming span is better — replace last
      merged[merged.length - 1] = span
    }
    // else: skip — last span wins
  }
  return merged
}

/**
 * Run both detection passes and return merged, deduplicated spans.
 *
 * @param text    - The raw user prompt.
 * @param llm     - A loaded LLMService instance for the NER pass.
 */
export async function detect(
  text: string,
  llm: LLMService,
): Promise<DetectedSpan[]> {
  const [regexSpans, nerRaw] = await Promise.all([
    Promise.resolve(runPatterns(text)),
    llm.inferOnce(NER_SYSTEM_PROMPT, text),
  ])

  console.debug('[NER raw]', nerRaw)
  const nerResults = parseNerJson(nerRaw)
  console.debug('[NER parsed]', nerResults)
  const nerSpans = nerResultsToSpans(nerResults, text)

  return mergeSpans(regexSpans, nerSpans)
}
