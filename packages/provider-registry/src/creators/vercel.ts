import { defineCreator } from './types'

export default defineCreator({
  id: 'vercel',
  name: 'Vercel',
  modelsDevProviders: ['vercel'],
  idPrefixes: ['v0'],
  reasoningFamilies: [
    { pattern: '^muse-spark' },
    { pattern: '^interfaze' },
    { pattern: '^laguna-s' },
    { pattern: '^apex' },
    { pattern: '^arrow-2' },
    { pattern: '^beam' },
    { pattern: '^ember-1' },
    { pattern: '^fugu' },
    { pattern: '^glimpse' },
    { pattern: '^glyph-cluster' },
    { pattern: '^muse-wonder-1-0' },
    { pattern: '^namazu' },
    { pattern: '^particle-1' }
  ]
})
