import type { EntityType, ReinjectionPolicy } from './types'

const POLICIES: Record<EntityType, ReinjectionPolicy> = {
  // ── Never reinject — too sensitive to surface in any output ───────────────
  SECRET:   { entityType: 'SECRET',   allowed: false, redactionMode: 'irreversible' },
  CRED:     { entityType: 'CRED',     allowed: false, redactionMode: 'irreversible' },
  CERT:     { entityType: 'CERT',     allowed: false, redactionMode: 'irreversible' },
  FIN:      { entityType: 'FIN',      allowed: false, redactionMode: 'irreversible' },
  LEGAL:    { entityType: 'LEGAL',    allowed: false, redactionMode: 'irreversible' },
  PHI:      { entityType: 'PHI',      allowed: false, redactionMode: 'irreversible' },
  // Infrastructure: keep as placeholders in final output
  IP:       { entityType: 'IP',       allowed: false, redactionMode: 'placeholder' },
  HOST:     { entityType: 'HOST',     allowed: false, redactionMode: 'placeholder' },
  DOMAIN:   { entityType: 'DOMAIN',   allowed: false, redactionMode: 'placeholder' },
  URL:      { entityType: 'URL',      allowed: false, redactionMode: 'placeholder' },
  ENV:      { entityType: 'ENV',      allowed: false, redactionMode: 'placeholder' },
  CONFIG:   { entityType: 'CONFIG',   allowed: false, redactionMode: 'placeholder' },
  LOCATION: { entityType: 'LOCATION', allowed: false, redactionMode: 'placeholder' },

  // ── Reinject allowed in final answer ─────────────────────────────────────
  ORG:      { entityType: 'ORG',      allowed: true, redactionMode: 'placeholder' },
  PERSON:   { entityType: 'PERSON',   allowed: true, redactionMode: 'placeholder' },
  CLIENT:   { entityType: 'CLIENT',   allowed: true, redactionMode: 'placeholder' },
  PROJECT:  { entityType: 'PROJECT',  allowed: true, redactionMode: 'placeholder' },
  TICKET:   { entityType: 'TICKET',   allowed: true, redactionMode: 'placeholder' },
  REPO:     { entityType: 'REPO',     allowed: true, redactionMode: 'placeholder' },
}

export function getPolicy(entityType: EntityType): ReinjectionPolicy {
  return POLICIES[entityType]
}
