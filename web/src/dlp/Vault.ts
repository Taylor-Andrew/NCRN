import type { EntityType, VaultEntry, ReinjectionPolicy } from './types'
import { getPolicy } from './Policy'

const encoder = new TextEncoder()

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * In-memory mapping store for a single session.
 *
 * Secrets die when the tab closes — no persistence is intentional.
 * SHA-256 deduplication ensures the same raw value always maps to the same
 * placeholder within a session, preventing information leakage through
 * placeholder count.
 */
export class Vault {
  private byPlaceholder = new Map<string, VaultEntry>()
  private byHash = new Map<string, string>()          // SHA-256 hex → placeholder
  private counters = new Map<EntityType, number>()

  /** Return the existing entry for this value, or create a new one. */
  async getOrCreate(original: string, entityType: EntityType): Promise<VaultEntry> {
    const hash = await sha256Hex(original)

    const existing = this.byHash.get(hash)
    if (existing !== undefined) {
      const entry = this.byPlaceholder.get(existing)
      if (entry !== undefined) return entry
    }

    const count = (this.counters.get(entityType) ?? 0) + 1
    this.counters.set(entityType, count)
    const placeholder = `\u27E6${entityType}:${String(count).padStart(2, '0')}\u27E7`

    const policy: ReinjectionPolicy = getPolicy(entityType)
    const entry: VaultEntry = {
      placeholder,
      original,
      entityType,
      hash,
      reinjectionAllowed: policy.allowed,
    }

    this.byPlaceholder.set(placeholder, entry)
    this.byHash.set(hash, placeholder)
    return entry
  }

  lookup(placeholder: string): VaultEntry | undefined {
    return this.byPlaceholder.get(placeholder)
  }

  allEntries(): VaultEntry[] {
    return Array.from(this.byPlaceholder.values())
  }

  clear(): void {
    this.byPlaceholder.clear()
    this.byHash.clear()
    this.counters.clear()
  }
}
