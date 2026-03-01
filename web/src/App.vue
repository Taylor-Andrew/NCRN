<template>
  <v-app :theme="theme">
    <v-app-bar color="primary" elevation="2">
      <v-app-bar-title>NCRN</v-app-bar-title>

      <template #append>
        <v-btn :icon="themeIcon" @click="toggleTheme" />
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <v-tabs v-model="activeTab" color="primary" class="mb-6">
          <v-tab value="wasm">
            <v-icon start>mdi-language-rust</v-icon>
            WASM Demo
          </v-tab>
          <v-tab value="llm">
            <v-icon start>mdi-robot</v-icon>
            WebLLM Demo
          </v-tab>
          <v-tab value="openai">
            <v-icon start>mdi-cloud</v-icon>
            OpenAI Demo
          </v-tab>
          <v-tab value="dlp">
            <v-icon start>mdi-shield-lock</v-icon>
            DLP Demo
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <v-window-item value="wasm">
            <WasmDemo />
          </v-window-item>
          <v-window-item value="llm">
            <LLMDemo />
          </v-window-item>
          <v-window-item value="openai">
            <OpenAIDemo />
          </v-window-item>
          <v-window-item value="dlp">
            <DLPDemo v-if="activeTab === 'dlp'" />
          </v-window-item>
        </v-window>
      </v-container>
    </v-main>

    <v-footer app color="surface-variant">
      <span class="text-caption">
        Built with Rust · WASM · Vue 3 · Vuetify 3 · WebLLM · OpenAI · DLP
      </span>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WasmDemo from '@/components/WasmDemo.vue'
import LLMDemo from '@/components/LLMDemo.vue'
import OpenAIDemo from '@/components/OpenAIDemo.vue'
import DLPDemo from '@/components/DLPDemo.vue'

const theme = ref<'light' | 'dark'>('light')
const activeTab = ref('wasm')

const themeIcon = computed(() =>
  theme.value === 'light' ? 'mdi-weather-night' : 'mdi-weather-sunny'
)

function toggleTheme(): void {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}
</script>
