import OpenAI from 'openai'
import type { ChatMessage } from './types'

export class OpenAIService {
  private client: OpenAI | null = null
  private history: ChatMessage[] = []

  configure(apiKey: string): void {
    this.client = new OpenAI({
      apiKey,
      // Required for browser usage — the key is entered by the user and
      // never leaves their browser session.
      dangerouslyAllowBrowser: true,
    })
    this.history = []
  }

  get isConfigured(): boolean {
    return this.client !== null
  }

  async sendMessage(
    text: string,
    model: string,
    systemPrompt: string,
    onToken: (token: string) => void,
  ): Promise<void> {
    if (this.client === null) throw new Error('Call configure() before sendMessage()')

    this.history.push({ role: 'user', content: text })

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.history,
    ]

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      stream: true,
    })

    let reply = ''
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        reply += delta
        onToken(delta)
      }
    }

    this.history.push({ role: 'assistant', content: reply })
  }

  reset(): void {
    this.history = []
  }
}
