export type EntityType =
  | 'ORG' | 'PERSON' | 'CLIENT' | 'PROJECT' | 'LOCATION'
  | 'HOST' | 'IP' | 'DOMAIN' | 'URL' | 'REPO' | 'TICKET' | 'ENV' | 'CONFIG'
  | 'SECRET' | 'CRED' | 'CERT'
  | 'FIN' | 'LEGAL' | 'PHI'

export type DetectorKind = 'regex' | 'ner'

export interface DetectedSpan {
  spanStart: number
  spanEnd: number
  originalText: string
  entityType: EntityType
  confidence: number
  detector: DetectorKind
}

export interface VaultEntry {
  /** e.g. ⟦SECRET:01⟧ */
  placeholder: string
  original: string
  entityType: EntityType
  /** SHA-256 hex of original — used for deduplication */
  hash: string
  reinjectionAllowed: boolean
}

export interface ReinjectionPolicy {
  entityType: EntityType
  allowed: boolean
  redactionMode: 'placeholder' | 'irreversible'
}

export type PipelineStage =
  | { stage: 'idle' }
  | { stage: 'detecting' }
  | { stage: 'detected'; spans: DetectedSpan[] }
  | { stage: 'redacted'; redactedText: string; entries: VaultEntry[] }
  | { stage: 'generating' }
  | { stage: 'validating' }
  | { stage: 'complete'; rawResponse: string; finalAnswer: string; validationPassed: boolean }
  | { stage: 'error'; message: string }
