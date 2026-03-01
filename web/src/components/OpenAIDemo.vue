<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <v-card elevation="4" rounded="lg">
        <v-card-title class="text-h5 pa-6">OpenAI API Demo</v-card-title>

        <!-- ── API Key section ──────────────────────────────────────── -->
        <template v-if="!isConfigured">
          <v-card-text>
            <v-text-field
              v-model="apiKeyInput"
              label="OpenAI API Key"
              variant="outlined"
              prepend-inner-icon="mdi-key"
              :type="showKey ? 'text' : 'password'"
              :append-inner-icon="showKey ? 'mdi-eye-off' : 'mdi-eye'"
              hint="Your key is never sent anywhere except api.openai.com"
              persistent-hint
              @click:append-inner="showKey = !showKey"
              @keyup.enter="configure"
            />

            <v-select
              v-model="selectedModel"
              :items="AVAILABLE_MODELS"
              item-title="label"
              item-value="id"
              label="Model"
              variant="outlined"
              class="mt-4"
            />
          </v-card-text>

          <v-card-actions class="px-6 pb-6">
            <v-btn
              color="primary"
              variant="elevated"
              prepend-icon="mdi-connection"
              :disabled="!apiKeyInput.trim()"
              @click="configure"
            >
              Connect
            </v-btn>
          </v-card-actions>
        </template>

        <!-- ── Chat section ──────────────────────────────────────────── -->
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

              <!-- Error display -->
              <v-alert
                v-if="errorMessage"
                type="error"
                variant="tonal"
                class="mb-4"
                closable
                @click:close="errorMessage = ''"
              >
                {{ errorMessage }}
              </v-alert>

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
            <v-btn
              variant="text"
              size="small"
              prepend-icon="mdi-key-remove"
              @click="disconnect"
            >
              Change key
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
import { ref, nextTick } from 'vue'
import { OpenAIService } from '@/openai'

// ── Constants ──────────────────────────────────────────────────────────────

interface ModelOption {
  id: string
  label: string
}

const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini',   label: 'GPT-4o mini  — fast, cheap, great for most tasks' },
  { id: 'gpt-4o',        label: 'GPT-4o       — most capable, multimodal' },
  { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo  — high performance, large context' },
  { id: 'o4-mini',       label: 'o4-mini      — reasoning model' },
]

const SYSTEM_PROMPT =
  'You are a helpful AI assistant. Be concise and clear in your responses.'

// ── State ──────────────────────────────────────────────────────────────────

const apiKeyInput = ref('')
const showKey = ref(false)
const selectedModel = ref(AVAILABLE_MODELS[0].id)
const isConfigured = ref(false)
const isGenerating = ref(false)
const userInput = ref('')
const streamingContent = ref('')
const errorMessage = ref('')
const chatScroll = ref<HTMLElement | null>(null)

interface DisplayMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

const chatHistory = ref<DisplayMessage[]>([])
let messageIdCounter = 0

const service = new OpenAIService()

// ── Methods ────────────────────────────────────────────────────────────────

function configure(): void {
  const key = apiKeyInput.value.trim()
  if (!key) return
  service.configure(key)
  isConfigured.value = true
}

function disconnect(): void {
  service.reset()
  isConfigured.value = false
  apiKeyInput.value = ''
  chatHistory.value = []
  streamingContent.value = ''
  errorMessage.value = ''
}

function resetChat(): void {
  service.reset()
  chatHistory.value = []
  streamingContent.value = ''
  errorMessage.value = ''
}

async function sendMessage(): Promise<void> {
  const text = userInput.value.trim()
  if (!text || isGenerating.value) return

  userInput.value = ''
  errorMessage.value = ''
  chatHistory.value.push({ id: ++messageIdCounter, role: 'user', content: text })
  isGenerating.value = true
  streamingContent.value = ''
  await scrollToBottom()

  try {
    await service.sendMessage(text, selectedModel.value, SYSTEM_PROMPT, onToken)
    chatHistory.value.push({
      id: ++messageIdCounter,
      role: 'assistant',
      content: streamingContent.value,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errorMessage.value = msg
    // Remove the user message that triggered the error so the count stays clean
    chatHistory.value.pop()
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
