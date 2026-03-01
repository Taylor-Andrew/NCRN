<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="9">

      <!-- ── Setup section ────────────────────────────────────────────────── -->
      <template v-if="!isReady">
        <v-row dense>

          <!-- Load Phi-3.5 Mini for local detection -->
          <v-col cols="12" md="6">
            <v-card elevation="3" rounded="lg" class="mb-4">
              <v-card-title class="text-subtitle-1 pa-4">
                <v-icon start color="primary">mdi-cpu</v-icon>
                Step 1 — Local Detector
              </v-card-title>
              <v-card-text>
                <p class="text-body-2 text-medium-emphasis mb-3">
                  Phi-3.5 Mini runs entirely in your browser via WebGPU to detect sensitive
                  entities without sending your data anywhere.
                </p>
                <template v-if="llmLoading">
                  <v-progress-linear
                    :model-value="llmLoadPercent"
                    color="primary" rounded height="6" class="mb-2"
                  />
                  <p class="text-caption text-medium-emphasis">{{ llmLoadText }}</p>
                </template>
                <v-chip v-else-if="llmLoaded" color="success" size="small" variant="tonal">
                  <v-icon start>mdi-check</v-icon> Phi-3.5 Mini loaded
                </v-chip>
              </v-card-text>
              <v-card-actions class="px-4 pb-4">
                <v-btn
                  v-if="!llmLoaded"
                  color="primary"
                  variant="elevated"
                  size="small"
                  prepend-icon="mdi-download"
                  :loading="llmLoading"
                  :disabled="llmLoading || !webGpuSupported"
                  @click="loadLlm"
                >
                  {{ webGpuSupported ? 'Load model' : 'WebGPU not available' }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>

          <!-- Configure OpenAI -->
          <v-col cols="12" md="6">
            <v-card elevation="3" rounded="lg" class="mb-4">
              <v-card-title class="text-subtitle-1 pa-4">
                <v-icon start color="primary">mdi-cloud</v-icon>
                Step 2 — External LLM
              </v-card-title>
              <v-card-text>
                <p class="text-body-2 text-medium-emphasis mb-3">
                  Only the redacted prompt is sent here — never the original.
                </p>
                <v-text-field
                  v-model="apiKeyInput"
                  label="OpenAI API Key"
                  variant="outlined"
                  density="compact"
                  prepend-inner-icon="mdi-key"
                  :type="showKey ? 'text' : 'password'"
                  :append-inner-icon="showKey ? 'mdi-eye-off' : 'mdi-eye'"
                  hide-details
                  @click:append-inner="showKey = !showKey"
                  @keyup.enter="configureOpenAI"
                />
                <v-select
                  v-model="openAIModel"
                  :items="OPENAI_MODELS"
                  item-title="label"
                  item-value="id"
                  label="Model"
                  variant="outlined"
                  density="compact"
                  class="mt-3"
                  hide-details
                />
                <v-chip v-if="openAIReady" color="success" size="small" variant="tonal" class="mt-3">
                  <v-icon start>mdi-check</v-icon> Connected
                </v-chip>
              </v-card-text>
              <v-card-actions class="px-4 pb-4">
                <v-btn
                  v-if="!openAIReady"
                  color="primary"
                  variant="elevated"
                  size="small"
                  prepend-icon="mdi-connection"
                  :disabled="!apiKeyInput.trim()"
                  @click="configureOpenAI"
                >
                  Connect
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </template>

      <!-- ── Main interface (once both ready) ──────────────────────────────── -->
      <template v-else>
        <v-card elevation="4" rounded="lg" class="mb-4">
          <v-card-title class="text-h6 pa-5">
            <v-icon start color="primary">mdi-shield-lock</v-icon>
            DLP Pipeline
          </v-card-title>

          <v-card-text class="pt-0">
            <v-textarea
              v-model="userPrompt"
              label="Enter a prompt containing sensitive data"
              variant="outlined"
              rows="4"
              auto-grow
              :disabled="isProcessing"
              placeholder="e.g. Review the contract with Acme Corp for Project Phoenix. DB host: prod-db.internal, key: sk-abc123"
              hide-details
            />
          </v-card-text>

          <v-card-actions class="px-5 pb-5">
            <v-btn
              color="primary"
              variant="elevated"
              prepend-icon="mdi-shield-lock"
              :loading="isProcessing"
              :disabled="!userPrompt.trim() || isProcessing"
              @click="process"
            >
              Process
            </v-btn>
            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-refresh"
              :disabled="isProcessing"
              @click="reset"
            >
              Reset vault
            </v-btn>
            <v-spacer />
            <v-chip size="small" variant="tonal">
              <v-icon start size="x-small">mdi-circle</v-icon>
              {{ stageLabel }}
            </v-chip>
          </v-card-actions>
        </v-card>

        <!-- Pipeline view -->
        <DLPPipelineView
          v-if="hasResult"
          :original-text="originalText"
          :spans="resultSpans"
          :entries="resultEntries"
          :redacted-text="resultRedacted"
          :final-answer="finalAnswer"
          :validation-passed="validationPassed"
          :is-streaming="isStreaming"
        />

        <!-- Error -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mt-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>
      </template>

    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { LLMService } from '@/llm'
import type { LoadProgress } from '@/llm'
import { OpenAIService } from '@/openai'
import { DLPService } from '@/dlp'
import type { DetectedSpan, VaultEntry, PipelineStage } from '@/dlp'
import DLPPipelineView from './DLPPipelineView.vue'

// ── Constants ──────────────────────────────────────────────────────────────

const LOCAL_MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC'

interface ModelOption { id: string; label: string }
const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini',  label: 'GPT-4o mini' },
  { id: 'gpt-4o',       label: 'GPT-4o' },
  { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
]

// ── State ──────────────────────────────────────────────────────────────────

const webGpuSupported = ref(false)

// Step 1 — local model
const llmLoading = ref(false)
const llmLoaded = ref(false)
const llmLoadPercent = ref(0)
const llmLoadText = ref('')
const llmService = new LLMService()

// Step 2 — OpenAI
const apiKeyInput = ref('')
const showKey = ref(false)
const openAIModel = ref(OPENAI_MODELS[0].id)
const openAIReady = ref(false)
const openAIService = new OpenAIService()

const isReady = computed(() => llmLoaded.value && openAIReady.value)

// Pipeline state
const userPrompt = ref('')
const isProcessing = ref(false)
const isStreaming = ref(false)
const hasResult = ref(false)
const errorMessage = ref('')

const originalText = ref('')
const resultSpans = ref<DetectedSpan[]>([])
const resultEntries = ref<VaultEntry[]>([])
const resultRedacted = ref('')
const finalAnswer = ref('')
const validationPassed = ref(true)
const currentStage = ref<PipelineStage['stage']>('idle')

const stageLabel = computed((): string => {
  const labels: Record<PipelineStage['stage'], string> = {
    idle: 'Ready',
    detecting: 'Detecting…',
    detected: 'Entities found',
    redacted: 'Redacted',
    generating: 'Generating…',
    validating: 'Validating…',
    complete: 'Complete',
    error: 'Error',
  }
  return labels[currentStage.value]
})

let dlpService: DLPService | null = null

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => { webGpuSupported.value = 'gpu' in navigator })

