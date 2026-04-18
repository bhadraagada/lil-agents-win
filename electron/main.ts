import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, screen, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AgentSize, AppConfig, AgentSnapshot, ProviderName, RendererSnapshot, TranscriptMessage, ThemeName } from '../src/lib/types'
import { appIcon, defaultAgentCenterX, resolveAgentY, runtimeIconPath, selectDisplay, shouldHideDockIcon, trayIconSize } from './platform'
import { findBinary, resolveProcessEnvironment } from './shellEnvironment'

const { autoUpdater } = electronUpdater

const devServerUrl = process.env.VITE_DEV_SERVER_URL || ''
const isDev = Boolean(devServerUrl)
const availableThemes: ThemeName[] = ['Peach', 'Midnight', 'Cloud', 'Moss']
const availableProviders: ProviderName[] = ['claude', 'codex', 'copilot', 'gemini', 'opencode']
const thinkingPhrases = ['thinking...', 'working on it', 'one sec...', 'checking files', 'running tools']
const completionPhrases = ['done!', 'all set!', 'ready', 'check it out']
const popoverSize = { width: 520, height: 500 }
const videoDurationMs = 10040
const accelStartMs = 3000
const fullSpeedStartMs = 3750
const decelStartMs = 7500
const walkStopMs = 8250

function defaultProviderModels(): Record<ProviderName, string> {
  return {
    claude: '',
    codex: '',
    copilot: '',
    gemini: '',
    opencode: '',
  }
}

function defaultAgentProviders(defaultProvider: ProviderName): Record<string, ProviderName> {
  return {
    Bruce: defaultProvider,
    Jazz: defaultProvider,
  }
}

function defaultAgentSizes(): Record<string, AgentSize> {
  return {
    Bruce: 'large',
    Jazz: 'large',
  }
}

function defaultAgentVisibility(): Record<string, boolean> {
  return {
    Bruce: true,
    Jazz: true,
  }
}

function agentDimensions(size: AgentSize) {
  switch (size) {
    case 'small':
      return { width: 88, height: 100 }
    case 'medium':
      return { width: 114, height: 130 }
    case 'large':
    default:
      return { width: 140, height: 160 }
  }
}

type BubbleState = {
  text: string
  kind: 'thinking' | 'completion'
  expiresAt: number | null
}

type RuntimeAgent = {
  id: number
  name: string
  variant: 'bruce' | 'jazz'
  provider: ProviderName
  size: AgentSize
  isVisible: boolean
  accent: string
  x: number
  y: number
  anchorX: number
  direction: 1 | -1
  trackStart: number
  trackEnd: number
  pauseUntil: number
  walkStartTime: number
  walkStartX: number
  walkEndX: number
  dragPointerOffsetX: number
  isBusy: boolean
  isWalking: boolean
  isDragging: boolean
  walkCycleId: number
  isPopoverVisible: boolean
  history: TranscriptMessage[]
  bubble: BubbleState | null
  bubblePhraseDeadline: number
}

type AppState = {
  config: AppConfig
  providerPaths: Record<ProviderName, string | null>
  tray: Tray | null
  completionPulseId: number
  settingsWindow: BrowserWindow | null
  agentWindows: Map<number, BrowserWindow>
  popoverWindows: Map<number, BrowserWindow>
  bubbleWindows: Map<number, BrowserWindow>
  agents: RuntimeAgent[]
  animationTimer: NodeJS.Timeout | null
}

const initialConfig = readConfig()

const state: AppState = {
  config: initialConfig,
  providerPaths: {
    claude: null,
    codex: null,
    copilot: null,
    gemini: null,
    opencode: null,
  },
  tray: null,
  completionPulseId: 0,
  settingsWindow: null,
  agentWindows: new Map(),
  popoverWindows: new Map(),
  bubbleWindows: new Map(),
  agents: [
    createRuntimeAgent(0, 'Bruce', 'bruce', '#44a86a', 0.3, initialConfig),
    createRuntimeAgent(1, 'Jazz', 'jazz', '#ff7b2f', 0.7, initialConfig),
  ],
  animationTimer: null,
}

let isQuitting = false
let autoUpdaterConfigured = false
let manualUpdateCheckInFlight = false
let promptedUpdateVersion: string | null = null
let updateDownloadInFlight = false

function windowWebPreferences() {
  return {
    preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  }
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

if (isDev) {
  const devPathName = process.platform === 'darwin' ? 'lil-agents-desktop-dev' : 'lil-agents-win-dev'
  app.setPath('userData', path.join(app.getPath('appData'), devPathName))
  app.setPath('sessionData', path.join(app.getPath('appData'), `${devPathName}-session`))
}

if (process.platform === 'win32') {
  app.setAppUserModelId(isDev ? 'xyz.lilagents.win.dev' : 'xyz.lilagents.win')
}

if (!isDev) {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  }

  app.on('second-instance', () => {
    showSettingsWindow()
  })
}

