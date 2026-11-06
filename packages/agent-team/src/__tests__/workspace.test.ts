import { describe, it, expect } from 'vitest'

import {
  createProject,
  addProjectFile,
  lockFile,
  unlockFile,
  readFile,
  createCheckpoint,
  renderProjectManifest
} from '../workspace'
import { createInMemoryProjectWorkspace } from '../projectWorkspace'

describe('createProject', () => {
  it('creates a project with defaults', () => {
    const p = createProject({ name: 'P', objective: 'build' })
    expect(p.name).toBe('P')
    expect(p.domain).toBe('general')
    expect(p.status).toBe('active')
    expect(p.files).toEqual([])
    expect(p.id).toMatch(/^[0-9a-f-]+$/)
  })
})

describe('addProjectFile', () => {
  it('adds a new file', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    const next = addProjectFile(p, { path: 'a.txt', content: 'hello' })
    expect(next.files).toHaveLength(1)
    expect(next.files[0].version).toBe(1)
    expect(next.files[0].content).toBe('hello')
  })
  it('updates an existing file and bumps version', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    let next = addProjectFile(p, { path: 'a.txt', content: 'v1' })
    next = addProjectFile(next, { path: 'a.txt', content: 'v2' })
    expect(next.files[0].version).toBe(2)
    expect(next.files[0].content).toBe('v2')
  })
})

describe('lockFile / unlockFile', () => {
  it('acquires and releases a lock', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    let next = addProjectFile(p, { path: 'a.txt', content: 'x' })
    const locked = lockFile(next, 'a.txt', 'task-1')
    expect(locked).not.toBeNull()
    expect(locked!.files[0].lockHolder).toBe('task-1')
    next = locked!
    next = unlockFile(next, 'a.txt', 'task-1')
    expect(next.files[0].lockHolder).toBeNull()
  })
  it('prevents double-lock by a different holder', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    let next = addProjectFile(p, { path: 'a.txt', content: 'x' })
    const locked = lockFile(next, 'a.txt', 'task-1')
    expect(locked).not.toBeNull()
    next = locked!
    expect(lockFile(next, 'a.txt', 'task-2')).toBeNull()
  })
  it('returns null when file missing', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    expect(lockFile(p, 'missing.txt', 'task-1')).toBeNull()
  })
})

describe('readFile', () => {
  it('returns null when missing', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    expect(readFile(p, 'nope')).toBeNull()
  })
})

describe('createCheckpoint', () => {
  it('snapshots file versions', () => {
    const p = createProject({ name: 'P', objective: 'o' })
    let next = addProjectFile(p, { path: 'a.txt', content: 'x' })
    const ck = createCheckpoint(next, 'run-1', 'mid', 'snapshot text')
    expect(ck.fileVersions['a.txt']).toBe(1)
    expect(ck.label).toBe('mid')
  })
})

describe('renderProjectManifest', () => {
  it('includes name, objective, and files', () => {
    const p = createProject({ name: 'P', objective: 'build it', instructions: 'do it well' })
    let next = addProjectFile(p, { path: 'src.ts', content: 'x' })
    const manifest = renderProjectManifest(next)
    expect(manifest).toContain('Name: P')
    expect(manifest).toContain('Objective: build it')
    expect(manifest).toContain('Instructions:')
    expect(manifest).toContain('src.ts')
  })
})

describe('createInMemoryProjectWorkspace', () => {
  it('writeFile locks, writes, and unlocks', () => {
    const ws = createInMemoryProjectWorkspace({ name: 'P', objective: 'o' })
    const file = ws.writeFile('a.txt', 'hello', 'task-1')
    expect(file).not.toBeNull()
    expect(file?.content).toBe('hello')
    expect(file?.ownerTaskId).toBe('task-1')
  })
  it('snapshot reflects written files', () => {
    const ws = createInMemoryProjectWorkspace({ name: 'P', objective: 'o' })
    ws.writeFile('a.txt', 'hello', 'task-1')
    expect(ws.snapshot()).toContain('a.txt')
  })
})
