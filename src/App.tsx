import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentSnapshot,
  AppConfig,
  RendererSnapshot,
  ThemeName,
  TranscriptMessage,
  WindowRoute,
} from './lib/types'
import { parseWindowRoute } from './lib/window-route'

type Notice = {
  id: number
  tone: 'info' | 'error' | 'success'
  text: string
}

function App() {
  const route = useMemo(() => parseWindowRoute(window.location.hash), [])
  const [snapshot, setSnapshot] = useState<RendererSnapshot | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(
    window.lilAgents ? null : 'Electron preload bridge is missing. The renderer loaded, but window.lilAgents was not injected.',
  )

  useEffect(() => {
    if (!window.lilAgents) {
      return
    }

    let cancelled = false
    window.lilAgents.getState().then((next) => {
      if (!cancelled) {
        setSnapshot(next)
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setBridgeError(error instanceof Error ? error.message : 'Failed to fetch app state from Electron.')
      }
    })

    const unsubscribe = window.lilAgents.onState((next) => {
      setSnapshot(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!snapshot) {
      return
    }

    document.body.dataset.theme = snapshot.config.theme
  }, [snapshot])

  if (!snapshot) {
    if (bridgeError) {
      return <div className="boot-screen">{bridgeError}</div>
    }

    return <div className="boot-screen">booting lil agents...</div>
  }

  switch (route.kind) {
    case 'agent':
      return <AgentWindow route={route} snapshot={snapshot} />
    case 'popover':
      return <PopoverWindow route={route} snapshot={snapshot} />
    case 'bubble':
      return <BubbleWindow route={route} snapshot={snapshot} />
    case 'settings':
      return <SettingsWindow snapshot={snapshot} />
  }
}

function AgentWindow({
  route,
  snapshot,
}: {
  route: Extract<WindowRoute, { kind: 'agent' }>
  snapshot: RendererSnapshot
}) {
  const agent = getAgent(snapshot, route.agentId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dragRef = useRef({ active: false, moved: false, startScreenX: 0 })

  useEffect(() => {
    if (!agent || !videoRef.current) {
      return
    }

    videoRef.current.currentTime = 0

    if (agent.isWalking) {
      void videoRef.current.play().catch(() => {})
      return
    }

    videoRef.current.pause()
  }, [agent])

  if (!agent) {
    return <div className="boot-screen">missing agent</div>
  }

  return (
    <button
      className={`agent-shell ${agent.variant} ${agent.isBusy ? 'busy' : ''} ${agent.isWalking ? 'walking' : 'idle'} ${agent.facing}`}
      title={`Open ${agent.name}`}
      type="button"
      onPointerDown={(event) => {
        dragRef.current = { active: true, moved: false, startScreenX: event.screenX }
        event.currentTarget.setPointerCapture(event.pointerId)
        void window.lilAgents.startAgentDrag(agent.id, event.clientX)
      }}
      onPointerMove={(event) => {
        if (!dragRef.current.active) {
          return
        }

        if (Math.abs(event.screenX - dragRef.current.startScreenX) > 4) {
          dragRef.current.moved = true
        }

        void window.lilAgents.moveAgentDrag(agent.id, event.screenX)
      }}
      onPointerUp={(event) => {
        if (!dragRef.current.active) {
          return
        }

        event.currentTarget.releasePointerCapture(event.pointerId)
        const wasDrag = dragRef.current.moved
        dragRef.current.active = false
        void window.lilAgents.endAgentDrag(agent.id).then(() => {
          if (!wasDrag) {
            void window.lilAgents.togglePopover(agent.id)
          }
        })
      }}
      onPointerCancel={() => {
        if (!dragRef.current.active) {
          return
        }

        dragRef.current.active = false
        void window.lilAgents.endAgentDrag(agent.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          void window.lilAgents.togglePopover(agent.id)
        }
      }}
    >
      <div className="agent-shadow" />
      <div className="agent-media-frame">
        <video
          ref={videoRef}
          className="agent-video"
          src={agent.variant === 'bruce' ? '/agents/bruce.webm' : '/agents/jazz.webm'}
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="agent-badge">{agent.name}</div>
      </div>
    </button>
  )
}

function BubbleWindow({
  route,
  snapshot,
}: {
  route: Extract<WindowRoute, { kind: 'bubble' }>
  snapshot: RendererSnapshot
}) {
  const agent = getAgent(snapshot, route.agentId)

  if (!agent?.bubble) {
    return <div className="bubble-root bubble-hidden" />
  }

  return (
    <div className={`bubble-root ${agent.bubble.kind}`}>
      <div className="bubble-pill">{agent.bubble.text}</div>
    </div>
  )
}

function PopoverWindow({
  route,
  snapshot,
}: {
  route: Extract<WindowRoute, { kind: 'popover' }>
  snapshot: RendererSnapshot
}) {
  const agent = getAgent(snapshot, route.agentId)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const transcript = document.querySelector('.chat-messages')
    transcript?.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' })
  }, [agent?.history.length, notice?.id])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  if (!agent) {
    return <div className="boot-screen">Agent not found</div>
  }

  const currentAgent = agent

  const lastAssistant = [...currentAgent.history].reverse().find((message) => message.role === 'assistant')

  async function submit() {
    const text = draft.trim()
    if (!text) {
      return
    }

    if (text.startsWith('/')) {
      await handleSlashCommand(text)
      return
    }

    const result = await window.lilAgents.sendPrompt(currentAgent.id, text)
    if (!result.ok) {
      pushNotice('error', result.error)
      return
    }

    setDraft('')
    clearNotice()
  }

  async function handleSlashCommand(text: string) {
    const cmd = text.toLowerCase()

    if (cmd === '/clear') {
      await window.lilAgents.clearHistory(currentAgent.id)
      setDraft('')
      clearNotice()
      return
    }

    if (cmd === '/copy') {
      if (!lastAssistant?.text) {
        pushNotice('info', 'Nothing to copy yet')
        return
      }

      await navigator.clipboard.writeText(lastAssistant.text)
      pushNotice('success', 'Copied')
      setDraft('')
      return
    }

    if (cmd === '/help') {
      pushNotice('info', '/clear clears the chat, /copy copies the last reply, /help shows this note.')
      setDraft('')
      return
    }

    pushNotice('error', `Unknown command: ${text}`)
  }

  function pushNotice(tone: Notice['tone'], text: string) {
    noticeCounter.current += 1
    setNotice({ id: noticeCounter.current, tone, text })
  }

  function clearNotice() {
    setNotice(null)
  }

  const workspaceName = snapshot.config.workspacePath
    ? snapshot.config.workspacePath.split(/[\\/]/).pop() ?? 'workspace'
    : null
  const providerLabel = snapshot.activeProvider.label

  return (
    <div className="chat-window">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="chat-avatar-ring">
            <div className={`chat-avatar ${currentAgent.variant}`}>
              {currentAgent.name.charAt(0)}
            </div>
            <span className={`chat-status-dot ${currentAgent.isBusy ? 'busy' : 'online'}`} />
          </div>
          <div className="chat-header-info">
            <h1 className="chat-title">{currentAgent.name}</h1>
            <p className="chat-subtitle">
              {currentAgent.isBusy ? 'Thinking...' : workspaceName ? workspaceName : 'Ready'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="chat-settings-btn"
          onClick={() => void window.lilAgents.openSettings()}
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
      </header>

      {/* Onboarding */}
      {!snapshot.config.onboardingComplete ? (
        <div className="chat-onboarding">
          <p>Pick a workspace on first chat. Keep {providerLabel} installed. Click either agent anytime.</p>
          <button type="button" onClick={() => void window.lilAgents.completeOnboarding()}>
            Got it
          </button>
        </div>
      ) : null}

      {/* Notice */}
      {notice ? (
        <div className={`chat-notice ${notice.tone}`}>
          {notice.text}
        </div>
      ) : null}

      {/* Messages */}
      <div className="chat-messages">
        {currentAgent.history.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <h2>Start a conversation</h2>
            <p>{workspaceName ? `Workspace: ${workspaceName}` : 'Send a message to select a workspace'}</p>
          </div>
        ) : (
          currentAgent.history.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              agentName={currentAgent.name}
              agentVariant={currentAgent.variant}
              isLatest={index === currentAgent.history.length - 1}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-commands">
          {['/help', '/clear', '/copy'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              className={draft === cmd ? 'active' : ''}
              onClick={() => setDraft(cmd)}
            >
              {cmd}
            </button>
          ))}
        </div>
        <div className="chat-composer">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder={currentAgent.isBusy ? 'Thinking...' : `Message ${currentAgent.name}`}
            disabled={currentAgent.isBusy}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={() => void submit()}
            disabled={currentAgent.isBusy || !draft.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatMessage({
  message,
  agentName,
  agentVariant,
  isLatest,
}: {
  message: TranscriptMessage
  agentName: string
  agentVariant: string
  isLatest: boolean
}) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'
  const isTool = message.role === 'toolUse' || message.role === 'toolResult'

  return (
    <div className={`chat-message ${message.role}${isLatest ? ' new' : ''}`}>
      <div className={`chat-msg-avatar ${message.role} ${isUser ? '' : agentVariant}`}>
        {isUser ? 'U' : isError ? '!' : isTool ? '>' : agentName.charAt(0)}
      </div>
      <div className="chat-msg-content">
        <div className="chat-msg-header">
          <span className="chat-msg-author">{isUser ? 'You' : agentName}</span>
          {isTool && <span className="chat-msg-badge">tool</span>}
          {isError && <span className="chat-msg-badge error">error</span>}
        </div>
        <div className="chat-msg-text">{message.text}</div>
      </div>
    </div>
  )
}

function SettingsWindow({ snapshot }: { snapshot: RendererSnapshot }) {
  const config = snapshot.config

  async function updateConfig(patch: Partial<AppConfig>) {
    await window.lilAgents.updateConfig(patch)
  }

  async function chooseWorkspace() {
    await window.lilAgents.chooseWorkspace()
  }

  const workspaceDisplay = config.workspacePath
    ? config.workspacePath.split(/[\\/]/).slice(-2).join('/')
    : null
  const providerEntries = Object.entries(snapshot.providers) as Array<[keyof typeof snapshot.providers, typeof snapshot.providers.codex]>
  const providerDescriptions: Record<keyof typeof snapshot.providers, string> = {
    claude: 'Anthropic CLI workflow with tool streaming.',
    codex: 'OpenAI Codex CLI with JSON event output.',
    copilot: 'GitHub Copilot CLI for coding tasks and shell actions.',
    gemini: 'Google Gemini CLI with yolo-style agent mode.',
    opencode: 'OpenCode CLI with JSON-formatted run events.',
  }

  return (
    <div className="settings-window">
      {/* Sidebar */}
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <div className="settings-logo">
            <span className="logo-char bruce">B</span>
            <span className="logo-char jazz">J</span>
          </div>
          <div className="settings-brand-text">
            <h1>lil agents</h1>
            <span className="version-tag">v0.1.0 beta</span>
          </div>
        </div>
        
        <nav className="settings-nav">
          <div className="nav-section">
            <span className="nav-label">Configuration</span>
            <a className="nav-item active">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              General
            </a>
          </div>
        </nav>

        <div className="settings-sidebar-footer">
          <button 
            type="button" 
            className="reveal-btn"
            onClick={() => void window.lilAgents.revealAgents()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Show Agents
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="settings-main">
        <header className="settings-header">
          <h2>General Settings</h2>
          <p>Configure your workspace and preferences</p>
        </header>

        <div className="settings-content">
          <section className="settings-section">
            <h3>Provider</h3>
            <div className="provider-grid">
              {providerEntries.map(([providerName, provider]) => (
                <button
                  key={providerName}
                  type="button"
                  className={`provider-option ${config.provider === providerName ? 'active' : ''}`}
                  onClick={() => void updateConfig({ provider: providerName })}
                >
                  <div className="provider-option-header">
                    <span className="provider-option-title">{provider.label}</span>
                    <span className={`provider-pill ${provider.installed ? 'success' : 'error'}`}>
                      {provider.installed ? 'Installed' : 'Missing'}
                    </span>
                  </div>
                  <span className="provider-option-copy">
                    {providerDescriptions[providerName]}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Status Cards */}
          <div className="status-cards">
            <div className={`status-card ${snapshot.providers[config.provider].installed ? 'success' : 'error'}`}>
              <div className="status-icon">
                {snapshot.providers[config.provider].installed ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )}
              </div>
              <div className="status-info">
                <span className="status-label">Active provider</span>
                <span className="status-value">{snapshot.activeProvider.label}</span>
              </div>
            </div>

            <div className={`status-card ${workspaceDisplay ? 'success' : 'neutral'}`}>
              <div className="status-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="status-info">
                <span className="status-label">Workspace</span>
                <span className="status-value">{workspaceDisplay ?? 'Not set'}</span>
              </div>
              <button type="button" className="status-action" onClick={chooseWorkspace}>
                Change
              </button>
            </div>
          </div>

          {/* Theme Section */}
          <section className="settings-section">
            <h3>Theme</h3>
            <div className="theme-grid">
              {snapshot.availableThemes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`theme-option ${theme.toLowerCase()} ${theme === config.theme ? 'active' : ''}`}
                  onClick={() => void updateConfig({ theme: theme as ThemeName })}
                >
                  <div className="theme-preview" />
                  <span>{theme}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Position Section */}
          <section className="settings-section">
            <h3>Agent Position</h3>
            <div className="slider-group">
              <div className="slider-item">
                <div className="slider-header">
                  <span>Lift above taskbar</span>
                  <span className="slider-value">{config.manualLift}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={config.manualLift}
                  onChange={(e) => void updateConfig({ manualLift: Number(e.target.value) })}
                />
              </div>
              <div className="slider-item">
                <div className="slider-header">
                  <span>Agent spread</span>
                  <span className="slider-value">{config.manualSpread}px</span>
                </div>
                <input
                  type="range"
                  min={140}
                  max={420}
                  value={config.manualSpread}
                  onChange={(e) => void updateConfig({ manualSpread: Number(e.target.value) })}
                />
              </div>
            </div>
          </section>

          {/* Preferences Section */}
          <section className="settings-section">
            <h3>Preferences</h3>
            <div className="pref-list">
              <label className="pref-item">
                <div className="pref-info">
                  <span className="pref-title">Completion sounds</span>
                  <span className="pref-desc">Play a sound when tasks complete</span>
                </div>
                <div className={`toggle-switch ${config.soundsEnabled ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={config.soundsEnabled}
                    onChange={(e) => void updateConfig({ soundsEnabled: e.target.checked })}
                  />
                  <div className="toggle-track">
                    <div className="toggle-thumb" />
                  </div>
                </div>
              </label>
            </div>
          </section>

          {/* Actions */}
          <section className="settings-section">
            <h3>Actions</h3>
            <div className="action-buttons">
              <button 
                type="button" 
                className="action-btn secondary"
                onClick={() => void updateConfig({ onboardingComplete: false })}
              >
                Replay onboarding
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function getAgent(snapshot: RendererSnapshot, agentId: number): AgentSnapshot | undefined {
  return snapshot.agents.find((agent) => agent.id === agentId)
}

export default App