app.whenReady().then(async () => {
  await resolveProcessEnvironment()
  const resolvedPaths = await Promise.all(availableProviders.map((provider) => ensureProviderPath(provider)))
  for (const [index, provider] of availableProviders.entries()) {
    state.providerPaths[provider] = resolvedPaths[index]
  }

  if (shouldHideDockIcon()) {
    app.setActivationPolicy('accessory')
    app.dock?.hide()
  }

  setupAutoUpdater()
  syncAgentsFromConfig()
  createTray()
  createAgentWindows()
  createSettingsWindow()
  updateAllWindowPositions(true)
  startAnimationLoop()
  attachScreenListeners()
  broadcastState()

  if (!isDev && app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates(false)
    }, 12000)
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

ipcMain.handle('state:get', () => buildSnapshot())

ipcMain.handle('agent:toggle-popover', async (_event, agentId: number) => {
  const agent = getAgent(agentId)
  if (!agent) {
    return
  }

  if (agent.isPopoverVisible) {
    closePopover(agentId)
  } else {
    openPopover(agentId)
  }
})

ipcMain.handle('chat:send', async (_event, payload: { agentId: number; text: string }) => {
  const agent = getAgent(payload.agentId)
  if (!agent) {
    return { ok: false, error: 'agent not found' }
  }

  const provider = agent.provider
  const providerLabel = providerDisplayName(provider)

  if (agent.isBusy) {
    return { ok: false, error: `${providerLabel} is already working.` }
  }

  const workspacePath = await ensureWorkspacePath()
  if (!workspacePath) {
    return { ok: false, error: 'workspace selection was cancelled' }
  }

  const providerPath = await ensureProviderPath(provider)

  if (!providerPath) {
    const errorMessage = `${providerLabel} CLI was not found on PATH. Install it first, then reopen the app.`
    pushMessage(agent, 'error', errorMessage)
    broadcastState()
    return { ok: false, error: errorMessage }
  }

  const runtimeEnvironment = await resolveProcessEnvironment()

  switch (provider) {
    case 'claude':
      await runClaudeTurn(agent, payload.text, workspacePath, providerPath, configuredModel(provider), runtimeEnvironment)
      break
    case 'copilot':
      await runCopilotTurn(agent, payload.text, workspacePath, providerPath, configuredModel(provider), runtimeEnvironment)
      break
    case 'gemini':
      await runGeminiTurn(agent, payload.text, workspacePath, providerPath, configuredModel(provider), runtimeEnvironment)
      break
    case 'opencode':
      await runOpenCodeTurn(agent, payload.text, workspacePath, providerPath, configuredModel(provider), runtimeEnvironment)
      break
    case 'codex':
    default:
      await runCodexTurn(agent, payload.text, workspacePath, providerPath, configuredModel(provider), runtimeEnvironment)
      break
  }

  return { ok: true, error: '' }
})

ipcMain.handle('chat:clear', (_event, agentId: number) => {
  const agent = getAgent(agentId)
  if (!agent) {
    return
  }

  agent.history = []
  broadcastState()
})

ipcMain.handle('app:complete-onboarding', () => {
  updateConfig({ onboardingComplete: true })
})

ipcMain.handle('app:open-settings', () => {
  showSettingsWindow()
})

ipcMain.handle('app:open-external', (_event, url: string) => {
  return shell.openExternal(url)
})

ipcMain.handle('app:choose-workspace', async () => {
  const path = await chooseWorkspacePath()
  return { path }
})

ipcMain.handle('config:update', (_event, patch: Partial<AppConfig>) => {
  updateConfig(patch)
})

ipcMain.handle('app:reveal-agents', () => {
  updateConfig({
    visibleAgents: Object.fromEntries(state.agents.map((agent) => [agent.name, true])),
  })
  updateAllWindowPositions(true)
})

ipcMain.handle('agent:drag-start', (_event, payload: { agentId: number; pointerOffsetX: number }) => {
  const agent = getAgent(payload.agentId)
  if (!agent) {
    return
  }

  agent.dragPointerOffsetX = payload.pointerOffsetX
  agent.isDragging = true
  agent.isWalking = false
  agent.pauseUntil = Date.now() + 4000
  syncAttachedWindows(agent)
  broadcastState()
})

ipcMain.handle('agent:drag-move', (_event, payload: { agentId: number; screenX: number }) => {
  const agent = getAgent(payload.agentId)
  if (!agent || !agent.isDragging) {
    return
  }

  const activeDisplay = selectedDisplay()
  const workArea = activeDisplay.workArea
  const size = agentDimensions(agent.size)
  const left = clamp(payload.screenX - agent.dragPointerOffsetX, workArea.x, workArea.x + workArea.width - size.width)
  const center = left + size.width / 2
  setAgentAnchor(agent, center)
  agent.x = left
  syncAttachedWindows(agent)
})

ipcMain.handle('agent:drag-end', (_event, agentId: number) => {
  const agent = getAgent(agentId)
  if (!agent) {
    return
  }

  agent.isDragging = false
  agent.isWalking = false
  agent.pauseUntil = Date.now() + 2500
  updateConfig({
    agentAnchors: {
      ...state.config.agentAnchors,
      [agent.name]: agent.anchorX,
    },
  })
})

async function runCodexTurn(agent: RuntimeAgent, text: string, workspacePath: string, codexPath: string, model: string | null, runtimeEnvironment: NodeJS.ProcessEnv) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const args = ['exec', '--json', '--full-auto', '--skip-git-repo-check']
  if (model) {
    args.push('--model', model)
  }
  args.push(prompt)

  const child = spawn(codexPath, args, {
    cwd: workspacePath,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuffer = ''
  let sawAssistantText = false

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()

    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        sawAssistantText = parseCodexLine(agent, line) || sawAssistantText
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk) => {
    const textChunk = chunk.toString().trim()
    if (textChunk && textChunk !== 'Reading additional input from stdin...') {
      pushMessage(agent, 'error', textChunk)
      broadcastState()
    }
  })

  child.on('close', () => {
    agent.isBusy = false

    if (!sawAssistantText) {
      pushMessage(agent, 'system', 'Codex finished without a readable assistant message in the JSON stream.')
    }

    const completionText = randomItem(completionPhrases)
    setBubble(agent, completionText, 'completion', Date.now() + 3200)
    state.completionPulseId += 1

    broadcastState()
  })
}

async function runClaudeTurn(agent: RuntimeAgent, text: string, workspacePath: string, claudePath: string, model: string | null, runtimeEnvironment: NodeJS.ProcessEnv) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
  if (model) {
    args.push('--model', model)
  }

  const child = spawn(claudePath, args, {
    cwd: workspacePath,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuffer = ''
  const streamState = {
    assistantText: '',
    sawAssistantText: false,
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()

    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        parseClaudeLine(agent, line, streamState)
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk) => {
    const textChunk = chunk.toString().trim()
    if (textChunk) {
      pushMessage(agent, 'error', textChunk)
      broadcastState()
    }
  })

  child.on('close', () => {
    agent.isBusy = false

    if (!streamState.sawAssistantText) {
      const fallback = streamState.assistantText.trim()
      if (fallback) {
        pushMessage(agent, 'assistant', fallback)
      } else {
        pushMessage(agent, 'system', 'Claude finished without a readable assistant message in the JSON stream.')
      }
    }

    const completionText = randomItem(completionPhrases)
    setBubble(agent, completionText, 'completion', Date.now() + 3200)
    state.completionPulseId += 1

    broadcastState()
  })
}

