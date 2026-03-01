// Typed wrapper around the WASM `core` module.
// Consumers import from @/wasm — never directly from 'core'.
//
// Lazy initialization ensures the initial page render is not blocked.
// Call preload() on mount to warm the module before the first user action.

type CoreModule = typeof import('core')

let module: CoreModule | null = null

async function getModule(): Promise<CoreModule> {
  if (module === null) {
    module = await import('core')
  }
  return module
}

/** Prime the WASM module in the background. Call once on app mount. */
export async function preload(): Promise<void> {
  await getModule()
}

/** Returns a greeting string produced by Rust/WASM. */
export async function greet(name: string): Promise<string> {
  const m = await getModule()
  return m.greet(name)
}
