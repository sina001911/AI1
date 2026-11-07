import { defaultCapabilities } from './team'
import type { AgentCapabilities, AgentFeature, Specialist, Task } from './types'

/**
 * Build a capability profile for a specialist, merging role defaults with the
 * specialist's declared tool permissions. The host can override this with
 * runtime-probed information (e.g. whether the model actually supports vision).
 */
export function buildCapabilities(
  specialist: Specialist,
  overrides: Partial<Omit<AgentCapabilities, 'specialistId' | 'updatedAt'>> = {}
): AgentCapabilities {
  const defaults = defaultCapabilities(specialist.role)
  const tools = overrides.tools ?? defaults.tools
  return {
    specialistId: specialist.id,
    tools,
    features: overrides.features ?? defaults.features,
    throughputHint: overrides.throughputHint ?? defaults.throughputHint,
    supportsVision: overrides.supportsVision ?? defaults.supportsVision,
    supportsAudio: overrides.supportsAudio ?? defaults.supportsAudio,
    supportsTools: overrides.supportsTools ?? defaults.supportsTools,
    updatedAt: Date.now()
  }
}

/**
 * Resolve the effective permission for one tool on one specialist.
 * `*` wildcard matches any tool name. Returns `'allow'` / `'deny'` /
 * `'prompt'`; an unmapped tool resolves to `'deny'` so an unlisted tool can
 * never be invoked by accident.
 */
export function canInvokeTool(
  specialist: Specialist,
  toolName: string
): 'allow' | 'deny' | 'prompt' {
  const perms = specialist.toolPermissions
  // A specific entry wins over the `*` wildcard: `defaultToolPermissions`
  // builds `{ 'file.write': 'prompt', ...{ '*': 'allow' } }`, so the
  // per-tool rule must be consulted first or the wildcard would swallow it.
  const direct = perms[toolName]
  if (direct === 'allow') return 'allow'
  if (direct === 'deny') return 'deny'
  if (direct === 'prompt') return 'prompt'
  const wildcard = perms['*']
  if (wildcard === 'allow') return 'allow'
  if (wildcard === 'deny') return 'deny'
  if (wildcard === 'prompt') return 'prompt'
  return 'deny'
}

/**
 * Score how well a specialist matches a task, based on capability overlap.
 * Returns 0-1. A score of 0 means the specialist cannot perform the task at all.
 */
export function matchScore(task: Task, _specialist: Specialist, capabilities: AgentCapabilities): number {
  const text = `${task.title} ${task.description}`.toLowerCase()
  const featureWords: Array<{ pattern: RegExp; feature: AgentFeature }> = [
    { pattern: /\b(code|implement|function|component|api|database|refactor|debug|test|build)\b/, feature: 'code' },
    { pattern: /\b(research|investigate|survey|summarize|compare|evaluate|fact.?check)\b/, feature: 'web_search' },
    { pattern: /\b(image|picture|photo|visual|illustration|drawing)\b/, feature: 'image_generation' },
    { pattern: /\b(video|clip|footage|animation|storyboard)\b/, feature: 'video_generation' },
    { pattern: /\b(data|statistics|csv|chart|metric|analytics)\b/, feature: 'data_analysis' },
    { pattern: /\b(review|critique|audit|verify|quality)\b/, feature: 'code' },
    { pattern: /\b(search|browse|web)\b/, feature: 'web_search' },
    { pattern: /\b(read|file|document)\b/, feature: 'file_read' },
    { pattern: /\b(write|edit|create|generate)\b/, feature: 'file_write' },
    { pattern: /\b(shell|terminal|command|execute)\b/, feature: 'shell_execute' },
    { pattern: /\b(ocr|text|language|translate)\b/, feature: 'text' }
  ]

  let hits = 0
  let total = 0
  for (const { pattern, feature } of featureWords) {
    if (!pattern.test(text)) continue
    total++
    if (capabilities.features.includes(feature)) hits++
  }
  if (total === 0) return 0.5 // no signal; neutral
  return hits / total
}

/**
 * Rank specialists for a task. Specialists that cannot invoke any tool needed
 * by the task get a score of 0 and are excluded.
 */
export function rankSpecialists(
  task: Task,
  specialists: Specialist[],
  capabilityCache: Map<string, AgentCapabilities>
): Specialist[] {
  const scored = specialists
    .filter((s) => s.enabled)
    .map((s) => {
      const caps = capabilityCache.get(s.id) ?? buildCapabilities(s)
      capabilityCache.set(s.id, caps)
      return { specialist: s, score: matchScore(task, s, caps) }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.specialist)
}

/**
 * Pick the best specialist for a task using capability-based routing.
 * Falls back to the first enabled specialist when no specialist matches.
 */
export function pickSpecialistByCapability(
  task: Task,
  specialists: Specialist[],
  capabilityCache: Map<string, AgentCapabilities>
): Specialist | null {
  const ranked = rankSpecialists(task, specialists, capabilityCache)
  return ranked[0] ?? specialists.filter((s) => s.enabled)[0] ?? null
}

/**
 * Check whether a specialist's model supports a required feature for a task.
 */
export function supportsTaskFeature(task: Task, capabilities: AgentCapabilities): boolean {
  const text = `${task.title} ${task.description}`.toLowerCase()
  if (/\b(image|picture|photo)\b/.test(text) && !capabilities.supportsVision) return false
  if (/\b(video|clip|footage)\b/.test(text) && !capabilities.features.includes('video_generation')) return false
  return true
}