async function runCopilotTurn(agent: RuntimeAgent, text: string, workspacePath: string, copilotPath: string, model: string | null, runtimeEnvironment: NodeJS.ProcessEnv) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const args = ['-p', prompt, '--output-format', 'json', '--allow-all']
  if (model) {
    args.push('--model', model)
  }

  const child = spawn(copilotPath, args, {
    cwd: workspacePath,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuffer = ''
  let plainText = ''
  const streamState = {
    assistantText: '',
    sawAssistantText: false,
    useJson: true,
  }

  child.stdout.on('data', (chunk) => {
    const textChunk = chunk.toString()

    if (!streamState.useJson) {
      plainText += textChunk
      return
    }

    stdoutBuffer += textChunk
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line && !parseCopilotLine(agent, line, streamState)) {
        streamState.useJson = false
        plainText += `${line}\n${stdoutBuffer}`
        stdoutBuffer = ''
        break
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk) => {
    const textChunk = chunk.toString().trim()
    if (textChunk) {
      pushMessage(agent, 'error', textChunk)
      broadcastState()
    }
  })

  child.on('close', () => {
    agent.isBusy = false

    if (streamState.useJson && stdoutBuffer.trim()) {
      parseCopilotLine(agent, stdoutBuffer.trim(), streamState)
    }

    if (!streamState.sawAssistantText) {
      const fallback = streamState.assistantText.trim() || plainText.trim()
      if (fallback) {
        pushMessage(agent, 'assistant', fallback)
      } else {
        pushMessage(agent, 'system', 'Copilot finished without a readable assistant message.')
      }
    }

    const completionText = randomItem(completionPhrases)
    setBubble(agent, completionText, 'completion', Date.now() + 3200)
    state.completionPulseId += 1

    broadcastState()
  })
}

async function runGeminiTurn(agent: RuntimeAgent, text: string, workspacePath: string, geminiPath: string, model: string | null, runtimeEnvironment: NodeJS.ProcessEnv) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const args = ['--yolo']
  if (model) {
    args.push('--model', model)
  }
  args.push('-p', prompt)

  const child = spawn(geminiPath, args, {
    cwd: workspacePath,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuffer = ''
  let plainText = ''
  const streamState = {
    assistantText: '',
    sawAssistantText: false,
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()

    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        if (!parseGeminiLine(agent, line, streamState)) {
          plainText += `${line}\n`
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk) => {
    const textChunk = chunk.toString()
    if (!isGeminiNoise(textChunk)) {
      const trimmed = textChunk.trim()
      if (trimmed) {
        pushMessage(agent, 'error', trimmed)
        broadcastState()
      }
    }
  })

  child.on('close', () => {
    agent.isBusy = false

    if (stdoutBuffer.trim() && !parseGeminiLine(agent, stdoutBuffer.trim(), streamState)) {
      plainText += stdoutBuffer.trim()
    }

    if (!streamState.sawAssistantText) {
      const fallback = streamState.assistantText.trim() || plainText.trim()
      if (fallback) {
        pushMessage(agent, 'assistant', fallback)
      } else {
        pushMessage(agent, 'system', 'Gemini finished without a readable assistant message.')
      }
    }

    const completionText = randomItem(completionPhrases)
    setBubble(agent, completionText, 'completion', Date.now() + 3200)
    state.completionPulseId += 1

    broadcastState()
  })
}

async function runOpenCodeTurn(agent: RuntimeAgent, text: string, workspacePath: string, openCodePath: string, model: string | null, runtimeEnvironment: NodeJS.ProcessEnv) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const args = ['run']
  if (model) {
    args.push('--model', model)
  }
  args.push(prompt, '--format', 'json')

  const child = spawn(openCodePath, args, {
    cwd: workspacePath,
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuffer = ''
  const streamState = {
    assistantText: '',
    sawAssistantText: false,
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()

    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        parseOpenCodeLine(agent, line, streamState)
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk) => {
    const textChunk = chunk.toString().trim()
    if (textChunk) {
      pushMessage(agent, 'error', textChunk)
      broadcastState()
    }
  })

  child.on('close', () => {
    agent.isBusy = false

    if (stdoutBuffer.trim()) {
      parseOpenCodeLine(agent, stdoutBuffer.trim(), streamState)
    }

    if (!streamState.sawAssistantText) {
      const fallback = streamState.assistantText.trim()
      if (fallback) {
        pushMessage(agent, 'assistant', fallback)
      } else {
        pushMessage(agent, 'system', 'OpenCode finished without a readable assistant message.')
      }
    }

    const completionText = randomItem(completionPhrases)
    setBubble(agent, completionText, 'completion', Date.now() + 3200)
    state.completionPulseId += 1

    broadcastState()
  })
}

function parseCodexLine(agent: RuntimeAgent, line: string) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return false
  }

  const type = typeof parsed.type === 'string' ? parsed.type : ''

  if (type === 'item.started') {
    const item = parsed.item as Record<string, unknown> | undefined
    if (item?.type === 'command_execution') {
      const command = typeof item.command === 'string' ? item.command : 'running command'
      pushMessage(agent, 'toolUse', `BASH ${command}`)
      broadcastState()
    }
    return false
  }

  if (type === 'item.completed') {
    const item = parsed.item as Record<string, unknown> | undefined
    if (!item) {
      return false
    }

    if (item.type === 'agent_message') {
      const message = typeof item.text === 'string' ? item.text.trim() : ''
      if (message) {
        pushMessage(agent, 'assistant', message)
        broadcastState()
        return true
      }
    }

    if (item.type === 'command_execution') {
      const command = typeof item.command === 'string' ? item.command : 'command'
      const status = typeof item.status === 'string' ? item.status : 'done'
      pushMessage(agent, 'toolResult', `${status.toUpperCase()} ${command}`)
      broadcastState()
    }

    if (item.type === 'file_change') {
      const filePath = typeof item.file === 'string' ? item.file : typeof item.path === 'string' ? item.path : 'file changed'
      pushMessage(agent, 'toolResult', `UPDATED ${filePath}`)
      broadcastState()
    }
  }

  if (type === 'turn.failed' || type === 'error') {
    const message = typeof parsed.message === 'string' ? parsed.message : 'Codex turn failed'
    pushMessage(agent, 'error', message)
    broadcastState()
  }

  return false
}

function parseClaudeLine(
  agent: RuntimeAgent,
  line: string,
  streamState: { assistantText: string; sawAssistantText: boolean },
) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }

  const type = typeof parsed.type === 'string' ? parsed.type : ''

  if (type === 'assistant') {
    const message = parsed.message as Record<string, unknown> | undefined
    const content = Array.isArray(message?.content) ? message?.content as Record<string, unknown>[] : []
    for (const block of content) {
      const blockType = typeof block.type === 'string' ? block.type : ''
      if (blockType === 'text') {
        const text = typeof block.text === 'string' ? block.text : ''
        if (text) {
          streamState.assistantText += text
        }
      }

      if (blockType === 'tool_use') {
        const toolName = typeof block.name === 'string' ? block.name : 'Tool'
        const input = (block.input && typeof block.input === 'object' ? block.input : {}) as Record<string, unknown>
        pushMessage(agent, 'toolUse', `${toolName} ${formatClaudeToolSummary(toolName, input)}`.trim())
        broadcastState()
      }
    }
    return
  }

  if (type === 'user') {
    const message = parsed.message as Record<string, unknown> | undefined
    const content = Array.isArray(message?.content) ? message?.content as Record<string, unknown>[] : []
    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue
      }

      const toolResult = block.content
      let summary = ''

      if (typeof toolResult === 'string') {
        summary = toolResult.trim()
      } else if (Array.isArray(toolResult)) {
        summary = toolResult
          .map((item) => (item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string'
            ? (item as Record<string, unknown>).text as string
            : ''))
          .filter(Boolean)
          .join(' ')
          .trim()
      }

      const isError = Boolean(block.is_error)
      pushMessage(agent, 'toolResult', summary ? summary : isError ? 'Tool failed' : 'Tool finished')
      broadcastState()
    }
    return
  }

  if (type === 'result') {
    const result = typeof parsed.result === 'string' ? parsed.result.trim() : ''
    const finalText = result || streamState.assistantText.trim()
    if (finalText) {
      pushMessage(agent, 'assistant', finalText)
      streamState.sawAssistantText = true
      streamState.assistantText = ''
      broadcastState()
    }
    return
  }

  if (type === 'error') {
    const message = typeof parsed.message === 'string' ? parsed.message : 'Claude turn failed'
    pushMessage(agent, 'error', message)
    broadcastState()
  }
}

