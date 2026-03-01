<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">

      <!-- Browser does not expose WebGPU -->
      <v-alert
        v-if="!webGpuSupported"
        type="warning"
        icon="mdi-alert"
        variant="tonal"
        class="mb-4"
      >
        <strong>WebGPU not available.</strong>
        Use Chrome 113+, Edge 113+, or enable the flag in your browser.
      </v-alert>

      <v-card v-else elevation="4" rounded="lg">
        <v-card-title class="text-h5 pa-6">In-Browser LLM (WebLLM)</v-card-title>

        <!-- ── Load section ───────────────────────────────────────── -->
        <template v-if="!isLoaded">
          <v-card-text>
            <v-select
              v-model="selectedModel"
              :items="AVAILABLE_MODELS"
              item-title="label"
              item-value="id"
              label="Select model"
              variant="outlined"
              :disabled="isLoading"
            />
            <template v-if="isLoading">
              <v-progress-linear
                :model-value="loadPercent"
                color="primary"
                rounded
                height="6"
                class="mb-2"
              />
              <p class="text-caption text-medium-emphasis">{{ loadText }}</p>
            </template>
          </v-card-text>

          <v-card-actions class="px-6 pb-6">
            <v-btn
              color="primary"
              variant="elevated"
              prepend-icon="mdi-download"
              :loading="isLoading"
              :disabled="isLoading"
              @click="loadModel"
            >
              Load Model
            </v-btn>
          </v-card-actions>
        </template>

        <!-- ── Chat section ──────────────────────────────────────── -->
        <template v-else>
          <v-card-text class="pa-0">
            <div ref="chatScroll" class="chat-history pa-4">

              <div
                v-for="msg in chatHistory"
                :key="msg.id"
                :class="['chat-bubble mb-4', msg.role]"
              >
                <v-chip
                  :color="msg.role === 'user' ? 'primary' : 'secondary'"
                  size="x-small"
                  class="mb-1"
                >
                  {{ msg.role === 'user' ? 'You' : 'AI' }}
                </v-chip>
                <p class="text-body-2 mb-0 msg-text">{{ msg.content }}</p>
              </div>

              <!-- Streaming reply in progress -->
              <div v-if="streamingContent" class="chat-bubble assistant mb-4">
                <v-chip color="secondary" size="x-small" class="mb-1">AI</v-chip>
                <p class="text-body-2 mb-0 msg-text">
                  {{ streamingContent }}<span class="blink">▌</span>
                </p>
              </div>

            </div>
          </v-card-text>

          <v-divider />

          <v-card-text class="py-3">
            <v-text-field
              v-model="userInput"
              label="Message"
              variant="outlined"
              hide-details
              :disabled="isGenerating"
              @keyup.enter="sendMessage"
            >
              <template #append-inner>
                <v-btn
                  icon="mdi-send"
                  variant="text"
                  color="primary"
                  size="small"
                  :loading="isGenerating"
                  @click="sendMessage"
                />
              </template>
            </v-text-field>
          </v-card-text>

          <v-card-actions class="px-6 pb-4">
            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-refresh"
              @click="resetChat"
            >
              New chat
            </v-btn>
            <v-spacer />
            <v-chip size="small" color="success" variant="tonal">
              {{ selectedModel }}
            </v-chip>
          </v-card-actions>
        </template>

      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { LLMService } from '@/llm'
import type { LoadProgress } from '@/llm'

// ── Types ──────────────────────────────────────────────────────────────────

interface DisplayMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

interface ModelOption {
  id: string
  label: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'SmolLM2-135M-Instruct-q0f16-MLC',      label: 'SmolLM2 135M  — fastest load, best for testing' },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',    label: 'SmolLM2 360M  — small, capable' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',    label: 'Llama 3.2 1B  — balanced (~900 MB VRAM)' },
  { id: 'Qwen3-0.6B-q4f16_1-MLC',               label: 'Qwen3 0.6B   — thinking-capable (~1.4 GB VRAM)' },
]

const SYSTEM_PROMPT =
  'You are a helpful AI assistant running locally in the browser via WebGPU. Be concise.'

// ── State ──────────────────────────────────────────────────────────────────

const webGpuSupported = ref(false)
const selectedModel = ref(AVAILABLE_MODELS[0].id)

const isLoading = ref(false)
const isLoaded = ref(false)
const loadPercent = ref(0)
const loadText = ref('')

const isGenerating = ref(false)
const userInput = ref('')
const chatHistory = ref<DisplayMessage[]>([])
const streamingContent = ref('')
const chatScroll = ref<HTMLElement | null>(null)

let messageIdCounter = 0
const service = new LLMService()

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  webGpuSupported.value = 'gpu' in navigator
})

// ── Methods ────────────────────────────────────────────────────────────────

async function loadModel(): Promise<void> {
  isLoading.value = true
  loadPercent.value = 0
  loadText.value = 'Initialising…'
  try {
    await service.loadModel(selectedModel.value, onLoadProgress)
    isLoaded.value = true
  } finally {
    isLoading.value = false
  }
}

function onLoadProgress(p: LoadProgress): void {
  loadPercent.value = Math.round(p.progress * 100)
  loadText.value = p.text
}

async function sendMessage(): Promise<void> {
  const text = userInput.value.trim()
  if (!text || isGenerating.value) return

  userInput.value = ''
  chatHistory.value.push({ id: ++messageIdCounter, role: 'user', content: text })
  isGenerating.value = true
  streamingContent.value = ''
  await scrollToBottom()

  try {
    await service.sendMessage(text, SYSTEM_PROMPT, onToken)
    chatHistory.value.push({
      id: ++messageIdCounter,
      role: 'assistant',
      content: streamingContent.value,
    })
  } finally {
    streamingContent.value = ''
    isGenerating.value = false
    await scrollToBottom()
  }
}

function onToken(token: string): void {
  streamingContent.value += token
  void scrollToBottom()
}

function resetChat(): void {
  service.reset()
  chatHistory.value = []
  streamingContent.value = ''
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  if (chatScroll.value !== null) {
    chatScroll.value.scrollTop = chatScroll.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-history {
  max-height: 420px;
  overflow-y: auto;
}

.msg-text {
  white-space: pre-wrap;
  line-height: 1.6;
}

.blink {
  animation: blink-cursor 1s step-end infinite;
}

@keyframes blink-cursor {
  50% { opacity: 0; }
}
</style>
