/** Progress report emitted while a model is loading into memory. */
export interface LoadProgress {
  /** Human-readable status message from the WebLLM runtime. */
  text: string
  /** Completion ratio in [0, 1]. */
  progress: number
}

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