function formatClaudeToolSummary(toolName: string, input: Record<string, unknown>) {
  switch (toolName) {
    case 'Bash':
      return typeof input.command === 'string' ? input.command : ''
    case 'Read':
    case 'Edit':
    case 'Write':
      return typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.filePath === 'string'
          ? input.filePath
          : ''
    case 'Glob':
    case 'Grep':
      return typeof input.pattern === 'string' ? input.pattern : ''
    default:
      return typeof input.description === 'string' ? input.description : ''
  }
}

function parseCopilotLine(
  agent: RuntimeAgent,
  line: string,
  streamState: { assistantText: string; sawAssistantText: boolean; useJson: boolean },
) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return false
  }

  if (parsed.ephemeral === true) {
    const type = typeof parsed.type === 'string' ? parsed.type : ''
    const data = (parsed.data && typeof parsed.data === 'object' ? parsed.data : {}) as Record<string, unknown>
    if (type === 'assistant.message_delta' && typeof data.deltaContent === 'string') {
      streamState.assistantText += data.deltaContent
    }
    return true
  }

  const type = typeof parsed.type === 'string' ? parsed.type : ''
  const data = (parsed.data && typeof parsed.data === 'object' ? parsed.data : {}) as Record<string, unknown>

  switch (type) {
    case 'assistant.message': {
      const content = typeof data.content === 'string' ? data.content : ''
      if (content) {
        streamState.assistantText = content
      }
      return true
    }
    case 'assistant.turn_end':
    case 'result': {
      const finalText = streamState.assistantText.trim()
      if (finalText) {
        pushMessage(agent, 'assistant', finalText)
        streamState.assistantText = ''
        streamState.sawAssistantText = true
        broadcastState()
      }
      return true
    }
    case 'assistant.tool_call': {
      const toolName = typeof data.name === 'string' ? data.name : typeof data.tool === 'string' ? data.tool : 'Tool'
      const input = ((data.input && typeof data.input === 'object' ? data.input : data.arguments) ?? {}) as Record<string, unknown>
      const command = typeof input.command === 'string' ? input.command : ''
      const displayName = command ? 'Bash' : toolName
      const summary = command || toolName
      pushMessage(agent, 'toolUse', `${displayName} ${summary}`.trim())
      broadcastState()
      return true
    }
    case 'assistant.tool_result': {
      const output = typeof data.output === 'string' ? data.output : typeof data.result === 'string' ? data.result : ''
      const isError = Boolean(data.is_error) || data.status === 'error'
      pushMessage(agent, 'toolResult', output ? String(output.slice(0, 80)) : isError ? 'Tool failed' : 'Tool finished')
      broadcastState()
      return true
    }
    case 'error': {
      const message = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : 'Copilot turn failed'
      pushMessage(agent, 'error', message)
      broadcastState()
      return true
    }
    default:
      return true
  }
}

function parseGeminiLine(
  agent: RuntimeAgent,
  line: string,
  streamState: { assistantText: string; sawAssistantText: boolean },
) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return false
  }

  const type = typeof parsed.type === 'string' ? parsed.type : typeof parsed.event === 'string' ? parsed.event : ''
  const data = (parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed) as Record<string, unknown>

  switch (type) {
    case 'content':
    case 'text':
    case 'delta':
    case 'message': {
      const text = typeof data.text === 'string'
        ? data.text
        : typeof data.content === 'string'
          ? data.content
          : typeof parsed.text === 'string'
            ? parsed.text
            : ''
      if (text) {
        const isDelta = Boolean(parsed.delta)
        streamState.assistantText = isDelta ? `${streamState.assistantText}${text}` : text
      }
      return true
    }
    case 'tool_call':
    case 'function_call':
    case 'tool_use': {
      const toolName = typeof data.name === 'string' ? data.name : typeof parsed.tool_name === 'string' ? parsed.tool_name : 'Tool'
      if (toolName === 'activate_skill') {
        return true
      }
      const input = ((data.input && typeof data.input === 'object' ? data.input : data.arguments) ?? parsed.parameters ?? {}) as Record<string, unknown>
      pushMessage(agent, 'toolUse', `${toolName} ${formatGeminiToolSummary(toolName, input)}`.trim())
      broadcastState()
      return true
    }
    case 'tool_result':
    case 'function_result': {
      const output = typeof data.output === 'string'
        ? data.output
        : typeof data.result === 'string'
          ? data.result
          : typeof parsed.output === 'string'
            ? parsed.output
            : ''
      const isError = Boolean(data.is_error) || parsed.status === 'error'
      pushMessage(agent, 'toolResult', output ? String(output.slice(0, 80)) : isError ? 'Tool failed' : 'Tool finished')
      broadcastState()
      return true
    }
    case 'done':
    case 'end':
    case 'complete':
    case 'turn_end':
    case 'result': {
      const result = typeof parsed.result === 'string' ? parsed.result : typeof data.text === 'string' ? data.text : ''
      const finalText = (result || streamState.assistantText).trim()
      if (finalText) {
        pushMessage(agent, 'assistant', finalText)
        streamState.assistantText = ''
        streamState.sawAssistantText = true
        broadcastState()
      }
      return true
    }
    case 'error': {
      const message = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : 'Gemini turn failed'
      pushMessage(agent, 'error', message)
      broadcastState()
      return true
    }
    default: {
      const text = typeof parsed.text === 'string' ? parsed.text : typeof parsed.content === 'string' ? parsed.content : ''
      if (text) {
        streamState.assistantText += text
      }
      return true
    }
  }
}

function formatGeminiToolSummary(toolName: string, input: Record<string, unknown>) {
  switch (toolName) {
    case 'run_shell_command':
      return typeof input.command === 'string' ? input.command : ''
    case 'read_file':
    case 'replace':
    case 'write_file':
      return typeof input.file_path === 'string' ? input.file_path : ''
    case 'glob':
    case 'grep_search':
      return typeof input.pattern === 'string' ? input.pattern : ''
    default:
      return typeof input.description === 'string' ? input.description : ''
  }
}

function isGeminiNoise(text: string) {
  const trimmed = text.trim()
  return (
    !trimmed
    || trimmed.startsWith('✓')
    || trimmed.startsWith('→')
    || trimmed.startsWith('◆')
    || trimmed.startsWith('⠋')
    || trimmed.startsWith('⠙')
    || trimmed.startsWith('⠹')
    || trimmed.startsWith('⠸')
    || trimmed.startsWith('⠼')
    || trimmed.startsWith('⠴')
    || trimmed.startsWith('⠦')
    || trimmed.startsWith('⠧')
    || trimmed.startsWith('⠇')
    || trimmed.startsWith('⠏')
    || text.includes('Keychain initialization encountered an error')
  )
}

