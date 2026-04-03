import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppConfig, AgentSnapshot, RendererSnapshot, TranscriptMessage, ThemeName } from '../src/lib/types'

const isDev = !app.isPackaged
const devServerUrl = 'http://127.0.0.1:5173'
const availableThemes: ThemeName[] = ['Peach', 'Midnight', 'Cloud', 'Moss']
const thinkingPhrases = ['thinking...', 'working on it', 'one sec...', 'checking files', 'running Codex']
const completionPhrases = ['done!', 'all set!', 'ready', 'check it out']
const agentSize = { width: 140, height: 160 }
const popoverSize = { width: 480, height: 500 }
const videoDurationMs = 10040
const accelStartMs = 3000
const fullSpeedStartMs = 3750
const decelStartMs = 7500
const walkStopMs = 8250

type BubbleState = {
  text: string
  kind: 'thinking' | 'completion'
  expiresAt: number | null
}

type RuntimeAgent = {
  id: number
  name: string
  variant: 'bruce' | 'jazz'
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
  codexPath: string | null
  tray: Tray | null
  completionPulseId: number
  settingsWindow: BrowserWindow | null
  agentWindows: Map<number, BrowserWindow>
  popoverWindows: Map<number, BrowserWindow>
  bubbleWindows: Map<number, BrowserWindow>
  agents: RuntimeAgent[]
  animationTimer: NodeJS.Timeout | null
}

const state: AppState = {
  config: readConfig(),
  codexPath: null,
  tray: null,
  completionPulseId: 0,
  settingsWindow: null,
  agentWindows: new Map(),
  popoverWindows: new Map(),
  bubbleWindows: new Map(),
  agents: [
    createRuntimeAgent(0, 'Bruce', 'bruce', '#44a86a', 0.3),
    createRuntimeAgent(1, 'Jazz', 'jazz', '#ff7b2f', 0.7),
  ],
  animationTimer: null,
}

let isQuitting = false

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

app.setAppUserModelId('xyz.lilagents.win')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  showSettingsWindow()
})

