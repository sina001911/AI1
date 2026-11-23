/**
 * Workspace lock stress tests.
 *
 * Verifies that the project workspace file-locking primitives behave correctly
 * under concurrent access scenarios typical of multi-specialist orchestration:
 * - Mutual exclusion: only one holder can hold a lock at a time
 * - Release semantics: releasing frees the lock for the next acquirer
 * - Holder integrity: only the lock holder can release
 * - Idempotency: lock/unlock cycles don't corrupt state
 * - Read concurrency: readers don't block each other or writers improperly
 */

import { describe, it, expect } from 'vitest'

import type { Project } from '../types'
import { addProjectFile, createProject, lockFile, readFile, unlockFile } from '../workspace'

function makeProject(): Project {
  return createProject({
    name: 'Stress Test Project',
    description: 'Used for lock stress tests',
    objective: 'Verify locking under concurrency',
    teamId: 'tm-stress'
  })
}

function addFile(project: Project, path: string, content = 'initial content') {
  return addProjectFile(project, { path, content, ownerTaskId: 'owner-1' })
}

describe('Workspace lock stress tests', () => {
  it('grants the lock to the first acquirer and denies a concurrent acquirer', () => {
    const project = addFile(makeProject(), 'file-a.txt')

    const first = lockFile(project, 'file-a.txt', 'task-1')
    expect(first).not.toBeNull()
    const firstFile = first!.files.find((f) => f.path === 'file-a.txt')
    expect(firstFile?.lockHolder).toBe('task-1')

    // A second task cannot acquire while the first holds it
    // Must pass the locked project (immutable update pattern)
    const second = lockFile(first!, 'file-a.txt', 'task-2')
    expect(second).toBeNull()
  })

  it('allows re-acquisition after release by the same holder', () => {
    const project = addFile(makeProject(), 'file-b.txt')

    const locked = lockFile(project, 'file-b.txt', 'task-1')
    expect(locked).not.toBeNull()

    const unlocked = unlockFile(locked!, 'file-b.txt', 'task-1')
    const unlockedFile = unlocked.files.find((f) => f.path === 'file-b.txt')
    expect(unlockedFile?.lockHolder).toBeNull()

    // Same task can re-acquire after releasing
    const reLocked = lockFile(unlocked, 'file-b.txt', 'task-1')
    expect(reLocked).not.toBeNull()
    const reLockedFile = reLocked!.files.find((f) => f.path === 'file-b.txt')
    expect(reLockedFile?.lockHolder).toBe('task-1')
  })

  it('allows a different task to acquire after release', () => {
    const project = addFile(makeProject(), 'file-c.txt')

    const locked = lockFile(project, 'file-c.txt', 'task-1')
    const unlocked = unlockFile(locked!, 'file-c.txt', 'task-1')

    const reLocked = lockFile(unlocked, 'file-c.txt', 'task-2')
    expect(reLocked).not.toBeNull()
    const reLockedFile = reLocked!.files.find((f) => f.path === 'file-c.txt')
    expect(reLockedFile?.lockHolder).toBe('task-2')
  })

  it('rejects unlock by a non-holder', () => {
    const project = addFile(makeProject(), 'file-d.txt')

    const locked = lockFile(project, 'file-d.txt', 'task-1')
    expect(locked).not.toBeNull()

    // task-2 tries to unlock task-1's lock - should be a no-op
    const unlocked = unlockFile(locked!, 'file-d.txt', 'task-2')
    const file = unlocked.files.find((f) => f.path === 'file-d.txt')
    expect(file?.lockHolder).toBe('task-1')

    // task-1 can still unlock its own lock
    const reallyUnlocked = unlockFile(unlocked, 'file-d.txt', 'task-1')
    const reallyUnlockedFile = reallyUnlocked.files.find((f) => f.path === 'file-d.txt')
    expect(reallyUnlockedFile?.lockHolder).toBeNull()
  })

  it('supports rapid lock/unlock cycles without corruption', () => {
    const project = addFile(makeProject(), 'file-e.txt')

    let current = project
    for (let i = 0; i < 50; i++) {
      const holder = `task-${i % 5}`
      const locked = lockFile(current, 'file-e.txt', holder)
      if (!locked) {
        // If we can't acquire, something is wrong - lock should always be free
        // since we unlock each iteration
        expect(false).toBe(true)
        break
      }
      current = unlockFile(locked, 'file-e.txt', holder)
    }

    const finalFile = current.files.find((f) => f.path === 'file-e.txt')
    expect(finalFile?.lockHolder).toBeNull()
    expect(current.files.length).toBe(1)
  })

  it('does not corrupt project metadata during lock cycles', () => {
    const project = addFile(makeProject(), 'file-f.txt')

    let current = project
    for (let i = 0; i < 20; i++) {
      const locked = lockFile(current, 'file-f.txt', 'task-x')
      if (!locked) break
      current = unlockFile(locked, 'file-f.txt', 'task-x')
    }

    const finalFile = current.files.find((f) => f.path === 'file-f.txt')
    expect(finalFile?.lockHolder).toBeNull()
    expect(finalFile?.version).toBe(1)
    expect(current.files.length).toBe(1)
    expect(current.name).toBe('Stress Test Project')
  })

  it('concurrent logical access - multiple readers can read while unlocked', () => {
    const project = addFile(makeProject(), 'file-g.txt', 'shared content')

    // Multiple reads without locking should all succeed
    const read1 = readFile(project, 'file-g.txt')
    const read2 = readFile(project, 'file-g.txt')
    const read3 = readFile(project, 'file-g.txt')

    expect(read1?.content).toBe('shared content')
    expect(read2?.content).toBe('shared content')
    expect(read3?.content).toBe('shared content')
  })

  it('lock/unlock under rapid sequential writes preserves file integrity', () => {
    const project = addFile(makeProject(), 'file-h.txt', 'original')

    let current = project
    for (let i = 0; i < 30; i++) {
      const locked = lockFile(current, 'file-h.txt', 'writer')
      if (!locked) break
      current = addProjectFile(current, {
        path: 'file-h.txt',
        content: `content-${i}`,
        ownerTaskId: 'writer'
      })
      current = unlockFile(current, 'file-h.txt', 'writer')
    }

    const finalFile = current.files.find((f) => f.path === 'file-h.txt')
    expect(finalFile?.content).toBe('content-29')
    expect(finalFile?.version).toBe(31) // 1 (initial) + 30 updates
  })

  it('handles lock contention with alternating holders', () => {
    const project = addFile(makeProject(), 'file-i.txt')

    let current = project
    const holders = ['task-a', 'task-b', 'task-c']
    let holderIndex = 0

    for (let i = 0; i < 60; i++) {
      const holder = holders[holderIndex]
      holderIndex = (holderIndex + 1) % holders.length

      const locked = lockFile(current, 'file-i.txt', holder)
      if (!locked) {
        // Should never happen since we always unlock before next acquisition
        expect(false).toBe(true)
        break
      }
      current = unlockFile(locked, 'file-i.txt', holder)
    }

    const finalFile = current.files.find((f) => f.path === 'file-i.txt')
    expect(finalFile?.lockHolder).toBeNull()
    expect(finalFile?.version).toBe(1)
  })

  it('read returns null for missing file', () => {
    const project = makeProject()
    const result = readFile(project, 'nonexistent.txt')
    expect(result).toBeNull()
  })

  it('lock returns null for missing file', () => {
    const project = makeProject()
    const result = lockFile(project, 'nonexistent.txt', 'task-1')
    expect(result).toBeNull()
  })

  it('unlock returns unchanged project for missing file', () => {
    const project = makeProject()
    const result = unlockFile(project, 'nonexistent.txt', 'task-1')
    expect(result).toEqual(project)
  })
})