function parseOpenCodeLine(
  agent: RuntimeAgent,
  line: string,
  streamState: { assistantText: string; sawAssistantText: boolean },
) {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }

  const type = typeof parsed.type === 'string' ? parsed.type : ''

  switch (type) {
    case 'text': {
      const part = (parsed.part && typeof parsed.part === 'object' ? parsed.part : {}) as Record<string, unknown>
      const text = typeof part.text === 'string' ? part.text : ''
      if (text) {
        streamState.assistantText += text
      }
      return
    }
    case 'assistant.tool_call': {
      const part = (parsed.part && typeof parsed.part === 'object' ? parsed.part : {}) as Record<string, unknown>
      const toolName = typeof part.name === 'string' ? part.name : 'Tool'
      pushMessage(agent, 'toolUse', toolName)
      broadcastState()
      return
    }
    case 'assistant.tool_result': {
      const part = (parsed.part && typeof parsed.part === 'object' ? parsed.part : {}) as Record<string, unknown>
      const output = typeof part.result === 'string' ? part.result : ''
      const isError = part.status === 'error'
      pushMessage(agent, 'toolResult', output ? String(output.slice(0, 80)) : isError ? 'Tool failed' : 'Tool finished')
      broadcastState()
      return
    }
    case 'result': {
      const finalText = streamState.assistantText.trim()
      if (finalText) {
        pushMessage(agent, 'assistant', finalText)
        streamState.assistantText = ''
        streamState.sawAssistantText = true
        broadcastState()
      }
      return
    }
    case 'error': {
      const message = typeof parsed.message === 'string' ? parsed.message : 'OpenCode turn failed'
      pushMessage(agent, 'error', message)
      broadcastState()
    }
  }
}

function buildCodexPrompt(agent: RuntimeAgent, history: TranscriptMessage[], latestUserMessage: string) {
  const persona = buildAgentPersona(agent)

  const formatted = history
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.text}`)
    .join('\n\n')

  if (!formatted) {
    return `${persona}\n\nUser: ${latestUserMessage}`
  }

  return `${persona}\n\nConversation so far:\n\n${formatted}\n\n---\n\nUser follow-up: ${latestUserMessage}`
}

function buildAgentPersona(agent: RuntimeAgent) {
  const shared = [
    `You are ${agent.name}, one of the lil agents desktop buddies.`,
    'Talk like a friendly companion who lives on the user\'s taskbar and helps with code and workspace tasks.',
    'Be warm, casual, and natural. Keep everyday chat short and human.',
    'Do not call yourself Codex or an AI assistant unless the user directly asks about the underlying tool.',
    `If the user asks who you are, say you are ${agent.name}, their desktop coding buddy.`,
    'When the user needs real technical help, stay precise and useful without dropping the friendly tone.',
  ]

  if (agent.variant === 'bruce') {
    return [
      ...shared,
      'Bruce sounds calm, grounded, and quietly encouraging.',
      'Bruce uses light humor, avoids hype, and feels dependable.',
    ].join('\n')
  }

  return [
    ...shared,
    'Jazz sounds upbeat, playful, and a little cheeky without becoming annoying.',
    'Jazz can use casual phrasing, but should still be clear and helpful.',
  ].join('\n')
}

function startAnimationLoop() {
  if (state.animationTimer) {
    clearInterval(state.animationTimer)
  }

  state.animationTimer = setInterval(() => {
    const now = Date.now()

    let shouldBroadcast = false

    for (const agent of state.agents) {
      const wasWalking = agent.isWalking
      const previousDirection = agent.direction

      if (!agent.isVisible) {
        agent.isWalking = false
        syncAttachedWindows(agent)
        continue
      }

      if (agent.isBusy && now >= agent.bubblePhraseDeadline) {
        setBubble(agent, randomItem(thinkingPhrases), 'thinking')
        agent.bubblePhraseDeadline = now + 3200
        shouldBroadcast = true
      }

      if (agent.bubble?.expiresAt && now >= agent.bubble.expiresAt) {
        agent.bubble = null
        shouldBroadcast = true
      }

      if (agent.isDragging) {
        syncAttachedWindows(agent)
        continue
      }

      if (now < agent.pauseUntil) {
        agent.isWalking = false
        if (agent.isWalking !== wasWalking) {
          shouldBroadcast = true
        }
        syncAttachedWindows(agent)
        continue
      }

      if (!agent.isWalking) {
        startWalk(agent, now)
        shouldBroadcast = true
      }

      const elapsed = now - agent.walkStartTime
      const walkNorm = elapsed >= videoDurationMs ? 1 : movementPosition(elapsed)
      agent.x = agent.walkStartX + (agent.walkEndX - agent.walkStartX) * walkNorm

      if (elapsed >= videoDurationMs) {
        agent.x = agent.walkEndX
        enterPause(agent, now)
        shouldBroadcast = true
      }

      if (agent.isWalking !== wasWalking || agent.direction !== previousDirection) {
        shouldBroadcast = true
      }

      syncAttachedWindows(agent)
    }

    if (shouldBroadcast) {
      broadcastState()
    }
  }, 1000 / 30)
}

function syncAttachedWindows(agent: RuntimeAgent) {
  const size = agentDimensions(agent.size)
  const agentWindow = state.agentWindows.get(agent.id)
  if (agentWindow) {
    agentWindow.setBounds({ x: Math.round(agent.x), y: Math.round(agent.y), ...size })
    if (agent.isVisible) {
      if (!agentWindow.isVisible()) {
        agentWindow.showInactive()
      }
    } else if (agentWindow.isVisible()) {
      agentWindow.hide()
    }
  }

  const bubbleWindow = state.bubbleWindows.get(agent.id)
  if (bubbleWindow) {
    if (agent.isVisible && agent.bubble && !agent.isPopoverVisible) {
      const width = Math.max(90, agent.bubble.text.length * 8 + 28)
      bubbleWindow.setBounds({
        x: Math.round(agent.x + size.width / 2 - width / 2),
        y: Math.round(agent.y - 38),
        width,
        height: 34,
      })
      if (!bubbleWindow.isVisible()) {
        bubbleWindow.showInactive()
      }
    } else if (bubbleWindow.isVisible()) {
      bubbleWindow.hide()
    }
  }

  const popoverWindow = state.popoverWindows.get(agent.id)
  if (popoverWindow?.isVisible()) {
    popoverWindow.setBounds({
      x: Math.round(agent.x + size.width / 2 - popoverSize.width / 2),
      y: Math.round(agent.y - popoverSize.height + 12),
      ...popoverSize,
    })
    if (!agent.isVisible) {
      popoverWindow.hide()
    }
  }
}

function createAgentWindows() {
  const windowIconPath = runtimeIconPath(app.getAppPath()) ?? undefined

  for (const agent of state.agents) {
    const size = agentDimensions(agent.size)
    const agentWindow = new BrowserWindow({
      ...size,
      x: Math.round(agent.x),
      y: Math.round(agent.y),
      icon: windowIconPath,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      show: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: windowWebPreferences(),
    })
    agentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    if (!agent.isVisible) {
      agentWindow.hide()
    }
    loadWindow(agentWindow, `agent/${agent.id}`)
    state.agentWindows.set(agent.id, agentWindow)

    const popoverWindow = new BrowserWindow({
      ...popoverSize,
      show: false,
      icon: windowIconPath,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: windowWebPreferences(),
    })
    popoverWindow.setMenuBarVisibility(false)
    popoverWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    loadWindow(popoverWindow, `popover/${agent.id}`)
    state.popoverWindows.set(agent.id, popoverWindow)

    const bubbleWindow = new BrowserWindow({
      width: 120,
      height: 34,
      show: false,
      icon: windowIconPath,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      webPreferences: windowWebPreferences(),
    })
    bubbleWindow.setIgnoreMouseEvents(true)
    bubbleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    loadWindow(bubbleWindow, `bubble/${agent.id}`)
    state.bubbleWindows.set(agent.id, bubbleWindow)
  }
}

function createSettingsWindow() {
  if (state.settingsWindow) {
    return
  }

  state.settingsWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: '#111111',
    show: false,
    title: 'lil agents',
    icon: runtimeIconPath(app.getAppPath()) ?? undefined,
    webPreferences: windowWebPreferences(),
  })
  loadWindow(state.settingsWindow, 'settings')
  state.settingsWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      state.settingsWindow?.hide()
    }
  })
}

function createTray() {
  const size = trayIconSize()
  const icon = appIcon(app.getAppPath()).resize({ width: size, height: size })
  state.tray = new Tray(icon)
  state.tray.setToolTip('lil agents')
  updateTrayMenu()
  state.tray.on('double-click', () => showSettingsWindow())
}

function updateTrayMenu() {
  if (!state.tray) {
    return
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Open settings', click: () => showSettingsWindow() },
    { type: 'separator' },
    ...state.agents.map((agent) => ({
      label: agent.name,
      type: 'checkbox' as const,
      checked: agent.isVisible,
      click: () => {
        updateConfig({
          visibleAgents: {
            [agent.name]: !agent.isVisible,
          },
        })
      },
    })),
    { type: 'separator' },
    { label: 'Check for updates', click: () => void checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  state.tray.setContextMenu(menu)
}

function showSettingsWindow() {
  createSettingsWindow()
  if (process.platform === 'darwin') {
    app.focus({ steal: true })
  }
  state.settingsWindow?.show()
  state.settingsWindow?.focus()
}

function openPopover(agentId: number) {
  for (const other of state.agents) {
    if (other.id !== agentId) {
      closePopover(other.id)
    }
  }

  const agent = getAgent(agentId)
  const popoverWindow = state.popoverWindows.get(agentId)
  if (!agent || !popoverWindow) {
    return
  }

  agent.isPopoverVisible = true
  syncAttachedWindows(agent)
  popoverWindow.show()
  popoverWindow.focus()
  broadcastState()
}

function closePopover(agentId: number) {
  const agent = getAgent(agentId)
  const popoverWindow = state.popoverWindows.get(agentId)
  if (!agent || !popoverWindow) {
    return
  }

  agent.isPopoverVisible = false
  popoverWindow.hide()
  syncAttachedWindows(agent)
  broadcastState()
}

function loadWindow(window: BrowserWindow, route: string) {
  const distIndexPath = path.join(app.getAppPath(), 'dist', 'index.html')
  let didFallbackToDist = false

  const loadDist = () => {
    didFallbackToDist = true
    void window.loadFile(distIndexPath, { hash: `/${route}` })
  }

  window.webContents.once('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    const isDevNavigation = isDev && validatedURL.startsWith(devServerUrl)
    if (isDev && isDevNavigation && !didFallbackToDist) {
      loadDist()
      return
    }

    if (!isDev) {
      dialog.showErrorBox(
        'Renderer failed to load',
        `Could not load route "${route}".\n\nURL: ${validatedURL}\nError: ${errorDescription} (${errorCode})\n\nExpected file: ${distIndexPath}`,
      )
    }
  })

  if (isDev) {
    void window.loadURL(`${devServerUrl}/#/${route}`).catch(() => {
      if (!didFallbackToDist) {
        loadDist()
      }
    })
    return
  }

  loadDist()
}