app.whenReady().then(async () => {
  state.codexPath = await findCodexPath()
  createTray()
  createAgentWindows()
  createSettingsWindow()
  updateAllWindowPositions(true)
  startAnimationLoop()
  broadcastState()
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

  if (agent.isBusy) {
    return { ok: false, error: 'Codex is already working.' }
  }

  const workspacePath = await ensureWorkspacePath()
  if (!workspacePath) {
    return { ok: false, error: 'workspace selection was cancelled' }
  }

  if (!state.codexPath) {
    state.codexPath = await findCodexPath()
  }

  if (!state.codexPath) {
    pushMessage(agent, 'error', 'Codex CLI was not found on PATH. Install it first, then reopen the app.')
    broadcastState()
    return { ok: false, error: 'Codex CLI was not found on PATH.' }
  }

  await runCodexTurn(agent, payload.text, workspacePath)
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

ipcMain.handle('app:choose-workspace', async () => {
  const path = await chooseWorkspacePath()
  return { path }
})

ipcMain.handle('config:update', (_event, patch: Partial<AppConfig>) => {
  updateConfig(patch)
})

ipcMain.handle('app:reveal-agents', () => {
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

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const left = clamp(payload.screenX - agent.dragPointerOffsetX, workArea.x, workArea.x + workArea.width - agentSize.width)
  const center = left + agentSize.width / 2
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

async function runCodexTurn(agent: RuntimeAgent, text: string, workspacePath: string) {
  agent.isBusy = true
  pushMessage(agent, 'user', text)
  setBubble(agent, randomItem(thinkingPhrases), 'thinking')
  broadcastState()

  const prompt = buildCodexPrompt(agent, agent.history.slice(0, -1), text)
  const child = spawn(state.codexPath!, ['exec', '--json', '--full-auto', '--skip-git-repo-check', prompt], {
    cwd: workspacePath,
    env: process.env,
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

    if (state.config.soundsEnabled) {
      shell.beep()
    }

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
  const agentWindow = state.agentWindows.get(agent.id)
  agentWindow?.setBounds({ x: Math.round(agent.x), y: Math.round(agent.y), ...agentSize })

  const bubbleWindow = state.bubbleWindows.get(agent.id)
  if (bubbleWindow) {
    if (agent.bubble && !agent.isPopoverVisible) {
      const width = Math.max(90, agent.bubble.text.length * 8 + 28)
      bubbleWindow.setBounds({
        x: Math.round(agent.x + agentSize.width / 2 - width / 2),
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
      x: Math.round(agent.x + agentSize.width / 2 - popoverSize.width / 2),
      y: Math.round(agent.y - popoverSize.height + 12),
      ...popoverSize,
    })
  }
}

function createAgentWindows() {
  for (const agent of state.agents) {
    const agentWindow = new BrowserWindow({
      ...agentSize,
      x: Math.round(agent.x),
      y: Math.round(agent.y),
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
    loadWindow(agentWindow, `agent/${agent.id}`)
    state.agentWindows.set(agent.id, agentWindow)

    const popoverWindow = new BrowserWindow({
      ...popoverSize,
      show: false,
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
  // Tray icon: Two cute overlapping agent faces (Bruce=green, Jazz=orange)
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#2a2f3d"/>
          <stop offset="100%" style="stop-color:#1a1d26"/>
        </linearGradient>
      </defs>
      <!-- Background -->
      <rect width="64" height="64" rx="14" fill="url(#bg)"/>
      <!-- Bruce (green agent - back) -->
      <circle cx="22" cy="30" r="14" fill="#3ecf8e"/>
      <circle cx="17" cy="27" r="3" fill="#1a1d26"/>
      <circle cx="27" cy="27" r="3" fill="#1a1d26"/>
      <ellipse cx="22" cy="35" rx="5" ry="3" fill="#1a1d26" opacity="0.6"/>
      <!-- Jazz (orange agent - front) -->
      <circle cx="42" cy="38" r="14" fill="#ff8b3d"/>
      <circle cx="37" cy="35" r="3" fill="#1a1d26"/>
      <circle cx="47" cy="35" r="3" fill="#1a1d26"/>
      <ellipse cx="42" cy="43" rx="5" ry="3" fill="#1a1d26" opacity="0.6"/>
    </svg>
  `)}`)
  state.tray = new Tray(icon)
  state.tray.setToolTip('lil agents')
  const menu = Menu.buildFromTemplate([
    { label: 'Open settings', click: () => showSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  state.tray.setContextMenu(menu)
  state.tray.on('double-click', () => showSettingsWindow())
}

function showSettingsWindow() {
  createSettingsWindow()
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
  if (isDev) {
    void window.loadURL(`${devServerUrl}/#/${route}`)
    return
  }

  const fileUrl = pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).toString()
  void window.loadURL(`${fileUrl}#/${route}`)
}

function updateAllWindowPositions(forceShow = false) {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const centerX = workArea.x + workArea.width / 2
  const sharedY = workArea.y + workArea.height - agentSize.height + 26 - state.config.manualLift

  for (const [index, agent] of state.agents.entries()) {
    const offset = index === 0 ? -state.config.manualSpread / 2 : state.config.manualSpread / 2
    const savedAnchor = state.config.agentAnchors[agent.name]
    const trackCenter = savedAnchor ?? agent.anchorX ?? centerX + offset
    setAgentAnchor(agent, trackCenter)
    if (forceShow || !Number.isFinite(agent.x)) {
      agent.x = agent.anchorX - agentSize.width / 2
    }
    agent.x = clamp(agent.x, agent.trackStart, agent.trackEnd)
    agent.y = sharedY
    syncAttachedWindows(agent)
  }
}

function buildSnapshot(): RendererSnapshot {
  return {
    config: state.config,
    availableThemes,
    completionPulseId: state.completionPulseId,
    codex: {
      installed: Boolean(state.codexPath),
      path: state.codexPath,
    },
    agents: state.agents.map((agent): AgentSnapshot => ({
      id: agent.id,
      name: agent.name,
      variant: agent.variant,
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
): RuntimeAgent {
  return {
    id,
    name,
    variant,
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
  }
  writeConfig(state.config)
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
    title: 'Choose your Codex workspace',
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
  const defaults: AppConfig = {
    provider: 'codex',
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
    return {
      ...defaults,
      ...parsed,
      provider: 'codex',
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
  return new Promise<string | null>((resolve) => {
    const child = spawn('where.exe', ['codex'])
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.on('close', () => {
      const path = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      resolve(path ?? null)
    })

    child.on('error', () => resolve(null))
  })
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setAgentAnchor(agent: RuntimeAgent, centerX: number) {
  agent.anchorX = centerX
  agent.trackStart = centerX - 180
  agent.trackEnd = centerX + 180 - agentSize.width
}