onUnmounted(() => { llmService.dispose() })

// ── Methods ────────────────────────────────────────────────────────────────

async function loadLlm(): Promise<void> {
  llmLoading.value = true
  llmLoadPercent.value = 0
  llmLoadText.value = 'Initialising…'
  try {
    await llmService.loadModel(LOCAL_MODEL_ID, (p: LoadProgress) => {
      llmLoadPercent.value = Math.round(p.progress * 100)
      llmLoadText.value = p.text
    })
    llmLoaded.value = true
  } finally {
    llmLoading.value = false
  }
  maybeInitDLP()
}

function configureOpenAI(): void {
  const key = apiKeyInput.value.trim()
  if (!key) return
  openAIService.configure(key)
  openAIReady.value = true
  maybeInitDLP()
}

function maybeInitDLP(): void {
  if (llmLoaded.value && openAIReady.value) {
    dlpService = new DLPService(llmService, openAIService)
  }
}

async function process(): Promise<void> {
  if (dlpService === null || !userPrompt.value.trim()) return

  originalText.value = userPrompt.value
  resultSpans.value = []
  resultEntries.value = []
  resultRedacted.value = ''
  finalAnswer.value = ''
  validationPassed.value = true
  hasResult.value = false
  isProcessing.value = true
  isStreaming.value = false
  errorMessage.value = ''

  try {
    await dlpService.process(
      userPrompt.value,
      openAIModel.value,
      (stage: PipelineStage) => {
        currentStage.value = stage.stage
        if (stage.stage === 'detected') {
          resultSpans.value = stage.spans
          hasResult.value = true
        } else if (stage.stage === 'redacted') {
          resultEntries.value = stage.entries
          resultRedacted.value = stage.redactedText
          isStreaming.value = true
        } else if (stage.stage === 'complete') {
          finalAnswer.value = stage.finalAnswer
          validationPassed.value = stage.validationPassed
          isStreaming.value = false
        } else if (stage.stage === 'error') {
          errorMessage.value = stage.message
          isStreaming.value = false
        }
      },
      (token: string) => { finalAnswer.value += token },
    )
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    currentStage.value = 'error'
    isStreaming.value = false
  } finally {
    isProcessing.value = false
  }
}

function reset(): void {
  dlpService?.resetVault()
  hasResult.value = false
  resultSpans.value = []
  resultEntries.value = []
  resultRedacted.value = ''
  finalAnswer.value = ''
  currentStage.value = 'idle'
  errorMessage.value = ''
}
</script>