function updateAllWindowPositions(forceShow = false) {
  const display = selectedDisplay()
  const centerX = defaultAgentCenterX(display)

  for (const [index, agent] of state.agents.entries()) {
    const size = agentDimensions(agent.size)
    const offset = index === 0 ? -state.config.manualSpread / 2 : state.config.manualSpread / 2
    const savedAnchor = state.config.agentAnchors[agent.name]
    const trackCenter = savedAnchor ?? agent.anchorX ?? centerX + offset
    setAgentAnchor(agent, trackCenter)
    if (forceShow || !Number.isFinite(agent.x)) {
      agent.x = agent.anchorX - size.width / 2
    }
    agent.x = clamp(agent.x, agent.trackStart, agent.trackEnd)
    agent.y = resolveAgentY(display, size.height, state.config.manualLift)
    syncAttachedWindows(agent)
  }
}

function buildSnapshot(): RendererSnapshot {
  const providers = Object.fromEntries(
    availableProviders.map((provider) => [
      provider,
      {
        installed: Boolean(state.providerPaths[provider]),
        path: state.providerPaths[provider],
        label: providerDisplayName(provider),
      },
    ]),
  ) as RendererSnapshot['providers']

  return {
    config: state.config,
    availableThemes,
    availableDisplays: screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: display.label || `Display ${index + 1}`,
    })),
    completionPulseId: state.completionPulseId,
    providers,
    activeProvider: {
      name: state.agents[0]?.provider ?? state.config.provider,
      label: providerDisplayName(state.agents[0]?.provider ?? state.config.provider),
    },
    agents: state.agents.map((agent): AgentSnapshot => ({
      id: agent.id,
      name: agent.name,
      variant: agent.variant,
      provider: agent.provider,
      size: agent.size,
      isVisible: agent.isVisible,
      accent: agent.accent,
      isBusy: agent.isBusy,
      isWalking: agent.isWalking,
      facing: agent.direction < 0 ? 'left' : 'right',
      walkCycleId: agent.walkCycleId,
      isPopoverVisible: agent.isPopoverVisible,
      history: agent.history,
      bubble: agent.bubble ? { text: agent.bubble.text, kind: agent.bubble.kind } : null,
    })),
  }
}

