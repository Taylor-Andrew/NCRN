<template>
  <v-row dense>
    <!-- Original prompt -->
    <v-col cols="12">
      <v-card variant="outlined" class="mb-3">
        <v-card-subtitle class="pt-3 pb-1 text-caption text-uppercase font-weight-bold">
          Original prompt
        </v-card-subtitle>
        <v-card-text class="pt-1">
          <p class="text-body-2 mono text-medium-emphasis">{{ originalText }}</p>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Detected entities -->
    <v-col cols="12">
      <v-card variant="outlined" class="mb-3">
        <v-card-subtitle class="pt-3 pb-1 text-caption text-uppercase font-weight-bold">
          Detected entities
          <v-chip size="x-small" class="ml-2">{{ spans.length }}</v-chip>
        </v-card-subtitle>
        <v-card-text class="pt-1">
          <span v-if="spans.length === 0" class="text-body-2 text-medium-emphasis">
            None detected
          </span>
          <v-chip
            v-for="(span, i) in spans"
            :key="i"
            :color="typeColor(span.entityType)"
            size="small"
            variant="tonal"
            class="mr-1 mb-1"
          >
            <strong>{{ span.entityType }}</strong>
            <span class="ml-1 text-caption">{{ span.originalText }}</span>
            <v-tooltip activator="parent">
              {{ span.detector }} · {{ Math.round(span.confidence * 100) }}%
            </v-tooltip>
          </v-chip>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Redacted prompt -->
    <v-col cols="12">
      <v-card variant="outlined" class="mb-3">
        <v-card-subtitle class="pt-3 pb-1 text-caption text-uppercase font-weight-bold">
          Redacted prompt <span class="text-caption font-weight-regular">(sent to OpenAI)</span>
        </v-card-subtitle>
        <v-card-text class="pt-1">
          <pre class="text-body-2 mono redacted-text">{{ redactedText }}</pre>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Final answer -->
    <v-col cols="12">
      <v-card variant="outlined">
        <v-card-subtitle class="pt-3 pb-1 text-caption text-uppercase font-weight-bold">
          Final answer
          <v-chip
            v-if="!validationPassed"
            color="error"
            size="x-small"
            class="ml-2"
          >
            Validation failed — placeholders preserved
          </v-chip>
        </v-card-subtitle>
        <v-card-text class="pt-1">
          <p class="text-body-2 mono" style="white-space: pre-wrap; line-height: 1.6;">
            {{ finalAnswer }}<span v-if="isStreaming" class="blink">▌</span>
          </p>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import type { DetectedSpan, VaultEntry } from '@/dlp'

const props = defineProps<{
  originalText: string
  spans: DetectedSpan[]
  entries: VaultEntry[]
  redactedText: string
  finalAnswer: string
  validationPassed: boolean
  isStreaming: boolean
}>()

// Colour-code entity types for quick visual scanning
const TYPE_COLORS: Record<string, string> = {
  SECRET: 'error',  CRED: 'error',   CERT: 'error',
  FIN:    'error',  PHI:  'error',   LEGAL: 'error',
  IP:     'warning', HOST: 'warning', DOMAIN: 'warning',
  URL:    'warning', ENV: 'warning',  CONFIG: 'warning',
  ORG:    'primary', PERSON: 'primary', CLIENT: 'primary',
  PROJECT: 'primary', TICKET: 'success', REPO: 'success',
  LOCATION: 'info',
}

function typeColor(entityType: string): string {
  return TYPE_COLORS[entityType] ?? 'default'
}

// Suppress "props is declared but not read" — all props consumed in template
void props
</script>

<style scoped>
.mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.8rem;
}

.redacted-text {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
}

.blink {
  animation: blink-cursor 1s step-end infinite;
}

@keyframes blink-cursor {
  50% { opacity: 0; }
}
</style>
