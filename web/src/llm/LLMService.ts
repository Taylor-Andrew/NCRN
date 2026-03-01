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

  /** Clear conversation history without reloading the model. */
  reset(): void {
    this.history.length = 0
  }
}
