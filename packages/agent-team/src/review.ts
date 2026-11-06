import { createId, now } from './team'
import type { OutputConflict, QualityReview, ReviewFinding } from './types'

export interface CreateReviewInput {
  runId: string
  reviewedTaskId: string
  artifactId?: string | null
  reviewerTaskId: string
  verdict: 'pass' | 'conditional_pass' | 'fail'
  summary: string
  findings?: Omit<ReviewFinding, 'id' | 'runId' | 'taskId' | 'reviewerTaskId' | 'createdAt' | 'resolved'>[]
}

export function createReview(input: CreateReviewInput): QualityReview {
  const findings: ReviewFinding[] = (input.findings ?? []).map((f) => ({
    id: createId(),
    runId: input.runId,
    taskId: input.reviewedTaskId,
    artifactId: f.artifactId ?? input.artifactId ?? null,
    reviewerTaskId: input.reviewerTaskId,
    severity: f.severity,
    category: f.category,
    message: f.message,
    suggestion: f.suggestion ?? null,
    resolved: false,
    createdAt: now()
  }))
  return {
    id: createId(),
    runId: input.runId,
    reviewedTaskId: input.reviewedTaskId,
    artifactId: input.artifactId ?? null,
    reviewerTaskId: input.reviewerTaskId,
    verdict: input.verdict,
    summary: input.summary,
    findings,
    createdAt: now()
  }
}

export function addFinding(review: QualityReview, finding: Omit<ReviewFinding, 'id' | 'runId' | 'taskId' | 'reviewerTaskId' | 'createdAt' | 'resolved'>): QualityReview {
  return {
    ...review,
    findings: [
      ...review.findings,
      {
        id: createId(),
        runId: review.runId,
        taskId: review.reviewedTaskId,
        artifactId: finding.artifactId ?? review.artifactId ?? null,
        reviewerTaskId: review.reviewerTaskId,
        severity: finding.severity,
        category: finding.category,
        message: finding.message,
        suggestion: finding.suggestion ?? null,
        resolved: false,
        createdAt: now()
      }
    ]
  }
}

export function resolveFinding(review: QualityReview, findingId: string, resolved: boolean): QualityReview {
  return {
    ...review,
    findings: review.findings.map((f) => (f.id === findingId ? { ...f, resolved } : f))
  }
}

export function blockerCount(review: QualityReview): number {
  return review.findings.filter((f) => f.severity === 'blocker' && !f.resolved).length
}

export function unresolvedErrorCount(review: QualityReview): number {
  return review.findings.filter((f) => (f.severity === 'error' || f.severity === 'blocker') && !f.resolved).length
}

export function reviewPasses(review: QualityReview): boolean {
  if (review.verdict === 'fail') return false
  return blockerCount(review) === 0
}

export interface CreateConflictInput {
  runId: string
  field: string
  taskIds: string[]
  positions: string[]
}

export function createConflict(input: CreateConflictInput): OutputConflict {
  return {
    id: createId(),
    runId: input.runId,
    field: input.field,
    taskIds: input.taskIds,
    positions: input.positions,
    resolution: 'unresolved',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now()
  }
}

export function resolveConflict(
  conflict: OutputConflict,
  resolution: OutputConflict['resolution'],
  resolvedBy: string
): OutputConflict {
  return {
    ...conflict,
    resolution,
    resolvedBy,
    resolvedAt: now()
  }
}

export function mergeConflictPositions(conflict: OutputConflict): string {
  if (conflict.positions.length === 0) return ''
  return conflict.positions.join('\n--- position boundary ---\n')
}

/** Build a review prompt that asks a reviewer to evaluate an artifact. */
export function buildReviewPrompt(input: {
  objective: string
  artifactName: string
  artifactContent: string
  criteria?: string[]
}): string {
  const lines: string[] = ['=== INDEPENDENT QUALITY REVIEW ===']
  lines.push(`Objective: ${input.objective}`)
  lines.push('')
  lines.push(`Review the following artifact: ${input.artifactName}`)
  lines.push('')
  if (input.criteria && input.criteria.length > 0) {
    lines.push('Evaluate against these criteria:')
    for (const c of input.criteria) lines.push(`- ${c}`)
    lines.push('')
  }
  lines.push('=== ARTIFACT CONTENT ===')
  lines.push(input.artifactContent)
  lines.push('')
  lines.push('Reply with a JSON object:')
  lines.push('{ "verdict": "pass|conditional_pass|fail", "summary": "...", "findings": [ { "severity": "info|warning|error|blocker", "category": "...", "message": "...", "suggestion": "..." } ] }')
  return lines.join('\n')
}

/** Render a quality review as a compact text block. */
export function renderReviewSummary(review: QualityReview): string {
  const lines: string[] = ['=== QUALITY REVIEW ===']
  lines.push(`Verdict: ${review.verdict}`)
  lines.push(`Summary: ${review.summary}`)
  if (review.findings.length > 0) {
    lines.push('Findings:')
    for (const f of review.findings) {
      const status = f.resolved ? '[resolved]' : '[open]'
      lines.push(`- ${status} ${f.severity} (${f.category}): ${f.message}`)
    }
  }
  return lines.join('\n')
}