function broadcastState() {
  const snapshot = buildSnapshot()
  const windows = [state.settingsWindow, ...state.agentWindows.values(), ...state.popoverWindows.values(), ...state.bubbleWindows.values()]
  for (const window of windows) {
    window?.webContents.send('state:update', snapshot)
  }
}

function createRuntimeAgent(
  id: number,
  name: string,
  variant: 'bruce' | 'jazz',
  accent: string,
  progressSeed: number,
  config: AppConfig = state.config,
): RuntimeAgent {
  return {
    id,
    name,
    variant,
    provider: configuredAgentProvider(name, config),
    size: configuredAgentSize(name, config),
    isVisible: configuredAgentVisibility(name, config),
    accent,
    x: progressSeed * 100,
    y: 0,
    anchorX: 0,
    direction: id === 0 ? 1 : -1,
    trackStart: 0,
    trackEnd: 0,
    pauseUntil: Date.now() + id * 1400,
    walkStartTime: 0,
    walkStartX: 0,
    walkEndX: 0,
    dragPointerOffsetX: 0,
    isBusy: false,
    isWalking: false,
    isDragging: false,
    walkCycleId: 0,
    isPopoverVisible: false,
    history: [],
    bubble: null,
    bubblePhraseDeadline: 0,
  }
}

function startWalk(agent: RuntimeAgent, now: number) {
  agent.isWalking = true
  agent.walkCycleId += 1
  agent.walkStartTime = now

  if (agent.x >= agent.trackEnd - 30) {
    agent.direction = -1
  } else if (agent.x <= agent.trackStart + 30) {
    agent.direction = 1
  }

  const walkDistance = randomBetween(130, 220)
  agent.walkStartX = agent.x
  agent.walkEndX = clamp(agent.x + agent.direction * walkDistance, agent.trackStart, agent.trackEnd)

  if (Math.abs(agent.walkEndX - agent.x) < 12) {
    agent.direction = agent.direction === 1 ? -1 : 1
    agent.walkEndX = clamp(agent.x + agent.direction * walkDistance, agent.trackStart, agent.trackEnd)
  }
}

function enterPause(agent: RuntimeAgent, now: number) {
  agent.isWalking = false
  agent.pauseUntil = now + randomBetween(5000, 12000)
}

