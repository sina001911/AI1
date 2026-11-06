import { createArtifact, consumeArtifact, finalizeArtifact, renderArtifactIndex } from './artifact'
import type { Artifact, ArtifactRegistry, Task } from './types'

/**
 * Default in-memory artifact registry. The host can replace this with a
 * persistent implementation backed by the database.
 */
export function createInMemoryArtifactRegistry(): ArtifactRegistry {
  const artifacts: Artifact[] = []
  const byId = new Map<string, Artifact>()
  const byTask = new Map<string, Artifact[]>()

  function index(artifact: Artifact): void {
    byId.set(artifact.id, artifact)
    const list = byTask.get(artifact.taskId) ?? []
    if (!list.includes(artifact)) list.push(artifact)
    byTask.set(artifact.taskId, list)
  }

  return {
    get artifacts() {
      return artifacts
    },
    add(artifact: Artifact): Artifact {
      const existing = byId.get(artifact.id)
      if (existing) {
        const merged = { ...existing, ...artifact, updatedAt: Date.now() }
        const idx = artifacts.findIndex((a) => a.id === artifact.id)
        if (idx >= 0) artifacts[idx] = merged
        else artifacts.push(merged)
        byId.set(artifact.id, merged)
        return merged
      }
      artifacts.push(artifact)
      index(artifact)
      return artifact
    },
    get(id: string): Artifact | undefined {
      return byId.get(id)
    },
    markConsumed(artifactId: string, consumerTaskId: string): Artifact | undefined {
      const artifact = byId.get(artifactId)
      if (!artifact) return undefined
      const updated = consumeArtifact(artifact, consumerTaskId)
      const idx = artifacts.findIndex((a) => a.id === artifactId)
      if (idx >= 0) artifacts[idx] = updated
      byId.set(artifactId, updated)
      return updated
    },
    finalize(artifactId: string): Artifact | undefined {
      const artifact = byId.get(artifactId)
      if (!artifact) return undefined
      const updated = finalizeArtifact(artifact)
      const idx = artifacts.findIndex((a) => a.id === artifactId)
      if (idx >= 0) artifacts[idx] = updated
      byId.set(artifactId, updated)
      return updated
    },
    listByTask(taskId: string): Artifact[] {
      return byTask.get(taskId) ?? []
    },
    listFinal(): Artifact[] {
      return artifacts.filter((a) => a.status === 'final')
    }
  }
}

/**
 * Create an artifact from a task's text output. The artifact is named after the
 * task title and classified by content heuristics.
 */
export function createArtifactFromTaskOutput(task: Task, output: string, overrides: { name?: string; status?: any } = {}): Artifact {
  return createArtifact({
    runId: task.teamId,
    taskId: task.id,
    name: overrides.name ?? task.title,
    content: output,
    status: overrides.status
  })
}

export { renderArtifactIndex }
