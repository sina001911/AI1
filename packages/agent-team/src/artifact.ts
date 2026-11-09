import { createId, now } from './team'
import type { Artifact, ArtifactClaim, ArtifactStatus, ArtifactType } from './types'

/**
 * Classify a raw output into an artifact type based on content heuristics and
 * an explicit hint. Used by the host when a specialist produces an artifact.
 */
export function classifyArtifact(
  content: string,
  hint?: { name?: string; contentType?: string }
): { type: ArtifactType; contentType: string } {
  const name = (hint?.name ?? '').toLowerCase()
  const ct = (hint?.contentType ?? '').toLowerCase()

  if (ct.includes('image') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
    return { type: 'image', contentType: ct || 'image/png' }
  }
  if (ct.includes('video') || /\.(mp4|mov|webm|avi|mkv)$/i.test(name)) {
    return { type: 'video', contentType: ct || 'video/mp4' }
  }
  if (ct.includes('audio') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) {
    return { type: 'audio', contentType: ct || 'audio/mpeg' }
  }
  if (ct.includes('json') || /\.(json|csv|tsv|xml|yaml|yml)$/i.test(name) || /^\s*[{[]/.test(content.trim())) {
    return { type: 'data', contentType: ct || 'application/json' }
  }
  if (ct.includes('pdf') || /\.pdf$/i.test(name)) {
    return { type: 'document', contentType: ct || 'application/pdf' }
  }
  if (ct.includes('markdown') || /\.md$/i.test(name)) {
    return { type: 'document', contentType: ct || 'text/markdown' }
  }
  if (
    ct.includes('javascript') ||
    ct.includes('typescript') ||
    /\.(js|ts|jsx|tsx|py|rs|go|java|c|cpp|sh)$/i.test(name)
  ) {
    return { type: 'code', contentType: ct || 'text/plain' }
  }
  if (content.trim().startsWith('<') && content.trim().includes('>')) {
    return { type: 'document', contentType: ct || 'text/html' }
  }
  return { type: 'text', contentType: ct || 'text/plain' }
}

/** Estimate the byte size of an artifact from inline content or a ref. */
export function estimateSize(content: string | null, ref: string | null): number {
  if (content) return Buffer.byteLength(content, 'utf8')
  if (ref) return 0 // unknown; host knows
  return 0
}

export interface CreateArtifactInput {
  runId: string
  taskId: string
  name: string
  content?: string | null
  ref?: string | null
  contentType?: string
  status?: ArtifactStatus
}

/**
 * Create an artifact record. Content is inlined when present; large/binary
 * artifacts should pass a `ref` instead and leave `content` null.
 */
export function createArtifact(input: CreateArtifactInput): Artifact {
  const { type, contentType } = classifyArtifact(input.content ?? '', {
    name: input.name,
    contentType: input.contentType
  })
  return {
    id: createId(),
    runId: input.runId,
    taskId: input.taskId,
    name: input.name,
    type,
    contentType,
    content: input.content ?? null,
    ref: input.ref ?? null,
    sizeBytes: estimateSize(input.content ?? null, input.ref ?? null),
    status: input.status ?? 'draft',
    consumedBy: [],
    createdAt: now(),
    updatedAt: now()
  }
}

/** Mark an artifact as consumed by a later task. */
export function consumeArtifact(artifact: Artifact, consumerTaskId: string): Artifact {
  if (artifact.consumedBy.includes(consumerTaskId)) return artifact
  return { ...artifact, consumedBy: [...artifact.consumedBy, consumerTaskId], updatedAt: now() }
}

/** Promote an artifact to a final deliverable. */
export function finalizeArtifact(artifact: Artifact): Artifact {
  return { ...artifact, status: 'final', updatedAt: now() }
}

/** Reject an artifact with a reason recorded in the name suffix. */
export function rejectArtifact(artifact: Artifact, reason?: string): Artifact {
  return {
    ...artifact,
    status: 'rejected',
    name: reason ? `${artifact.name} (rejected: ${reason})` : artifact.name,
    updatedAt: now()
  }
}

/** Build a claim about an artifact that another agent can verify or dispute. */
export function createArtifactClaim(input: {
  artifactId: string
  taskId: string
  claim: string
  confidence?: number
}): ArtifactClaim {
  return {
    id: createId(),
    artifactId: input.artifactId,
    taskId: input.taskId,
    claim: input.claim,
    confidence: clampConfidence(input.confidence),
    verified: false,
    createdAt: now()
  }
}

/** Record that a claim was verified or refuted. */
export function resolveClaim(claim: ArtifactClaim, verified: boolean): ArtifactClaim {
  return { ...claim, verified, createdAt: now() }
}

function clampConfidence(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

/** Render an artifact registry as a compact text block for inclusion in a prompt. */
export function renderArtifactIndex(artifacts: readonly Artifact[]): string {
  if (artifacts.length === 0) return ''
  const lines: string[] = ['=== ARTIFACT REGISTRY ===']
  for (const a of artifacts) {
    lines.push(
      `- ${a.name} [${a.type}] status=${a.status} ${(a.sizeBytes / 1024).toFixed(1)}KB ref=${a.ref ?? 'inline'}`
    )
  }
  lines.push('')
  return lines.join('\n')
}
