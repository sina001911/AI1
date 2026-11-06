import { describe, it, expect } from 'vitest'

import {
  classifyArtifact,
  createArtifact,
  consumeArtifact,
  finalizeArtifact,
  rejectArtifact,
  createArtifactClaim,
  resolveClaim,
  renderArtifactIndex
} from '../artifact'
import type { ArtifactStatus } from '../types'

describe('classifyArtifact', () => {
  it('classifies markdown by extension', () => {
    expect(classifyArtifact('# hi', { name: 'doc.md' }).type).toBe('document')
  })
  it('classifies code by extension', () => {
    expect(classifyArtifact('const x = 1', { name: 'app.ts' }).type).toBe('code')
  })
  it('classifies json by content', () => {
    expect(classifyArtifact('{"a":1}').type).toBe('data')
  })
  it('classifies image by extension', () => {
    expect(classifyArtifact('', { name: 'pic.png' }).type).toBe('image')
  })
  it('defaults to text', () => {
    expect(classifyArtifact('hello world').type).toBe('text')
  })
})

describe('createArtifact', () => {
  it('inlines text content and estimates size', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'out.txt', content: 'hello' })
    expect(a.type).toBe('text')
    expect(a.content).toBe('hello')
    expect(a.sizeBytes).toBe(5)
    expect(a.status).toBe('draft')
    expect(a.consumedBy).toEqual([])
  })
  it('uses a ref for binary content without inlining', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'frame.png', ref: '/tmp/frame.png' })
    expect(a.type).toBe('image')
    expect(a.content).toBeNull()
    expect(a.ref).toBe('/tmp/frame.png')
  })
  it('respects explicit status', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y', status: 'final' as ArtifactStatus })
    expect(a.status).toBe('final')
  })
})

describe('artifact lifecycle', () => {
  it('consumeArtifact tracks consumers', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y' })
    const consumed = consumeArtifact(a, 'consumer-1')
    expect(consumedBy(consumed)).toEqual(['consumer-1'])
    // idempotent
    expect(consumedBy(consumeArtifact(consumed, 'consumer-1'))).toEqual(['consumer-1'])
  })
  it('finalizeArtifact promotes to final', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y' })
    expect(finalizeArtifact(a).status).toBe('final')
  })
  it('rejectArtifact marks rejected', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y' })
    const rejected = rejectArtifact(a, 'off-spec')
    expect(rejected.status).toBe('rejected')
    expect(rejected.name).toContain('off-spec')
  })
})

describe('artifact claims', () => {
  it('clamps confidence to 0-1', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y' })
    const claim = createArtifactClaim({ artifactId: a.id, taskId: 't', claim: 'ok', confidence: 5 })
    expect(claim.confidence).toBe(1)
    expect(claim.verified).toBe(false)
  })
  it('resolveClaim flips verified', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'x', content: 'y' })
    const claim = createArtifactClaim({ artifactId: a.id, taskId: 't', claim: 'ok' })
    expect(resolveClaim(claim, true).verified).toBe(true)
    expect(resolveClaim(claim, false).verified).toBe(false)
  })
})

describe('renderArtifactIndex', () => {
  it('returns empty for no artifacts', () => {
    expect(renderArtifactIndex([])).toBe('')
  })
  it('lists artifacts', () => {
    const a = createArtifact({ runId: 'r', taskId: 't', name: 'out.txt', content: 'hello world' })
    const index = renderArtifactIndex([a])
    expect(index).toContain('out.txt')
    expect(index).toContain('ARTIFACT REGISTRY')
  })
})

function consumedBy(a: { consumedBy: readonly string[] }) {
  return Array.from(a.consumedBy)
}
