import { defaultCapabilities, defaultSystemPrompt, defaultToolPermissions } from './team'
import type { AgentCapabilities, AgentFeature, SpecialistRole, ToolPermissionMap } from './types'

/**
 * Versioned public catalog of domain templates used by Collaborative Studio to
 * build default teams. Each template maps a {@link ProjectDomain} to the role,
 * system prompt, tool permissions, and capability profile the scheduler uses
 * when a user creates a team for that domain without specifying specialists.
 *
 * The catalog is additive: it re-exports the existing role defaults from
 * `team.ts` under a versioned, domain-keyed surface. Bumping `CATALOG_VERSION`
 * signals a breaking change to template contents.
 */

export const CATALOG_VERSION = 1

export interface DomainTemplate {
  domain: string
  role: SpecialistRole
  description: string
  systemPrompt: string
  toolPermissions: ToolPermissionMap
  capabilities: Omit<AgentCapabilities, 'specialistId' | 'updatedAt'>
}

type DomainTemplateRecord = Record<string, DomainTemplate>

const DOMAIN_TEMPLATES: DomainTemplateRecord = {
  software: {
    domain: 'software',
    role: 'coding',
    description: 'Software development: implement, refactor, test, and review code.',
    systemPrompt: defaultSystemPrompt('coding'),
    toolPermissions: defaultToolPermissions('coding'),
    capabilities: defaultCapabilities('coding')
  },
  film: {
    domain: 'film',
    role: 'video',
    description: 'Video production: storyboards, shot lists, and video generation.',
    systemPrompt: defaultSystemPrompt('video'),
    toolPermissions: defaultToolPermissions('video'),
    capabilities: defaultCapabilities('video')
  },
  image: {
    domain: 'image',
    role: 'image',
    description: 'Image generation and editing: subjects, style, lighting, and composition.',
    systemPrompt: defaultSystemPrompt('image'),
    toolPermissions: defaultToolPermissions('image'),
    capabilities: defaultCapabilities('image')
  },
  research: {
    domain: 'research',
    role: 'research',
    description: 'Research and content: web search, fetching, and source-backed summaries.',
    systemPrompt: defaultSystemPrompt('research'),
    toolPermissions: defaultToolPermissions('research'),
    capabilities: defaultCapabilities('research')
  },
  data: {
    domain: 'data',
    role: 'data-analyst',
    description: 'Data analysis: read data files, query structured data, and chart results.',
    systemPrompt: defaultSystemPrompt('data-analyst'),
    toolPermissions: defaultToolPermissions('data-analyst'),
    capabilities: defaultCapabilities('data-analyst')
  },
  writing: {
    domain: 'writing',
    role: 'reviewer',
    description: 'Writing and review: evaluate drafts against explicit criteria with actionable feedback.',
    systemPrompt: defaultSystemPrompt('reviewer'),
    toolPermissions: defaultToolPermissions('reviewer'),
    capabilities: defaultCapabilities('reviewer')
  },
  marketing: {
    domain: 'marketing',
    role: 'general',
    description: 'General-purpose assistance for marketing copy and campaign tasks.',
    systemPrompt: defaultSystemPrompt('general'),
    toolPermissions: defaultToolPermissions('general'),
    capabilities: defaultCapabilities('general')
  },
  general: {
    domain: 'general',
    role: 'general',
    description: 'General-purpose assistance for any task.',
    systemPrompt: defaultSystemPrompt('general'),
    toolPermissions: defaultToolPermissions('general'),
    capabilities: defaultCapabilities('general')
  }
} as const

/**
 * The catalog version. Increment when template contents change in a breaking way.
 */
export function catalogVersion(): number {
  return CATALOG_VERSION
}

/**
 * List every domain template key, in canonical order.
 */
export function listDomainTemplates(): readonly string[] {
  return Object.keys(DOMAIN_TEMPLATES)
}

/**
 * Resolve the template for a domain, or undefined when the domain is unknown.
 */
export function getDomainTemplate(domain: string): DomainTemplate | undefined {
  return DOMAIN_TEMPLATES[domain]
}

/**
 * Agent features referenced across the catalog (union of all template features).
 * Derived, not hand-maintained, so it stays in sync with `defaultCapabilities`.
 */
export function catalogFeatures(): readonly AgentFeature[] {
  const seen = new Set<AgentFeature>()
  for (const template of Object.values(DOMAIN_TEMPLATES)) {
    for (const feature of template.capabilities.features) {
      seen.add(feature)
    }
  }
  return [...seen]
}