function movementPosition(videoTimeMs: number) {
  const dIn = fullSpeedStartMs - accelStartMs
  const dLin = decelStartMs - fullSpeedStartMs
  const dOut = walkStopMs - decelStartMs
  const v = 1 / (dIn / 2 + dLin + dOut / 2)

  if (videoTimeMs <= accelStartMs) {
    return 0
  }

  if (videoTimeMs <= fullSpeedStartMs) {
    const t = videoTimeMs - accelStartMs
    return (v * t * t) / (2 * dIn)
  }

  if (videoTimeMs <= decelStartMs) {
    const easeInDist = (v * dIn) / 2
    const t = videoTimeMs - fullSpeedStartMs
    return easeInDist + v * t
  }

  if (videoTimeMs <= walkStopMs) {
    const easeInDist = (v * dIn) / 2
    const linearDist = v * dLin
    const t = videoTimeMs - decelStartMs
    return easeInDist + linearDist + v * (t - (t * t) / (2 * dOut))
  }

  return 1
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function getAgent(agentId: number) {
  return state.agents.find((agent) => agent.id === agentId)
}

function setBubble(agent: RuntimeAgent, text: string, kind: 'thinking' | 'completion', expiresAt: number | null = null) {
  agent.bubble = { text, kind, expiresAt }
  agent.bubblePhraseDeadline = Date.now() + 3200
}

function pushMessage(agent: RuntimeAgent, role: TranscriptMessage['role'], text: string) {
  agent.history = [...agent.history, { id: `${Date.now()}-${Math.random()}`, role, text }]
}

function updateConfig(patch: Partial<AppConfig>) {
  state.config = {
    ...state.config,
    ...patch,
    agentAnchors: patch.agentAnchors ?? state.config.agentAnchors,
    agentProviders: patch.agentProviders
      ? { ...state.config.agentProviders, ...patch.agentProviders }
      : state.config.agentProviders,
    agentSizes: patch.agentSizes
      ? { ...state.config.agentSizes, ...patch.agentSizes }
      : state.config.agentSizes,
    visibleAgents: patch.visibleAgents
      ? { ...state.config.visibleAgents, ...patch.visibleAgents }
      : state.config.visibleAgents,
    providerModels: patch.providerModels
      ? { ...state.config.providerModels, ...patch.providerModels }
      : state.config.providerModels,
  }
  syncAgentsFromConfig()
  writeConfig(state.config)
  updateTrayMenu()
  updateAllWindowPositions()
  broadcastState()
}

async function ensureWorkspacePath() {
  if (state.config.workspacePath) {
    return state.config.workspacePath
  }

  return chooseWorkspacePath()
}

async function chooseWorkspacePath() {
  const owner = state.settingsWindow ?? BrowserWindow.getAllWindows()[0] ?? undefined
  const result = await dialog.showOpenDialog(owner, {
    title: `Choose your ${providerDisplayName(state.config.provider)} workspace`,
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const workspacePath = result.filePaths[0]
  updateConfig({ workspacePath })
  return workspacePath
}

function readConfig(): AppConfig {
  const legacyProvider: ProviderName = 'codex'
  const defaults: AppConfig = {
    provider: legacyProvider,
    providerModels: defaultProviderModels(),
    agentProviders: defaultAgentProviders(legacyProvider),
    agentSizes: defaultAgentSizes(),
    visibleAgents: defaultAgentVisibility(),
    pinnedDisplayId: null,
    workspacePath: null,
    theme: 'Peach',
    onboardingComplete: false,
    soundsEnabled: true,
    manualLift: 20,
    manualSpread: 220,
    agentAnchors: {},
  }

  const filePath = configPath()
  if (!existsSync(filePath)) {
    return defaults
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AppConfig>
    const fallbackProvider = isProviderName(parsed.provider) ? parsed.provider : legacyProvider
    return {
      ...defaults,
      ...parsed,
      provider: fallbackProvider,
      providerModels: {
        ...defaults.providerModels,
        ...(parsed.providerModels ?? {}),
      },
      agentProviders: {
        ...defaultAgentProviders(fallbackProvider),
        ...(parsed.agentProviders ?? {}),
      },
      agentSizes: {
        ...defaults.agentSizes,
        ...(parsed.agentSizes ?? {}),
      },
      visibleAgents: {
        ...defaults.visibleAgents,
        ...(parsed.visibleAgents ?? {}),
      },
      pinnedDisplayId: typeof parsed.pinnedDisplayId === 'number' ? parsed.pinnedDisplayId : null,
      agentAnchors: parsed.agentAnchors ?? defaults.agentAnchors,
    }
  } catch {
    return defaults
  }
}

function writeConfig(config: AppConfig) {
  mkdirSync(path.dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

async function findCodexPath() {
  return findProviderPath('codex')
}

async function findClaudePath() {
  return findProviderPath('claude')
}

async function findCopilotPath() {
  return findProviderPath('copilot')
}

async function findGeminiPath() {
  return findProviderPath('gemini')
}

async function findOpenCodePath() {
  return findProviderPath('opencode')
}

async function findProviderPath(binaryName: string) {
  return findBinary(binaryName, providerFallbackPaths(binaryName))
}

function providerFallbackPaths(binaryName: string) {
  const home = app.getPath('home')

  if (process.platform !== 'darwin') {
    return []
  }

  return [
    path.join(home, '.local', 'bin', binaryName),
    path.join(home, '.npm-global', 'bin', binaryName),
    '/usr/local/bin/' + binaryName,
    '/opt/homebrew/bin/' + binaryName,
  ]
}

async function ensureProviderPath(provider: ProviderName) {
  if (state.providerPaths[provider]) {
    return state.providerPaths[provider]
  }

  let resolved: string | null
  switch (provider) {
    case 'claude':
      resolved = await findClaudePath()
      break
    case 'copilot':
      resolved = await findCopilotPath()
      break
    case 'gemini':
      resolved = await findGeminiPath()
      break
    case 'opencode':
      resolved = await findOpenCodePath()
      break
    case 'codex':
    default:
      resolved = await findCodexPath()
      break
  }
  state.providerPaths[provider] = resolved
  return resolved
}

function configuredModel(provider: ProviderName) {
  const value = state.config.providerModels[provider]?.trim()
  return value ? value : null
}

function configuredAgentProvider(agentName: string, config: AppConfig = state.config) {
  const provider = config.agentProviders[agentName]
  return isProviderName(provider) ? provider : config.provider
}

function configuredAgentSize(agentName: string, config: AppConfig = state.config): AgentSize {
  const size = config.agentSizes[agentName]
  return size === 'small' || size === 'medium' || size === 'large' ? size : 'large'
}

function configuredAgentVisibility(agentName: string, config: AppConfig = state.config) {
  return config.visibleAgents[agentName] !== false
}

function syncAgentsFromConfig() {
  for (const agent of state.agents) {
    agent.provider = configuredAgentProvider(agent.name)
    agent.size = configuredAgentSize(agent.name)
    agent.isVisible = configuredAgentVisibility(agent.name)

    if (!agent.isVisible) {
      agent.isDragging = false
      agent.isWalking = false
      agent.isPopoverVisible = false
    }
  }
}

function selectedDisplay() {
  return selectDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), state.config.pinnedDisplayId)
}

function attachScreenListeners() {
  const refresh = () => {
    updateAllWindowPositions(true)
    broadcastState()
  }

  screen.on('display-added', refresh)
  screen.on('display-removed', refresh)
  screen.on('display-metrics-changed', refresh)
}

function updateDialogOwner() {
  return state.settingsWindow ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

function setupAutoUpdater() {
  if (autoUpdaterConfigured || isDev || !app.isPackaged) {
    return
  }

  autoUpdaterConfigured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    manualUpdateCheckInFlight = false

    if (promptedUpdateVersion === info.version || updateDownloadInFlight) {
      return
    }

    promptedUpdateVersion = info.version
    const choice = await dialog.showMessageBox(updateDialogOwner(), {
      type: 'info',
      buttons: ['Download update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: `Version ${info.version} is ready to download.`,
      detail: `You are running ${app.getVersion()}. Download the update now and install it when it finishes?`,
    })

    if (choice.response !== 0) {
      return
    }

    updateDownloadInFlight = true
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      updateDownloadInFlight = false
      promptedUpdateVersion = null
      await dialog.showMessageBox(updateDialogOwner(), {
        type: 'error',
        buttons: ['OK'],
        title: 'Download failed',
        message: 'The update could not be downloaded.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  autoUpdater.on('update-not-available', async () => {
    promptedUpdateVersion = null
    if (!manualUpdateCheckInFlight) {
      return
    }

    manualUpdateCheckInFlight = false
    await dialog.showMessageBox(updateDialogOwner(), {
      type: 'info',
      buttons: ['OK'],
      title: 'Up to date',
      message: 'You are running the latest available version.',
      detail: `Current version: ${app.getVersion()}`,
    })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    manualUpdateCheckInFlight = false
    updateDownloadInFlight = false
    promptedUpdateVersion = info.version

    const choice = await dialog.showMessageBox(updateDialogOwner(), {
      type: 'info',
      buttons: ['Install and restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Install the update now and restart lil agents?',
    })

    if (choice.response === 0) {
      isQuitting = true
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', async (error) => {
    updateDownloadInFlight = false
    promptedUpdateVersion = null

    if (!manualUpdateCheckInFlight) {
      console.error('Auto-update error:', error)
      return
    }

    manualUpdateCheckInFlight = false
    await dialog.showMessageBox(updateDialogOwner(), {
      type: 'error',
      buttons: ['OK'],
      title: 'Update check failed',
      message: 'Unable to check for updates right now.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  })
}

async function checkForUpdates(manual: boolean) {
  if (isDev || !app.isPackaged) {
    if (!manual) {
      return
    }

    await dialog.showMessageBox(updateDialogOwner(), {
      type: 'info',
      buttons: ['OK'],
      title: 'Updates unavailable in development',
      message: 'Auto-updates only run in packaged builds.',
      detail: 'Build an installer or portable release to test the updater flow.',
    })
    return
  }

  if (manual && manualUpdateCheckInFlight) {
    await dialog.showMessageBox(updateDialogOwner(), {
      type: 'info',
      buttons: ['OK'],
      title: 'Already checking',
      message: 'An update check is already in progress.',
    })
    return
  }

  setupAutoUpdater()
  manualUpdateCheckInFlight = manual

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    manualUpdateCheckInFlight = false
    await dialog.showMessageBox(updateDialogOwner(), {
      type: 'error',
      buttons: ['OK'],
      title: 'Update check failed',
      message: 'Unable to check for updates right now.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function providerDisplayName(provider: ProviderName) {
  switch (provider) {
    case 'claude':
      return 'Claude Code'
    case 'codex':
      return 'Codex'
    case 'copilot':
      return 'Copilot'
    case 'gemini':
      return 'Gemini'
    case 'opencode':
      return 'OpenCode'
  }
}

function isProviderName(value: unknown): value is ProviderName {
  return value === 'claude' || value === 'codex' || value === 'copilot' || value === 'gemini' || value === 'opencode'
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setAgentAnchor(agent: RuntimeAgent, centerX: number) {
  const size = agentDimensions(agent.size)
  agent.anchorX = centerX
  agent.trackStart = centerX - 180
  agent.trackEnd = centerX + 180 - size.width
}
