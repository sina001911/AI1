import { defineProvider } from './types'

const fccModels = [
  'claude-opus-5',
  'claude-sonnet-5-5',
  'claude-sonnet-5',
  'claude-haiku-5-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-opus-4-1',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4',
  'claude-haiku-4-5'
]

export default defineProvider({
  id: 'fcc',
  name: 'FCC (Free Claude Code)',
  availableInEditions: ['global', 'cn'],
  authOptional: true,
  defaultChatEndpoint: 'anthropic-messages',
  endpointConfigs: {
    'anthropic-messages': {
      adapterFamily: 'anthropic',
      baseUrl: 'http://127.0.0.1:1919/v1'
    }
  },
  serverTools: [
    { id: 'web-search', modelScope: 'model-dependent', modelIdPrefixes: fccModels },
    { id: 'url-context', modelScope: 'model-dependent', modelIdPrefixes: fccModels }
  ],
  metadata: {
    website: {
      official: 'https://github.com/sina001911/fcc-pro',
      docs: 'https://github.com/sina001911/fcc-pro'
    }
  },
  overrides: fccModels.map((modelId) => ({ modelId, name: modelId }))
})
