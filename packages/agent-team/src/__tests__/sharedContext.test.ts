import { describe, it, expect } from 'vitest'

import { createSharedContext } from '../context'

describe('createSharedContext', () => {
  it('returns empty snapshot when no entries', () => {
    const ctx = createSharedContext()
    expect(ctx.snapshot()).toBe('')
    expect(ctx.entries).toHaveLength(0)
  })

  it('appends non-empty delta and includes in snapshot', () => {
    const ctx = createSharedContext()
    const task = { id: 't1', title: 'Task One', status: 'completed' as const } as any
    const entry = ctx.append(task, 'some output')
    expect(entry.delta).toBe('some output')
    expect(ctx.entries).toHaveLength(1)
    expect(ctx.snapshot()).toContain('Task One')
    expect(ctx.snapshot()).toContain('some output')
    expect(ctx.snapshot()).toContain('=== SHARED CONTEXT ===')
  })

  it('skips empty and whitespace-only deltas', () => {
    const ctx = createSharedContext()
    const task = { id: 't1', title: 'T', status: 'completed' as const } as any
    ctx.append(task, '')
    ctx.append(task, '   ')
    expect(ctx.entries).toHaveLength(0)
    expect(ctx.snapshot()).toBe('')
  })

  it('accumulates multiple entries', () => {
    const ctx = createSharedContext()
    const t1 = { id: 't1', title: 'First', status: 'completed' as const } as any
    const t2 = { id: 't2', title: 'Second', status: 'completed' as const } as any
    ctx.append(t1, 'result one')
    ctx.append(t2, 'result two')
    expect(ctx.entries).toHaveLength(2)
    const snap = ctx.snapshot()
    expect(snap).toContain('First')
    expect(snap).toContain('result one')
    expect(snap).toContain('Second')
    expect(snap).toContain('result two')
  })
})
