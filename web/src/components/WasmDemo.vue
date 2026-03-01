<template>
  <v-row justify="center">
    <v-col cols="12" md="8" lg="6">
      <v-card elevation="4" rounded="lg">
        <v-card-title class="text-h5 pa-6">Rust + WASM Demo</v-card-title>

        <v-card-text>
          <v-text-field
            v-model="name"
            label="Your name"
            variant="outlined"
            prepend-inner-icon="mdi-account"
            clearable
            @keyup.enter="callWasm"
          />
        </v-card-text>

        <v-card-actions class="px-6 pb-6">
          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-rocket-launch"
            :loading="loading"
            @click="callWasm"
          >
            Call WASM
          </v-btn>
        </v-card-actions>

        <v-expand-transition>
          <v-card-text v-if="result" class="pt-0">
            <v-alert type="success" variant="tonal" icon="mdi-check-circle">
              {{ result }}
            </v-alert>
          </v-card-text>
        </v-expand-transition>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { greet, preload } from '@/wasm'

const name = ref('')
const result = ref('')
const loading = ref(false)

onMounted(async () => {
  await preload()
})

async function callWasm(): Promise<void> {
  loading.value = true
  try {
    await new Promise<void>((r) => setTimeout(r, 150))
    result.value = await greet(name.value || 'World')
  } finally {
    loading.value = false
  }
}
</script>
