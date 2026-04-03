export type ThemeName = 'Peach' | 'Midnight' | 'Cloud' | 'Moss'

export type ProviderName = 'claude' | 'codex' | 'copilot' | 'gemini' | 'opencode'

export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'toolUse' | 'toolResult'

export type WindowRoute =
  | { kind: 'settings' }
  | { kind: 'agent'; agentId: number }
  | { kind: 'popover'; agentId: number }
  | { kind: 'bubble'; agentId: number }

export interface TranscriptMessage {
  id: string
  role: MessageRole
  text: string
}

export interface BubbleSnapshot {
  text: string
  kind: 'thinking' | 'completion'
}

export interface AgentSnapshot {
  id: number
  name: string
  variant: 'bruce' | 'jazz'
  accent: string
  isBusy: boolean
  isWalking: boolean
  facing: 'left' | 'right'
  walkCycleId: number
  isPopoverVisible: boolean
  history: TranscriptMessage[]
  bubble: BubbleSnapshot | null
}

export interface AgentAnchorMap {
  [agentName: string]: number
}

export interface AppConfig {
  provider: ProviderName
  workspacePath: string | null
  theme: ThemeName
  onboardingComplete: boolean
  soundsEnabled: boolean
  manualLift: number
  manualSpread: number
  agentAnchors: AgentAnchorMap
}

export interface RendererSnapshot {
  config: AppConfig
  agents: AgentSnapshot[]
  availableThemes: ThemeName[]
  providers: Record<ProviderName, {
    installed: boolean
    path: string | null
    label: string
  }>
  activeProvider: {
    name: ProviderName
    label: string
  }
  completionPulseId: number
}

export interface PromptResult {
  ok: boolean
  error: string
}

export interface ChooseWorkspaceResult {
  path: string | null
}

declare global {
  interface Window {
    lilAgents: {
      getState: () => Promise<RendererSnapshot>
      onState: (listener: (snapshot: RendererSnapshot) => void) => () => void
      togglePopover: (agentId: number) => Promise<void>
      sendPrompt: (agentId: number, text: string) => Promise<PromptResult>
      clearHistory: (agentId: number) => Promise<void>
      completeOnboarding: () => Promise<void>
      openSettings: () => Promise<void>
      chooseWorkspace: () => Promise<ChooseWorkspaceResult>
      updateConfig: (patch: Partial<AppConfig>) => Promise<void>
      revealAgents: () => Promise<void>
      startAgentDrag: (agentId: number, pointerOffsetX: number) => Promise<void>
      moveAgentDrag: (agentId: number, screenX: number) => Promise<void>
      endAgentDrag: (agentId: number) => Promise<void>
    }
  }
}
