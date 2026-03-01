import { CreateMLCEngine } from '@mlc-ai/web-llm'
import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm'
import type { ChatMessage, LoadProgress } from './types'

/**
 * Manages the WebLLM engine lifecycle and streaming chat completions.
 *
 * Usage:
 * 1. `await service.loadModel(id, onProgress)` — download + initialise
 * 2. `await service.sendMessage(text, system, onToken)` — stream a reply
 * 3. `service.reset()` — clear history without reloading
 */
export class LLMService {
  private engine: MLCEngineInterface | null = null
  private readonly history: ChatMessage[] = []

  /** True once loadModel() has resolved successfully. */
  get isLoaded(): boolean {
    return this.engine !== null
  }

  /** Download and initialise a prebuilt model. Calls onProgress until done. */
  async loadModel(
    modelId: string,
    onProgress: (p: LoadProgress) => void,
  ): Promise<void> {
    this.engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report: InitProgressReport) => {
        onProgress({ text: report.text, progress: report.progress })
      },
    })
    this.history.length = 0
  }

  /**
   * Send a user message and stream the reply token-by-token.
   * Returns the complete assistant reply once streaming finishes.
   *
   * @throws {Error} if loadModel() has not been called first.
   */
  async sendMessage(
    userText: string,
    systemPrompt: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    if (this.engine === null) {
      throw new Error('Model not loaded — call loadModel() first')
    }

    this.history.push({ role: 'user', content: userText })

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...this.history,
    ]

    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
    })

    let fullReply = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta.content ?? ''
      fullReply += token
      onToken(token)
    }

    this.history.push({ role: 'assistant', content: fullReply })
    return fullReply
  }

  /**
   * One-shot inference that does NOT touch conversation history.
   * Used by the DLP detector for structured NER calls.
   *
   * Resets the KV cache after every call so GPU memory is freed immediately
   * rather than accumulating across multiple NER invocations.
   *
   * @param temperature - Default 0 for deterministic structured output.
   */
  async inferOnce(
    systemPrompt: string,
    userText: string,
    temperature = 0,
  ): Promise<string> {
    if (this.engine === null) {
      throw new Error('Model not loaded — call loadModel() first')
    }
    try {
      const result = await this.engine.chat.completions.create({
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userText },
        ],
        stream: false,
        temperature,
      })
      return result.choices[0]?.message.content ?? ''
    } finally {
      // Always free the KV cache regardless of success or failure.
      // The conversation history lives in this.history (not the engine),
      // so resetChat() does not affect ongoing chat sessions.
      await this.engine?.resetChat()
    }
  }

  /** Clear conversation history without reloading the model. */
  reset(): void {
    this.history.length = 0
  }

  /**
   * Unload model weights from GPU/CPU memory.
   * Call when the component using this service is unmounted.
   */
  async dispose(): Promise<void> {
    if (this.engine !== null) {
      await this.engine.unload()
      this.engine = null
      this.history.length = 0
    }
  }
}
