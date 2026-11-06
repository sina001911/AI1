import { createId, now } from './team'
import type { Project, ProjectCheckpoint, ProjectFile, ProjectStatus } from './types'

export interface CreateProjectInput {
  name: string
  description?: string
  objective: string
  teamId?: string
  domain?: string
  instructions?: string
  status?: ProjectStatus
}

export function createProject(input: CreateProjectInput): Project {
  return {
    id: createId(),
    name: input.name,
    description: input.description ?? '',
    objective: input.objective,
    teamId: input.teamId ?? '',
    domain: (input.domain as any) ?? 'general',
    instructions: input.instructions ?? '',
    status: input.status ?? 'active',
    files: [],
    checkpoints: [],
    createdAt: now(),
    updatedAt: now()
  }
}

export interface AddProjectFileInput {
  path: string
  content?: string | null
  ref?: string | null
  contentType?: string
  ownerTaskId?: string | null
}

export function addProjectFile(project: Project, input: AddProjectFileInput): Project {
  const existing = project.files.find((f) => f.path === input.path)
  if (existing) {
    return {
      ...project,
      files: project.files.map((f) =>
        f.path === input.path
          ? {
              ...f,
              content: input.content ?? f.content,
              ref: input.ref ?? f.ref,
              contentType: input.contentType ?? f.contentType,
              sizeBytes: input.content != null ? Buffer.byteLength(input.content, 'utf8') : f.sizeBytes,
              version: f.version + 1,
              ownerTaskId: input.ownerTaskId ?? f.ownerTaskId,
              updatedAt: now()
            }
          : f
      ),
      updatedAt: now()
    }
  }
  const file: ProjectFile = {
    id: createId(),
    projectId: project.id,
    path: input.path,
    ownerTaskId: input.ownerTaskId ?? null,
    lockHolder: null,
    lockedAt: null,
    version: 1,
    content: input.content ?? null,
    ref: input.ref ?? null,
    contentType: input.contentType ?? 'text/plain',
    sizeBytes: input.content != null ? Buffer.byteLength(input.content, 'utf8') : 0,
    createdAt: now(),
    updatedAt: now()
  }
  return { ...project, files: [...project.files, file], updatedAt: now() }
}

/**
 * Acquire a write lock on a project file. Returns the updated project, or null
 * when the file is already locked by another task (concurrent modification
 * protection). The caller must release the lock when done.
 */
export function lockFile(project: Project, filePath: string, holderTaskId: string): Project | null {
  const file = project.files.find((f) => f.path === filePath)
  if (!file) return null
  if (file.lockHolder && file.lockHolder !== holderTaskId) return null
  return {
    ...project,
    files: project.files.map((f) =>
      f.path === filePath
        ? { ...f, lockHolder: holderTaskId, lockedAt: now() }
        : f
    ),
    updatedAt: now()
  }
}

/** Release a write lock held by `holderTaskId`. No-op if the holder differs. */
export function unlockFile(project: Project, filePath: string, holderTaskId: string): Project {
  return {
    ...project,
    files: project.files.map((f) =>
      f.path === filePath && f.lockHolder === holderTaskId
        ? { ...f, lockHolder: null, lockedAt: null }
        : f
    ),
    updatedAt: now()
  }
}

/** Read a file's current content. Returns null when missing. */
export function readFile(project: Project, filePath: string): ProjectFile | null {
  return project.files.find((f) => f.path === filePath) ?? null
}

export function updateProjectStatus(project: Project, status: ProjectStatus): Project {
  return { ...project, status, updatedAt: now() }
}

export function updateProjectInstructions(project: Project, instructions: string): Project {
  return { ...project, instructions, updatedAt: now() }
}

/** Create a checkpoint capturing the current task/file state for pause/resume. */
export function createCheckpoint(
  project: Project,
  runId: string,
  label: string,
  taskSnapshot: string
): ProjectCheckpoint {
  const fileVersions: Record<string, number> = {}
  for (const f of project.files) fileVersions[f.path] = f.version
  return {
    id: createId(),
    projectId: project.id,
    runId,
    label,
    taskSnapshot,
    fileVersions,
    createdAt: now()
  }
}

/** Append a checkpoint to a project. */
export function addCheckpoint(project: Project, checkpoint: ProjectCheckpoint): Project {
  return { ...project, checkpoints: [...project.checkpoints, checkpoint], updatedAt: now() }
}

/** List files in a project, optionally filtered by owner. */
export function listFiles(project: Project, ownerTaskId?: string | null): ProjectFile[] {
  if (ownerTaskId == null) return project.files
  return project.files.filter((f) => f.ownerTaskId === ownerTaskId)
}

/** Render a compact project manifest for inclusion in a prompt. */
export function renderProjectManifest(project: Project): string {
  const lines: string[] = ['=== PROJECT MANIFEST ===']
  lines.push(`Name: ${project.name}`)
  lines.push(`Objective: ${project.objective}`)
  lines.push(`Domain: ${project.domain}`)
  lines.push(`Status: ${project.status}`)
  if (project.instructions) {
    lines.push('Instructions:')
    lines.push(project.instructions)
  }
  if (project.files.length > 0) {
    lines.push('Files:')
    for (const f of project.files) {
      const lock = f.lockHolder ? ` [locked by ${f.lockHolder}]` : ''
      lines.push(`- ${f.path} v${f.version}${lock}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
