import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  ChooseWorkspaceResult,
  PromptResult,
  RendererSnapshot,
} from '../src/lib/types'

contextBridge.exposeInMainWorld('lilAgents', {
  getState: () => ipcRenderer.invoke('state:get') as Promise<RendererSnapshot>,
  onState: (listener: (snapshot: RendererSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: RendererSnapshot) => {
      listener(snapshot)
    }
    ipcRenderer.on('state:update', wrapped)

    return () => {
      ipcRenderer.removeListener('state:update', wrapped)
    }
  },
  togglePopover: (agentId: number) => ipcRenderer.invoke('agent:toggle-popover', agentId) as Promise<void>,
  sendPrompt: (agentId: number, text: string) =>
    ipcRenderer.invoke('chat:send', { agentId, text }) as Promise<PromptResult>,
  clearHistory: (agentId: number) => ipcRenderer.invoke('chat:clear', agentId) as Promise<void>,
  completeOnboarding: () => ipcRenderer.invoke('app:complete-onboarding') as Promise<void>,
  openSettings: () => ipcRenderer.invoke('app:open-settings') as Promise<void>,
  chooseWorkspace: () => ipcRenderer.invoke('app:choose-workspace') as Promise<ChooseWorkspaceResult>,
  updateConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke('config:update', patch) as Promise<void>,
  revealAgents: () => ipcRenderer.invoke('app:reveal-agents') as Promise<void>,
  startAgentDrag: (agentId: number, pointerOffsetX: number) =>
    ipcRenderer.invoke('agent:drag-start', { agentId, pointerOffsetX }) as Promise<void>,
  moveAgentDrag: (agentId: number, screenX: number) =>
    ipcRenderer.invoke('agent:drag-move', { agentId, screenX }) as Promise<void>,
  endAgentDrag: (agentId: number) => ipcRenderer.invoke('agent:drag-end', agentId) as Promise<void>,
})
