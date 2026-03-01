import type { LLMService } from '@/llm'
import type { OpenAIService } from '@/openai'
import type { PipelineStage, VaultEntry } from './types'
import { detect } from './Detector'
import { Vault } from './Vault'
import { redact } from './Redactor'
import { reinject } from './Reinjector'

const OPENAI_SYSTEM_PROMPT =
  'You are a helpful AI assistant. Be concise and clear in your responses.'

function buildRedactedPrompt(redactedText: string, entries: VaultEntry[]): string {
  if (entries.length === 0) return redactedText

  const schema = entries
    .map((e) => `  ${e.placeholder} = ${e.entityType.toLowerCase()} (redacted)`)
    .join('\n')

  return (
    '[PLACEHOLDER SCHEMA]\n' +
    schema +
    '\n\n[INSTRUCTION] Keep all ⟦...⟧ placeholders exactly as written in your response. ' +
    'Do not attempt to guess or reveal their original values.\n\n' +
    '[USER PROMPT]\n' +
    redactedText
  )
}

/**
 * Orchestrates the full DLP pipeline:
 * detect → redact → send to OpenAI → validate → reinject.
 *
 * The caller supplies already-initialised LLMService and OpenAIService
 * instances; DLPService does not own them.
 */
export class DLPService {
  private readonly vault = new Vault()

  constructor(
    private readonly llm: LLMService,
    private readonly openai: OpenAIService,
  ) {}

  async process(
    userText: string,
    openAIModel: string,
    onStage: (s: PipelineStage) => void,
    onToken: (t: string) => void,
  ): Promise<void> {
    // ── 1. Detection ─────────────────────────────────────────────────────────
    onStage({ stage: 'detecting' })
    const spans = await detect(userText, this.llm)
    onStage({ stage: 'detected', spans })

    // ── 2. Redaction ─────────────────────────────────────────────────────────
    const { redactedText, entries } = await redact(userText, spans, this.vault)
    onStage({ stage: 'redacted', redactedText, entries })

    // ── 3. Send to OpenAI ────────────────────────────────────────────────────
    onStage({ stage: 'generating' })
    let rawResponse = ''
    const prompt = buildRedactedPrompt(redactedText, entries)
    await this.openai.sendMessage(prompt, openAIModel, OPENAI_SYSTEM_PROMPT, (token) => {
      rawResponse += token
      onToken(token)
    })

    // ── 4. Validate + reinject ────────────────────────────────────────────────
    onStage({ stage: 'validating' })
    const { finalAnswer, validationPassed } = reinject(rawResponse, this.vault)
    onStage({ stage: 'complete', rawResponse, finalAnswer, validationPassed })
  }

  resetVault(): void {
    this.vault.clear()
  }
}
