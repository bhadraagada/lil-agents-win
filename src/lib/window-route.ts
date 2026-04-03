import type { WindowRoute } from './types'

export function parseWindowRoute(hash: string): WindowRoute {
  const cleaned = hash.replace(/^#\/?/, '')
  const [kind, rawAgentId] = cleaned.split('/')

  if (kind === 'agent') {
    return { kind: 'agent', agentId: Number(rawAgentId) || 0 }
  }

  if (kind === 'popover') {
    return { kind: 'popover', agentId: Number(rawAgentId) || 0 }
  }

  if (kind === 'bubble') {
    return { kind: 'bubble', agentId: Number(rawAgentId) || 0 }
  }

  return { kind: 'settings' }
}
