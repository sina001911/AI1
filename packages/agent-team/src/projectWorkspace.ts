import { createProject, addProjectFile, lockFile, unlockFile, readFile, updateProjectStatus, updateProjectInstructions, createCheckpoint, addCheckpoint, listFiles, renderProjectManifest } from './workspace'
import type { Project, ProjectCheckpoint, ProjectFile, ProjectStatus, ProjectWorkspace } from './types'

/**
 * Default in-memory project workspace. The host can replace this with a
 * persistent implementation backed by the database or filesystem.
 */
export function createInMemoryProjectWorkspace(initial: {
  id?: string
  name: string
  description?: string
  objective: string
  teamId?: string
  domain?: string
  instructions?: string
  status?: ProjectStatus
}): ProjectWorkspace {
  let project: Project = createProject(initial)

  const api: ProjectWorkspace = {
    get project() {
      return project
    },
    lockFile(path: string, holderTaskId: string): boolean {
      const next = lockFile(project, path, holderTaskId)
      if (next) {
        project = next
        return true
      }
      return false
    },
    unlockFile(path: string, holderTaskId: string): void {
      project = unlockFile(project, path, holderTaskId)
    },
    writeFile(path: string, content: string, ownerTaskId: string, contentType?: string): ProjectFile | null {
      // Ensure the file exists before locking it, so lockFile does not reject
      // a not-yet-created file during concurrent specialist writes.
      project = addProjectFile(project, { path, content: '', ownerTaskId, contentType })
      const locked = lockFile(project, path, ownerTaskId)
      if (!locked) return null
      project = locked
      project = addProjectFile(project, { path, content, ownerTaskId, contentType })
      project = unlockFile(project, path, ownerTaskId)
      return readFile(project, path)
    },
    readFile(path: string): ProjectFile | null {
      return readFile(project, path)
    },
    listFiles(ownerTaskId?: string | null): ProjectFile[] {
      return listFiles(project, ownerTaskId)
    },
    snapshot(): string {
      return renderProjectManifest(project)
    }
  }
  return api
}

export {
  createProject,
  addProjectFile,
  lockFile,
  unlockFile,
  readFile,
  updateProjectStatus,
  updateProjectInstructions,
  createCheckpoint,
  addCheckpoint,
  listFiles,
  renderProjectManifest
}

export type { Project, ProjectCheckpoint, ProjectFile, ProjectStatus, ProjectWorkspace }
