import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
      onClick={() => void window.lilAgents.togglePopover(agent.id)}
      title={`Open ${agent.name}`}
      type="button"
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

  useEffect(() => {
    const transcript = document.querySelector('.terminal-transcript')
    transcript?.scrollTo({ top: transcript.scrollHeight })
  }, [agent?.history.length, notice?.id])

  if (!agent) {
    return <div className="boot-screen">missing popover</div>
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
        pushNotice('info', 'nothing to copy yet')
        return
      }

      await navigator.clipboard.writeText(lastAssistant.text)
      pushNotice('success', 'response copied')
      setDraft('')
      return
    }

    if (cmd === '/help') {
      pushNotice('info', '/clear clears the transcript, /copy copies the last reply, /help shows this note.')
      setDraft('')
      return
    }

    pushNotice('error', `unknown command: ${text}`)
  }

  function pushNotice(tone: Notice['tone'], text: string) {
    noticeCounter.current += 1
    setNotice({ id: noticeCounter.current, tone, text })
  }

  function clearNotice() {
    setNotice(null)
  }

  return (
    <div className="popover-root">
      <header className="popover-titlebar">
        <div>
          <div className="provider-title">codex</div>
          <div className="provider-subtitle">{currentAgent.name}</div>
        </div>
        <div className="title-actions">
          <button type="button" onClick={() => void window.lilAgents.openSettings()}>
            settings
          </button>
        </div>
      </header>

      {!snapshot.config.onboardingComplete ? (
        <section className="onboarding-card">
          <p>
            welcome to lil agents for windows. pick a workspace on first chat, keep Codex installed on your
            machine, and click either little guy whenever you want the floating terminal.
          </p>
          <button type="button" onClick={() => void window.lilAgents.completeOnboarding()}>
            let&apos;s go
          </button>
        </section>
      ) : null}

      {notice ? <NoticeBanner notice={notice} /> : null}

      <section className="terminal-transcript">
        {currentAgent.history.length === 0 ? (
          <EmptyState workspacePath={snapshot.config.workspacePath} />
        ) : (
          currentAgent.history.map((message) => <TranscriptRow key={message.id} message={message} />)
        )}
      </section>

      <footer className="terminal-inputbar">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={currentAgent.isBusy ? 'Codex is working...' : 'Ask Codex...'}
          spellCheck={false}
        />
        <button type="button" onClick={() => void submit()} disabled={currentAgent.isBusy}>
          send
        </button>
      </footer>
    </div>
  )
}

function SettingsWindow({ snapshot }: { snapshot: RendererSnapshot }) {
  const draft = snapshot.config

  async function updateConfig(patch: Partial<AppConfig>) {
    await window.lilAgents.updateConfig(patch)
  }

  async function chooseWorkspace() {
    const result = await window.lilAgents.chooseWorkspace()
    if (result.path) {
      return
    }
  }

  return (
    <main className="settings-root">
      <section className="settings-hero">
        <div>
          <p className="eyebrow">windows beta skeleton</p>
          <h1>lil agents</h1>
          <p className="lede">
            Bruce and Jazz live above the Windows taskbar, keep a floating Codex popover handy, and remember a
            shared workspace.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void window.lilAgents.revealAgents()}>
          reposition agents
        </button>
      </section>

      <section className="settings-grid">
        <Panel title="Workspace + provider">
          <SettingRow label="Provider" value="Codex CLI" helper="v1 is intentionally single-provider." />
          <SettingRow
            label="Codex status"
            value={snapshot.codex.installed ? `Detected at ${snapshot.codex.path}` : 'Codex not detected on PATH'}
            tone={snapshot.codex.installed ? 'success' : 'error'}
          />
          <SettingRow
            label="Workspace"
            value={draft.workspacePath ?? 'Not selected yet'}
            helper="The first prompt can also ask for this automatically."
            action={<button type="button" onClick={chooseWorkspace}>Choose folder</button>}
          />
        </Panel>

        <Panel title="Look + feel">
          <div className="theme-row">
            {snapshot.availableThemes.map((theme) => (
              <button
                key={theme}
                type="button"
                className={theme === draft.theme ? 'theme-chip active' : 'theme-chip'}
                onClick={() => void updateConfig({ theme: theme as ThemeName })}
              >
                {theme}
              </button>
            ))}
          </div>
          <label className="slider-row">
            <span>Lift above taskbar</span>
            <input
              type="range"
              min={0}
              max={60}
              value={draft.manualLift}
              onChange={(event) => {
                const value = Number(event.target.value)
                void updateConfig({ manualLift: value })
              }}
            />
            <strong>{draft.manualLift}px</strong>
          </label>
          <label className="slider-row">
            <span>Agent spread</span>
            <input
              type="range"
              min={140}
              max={420}
              value={draft.manualSpread}
              onChange={(event) => {
                const value = Number(event.target.value)
                void updateConfig({ manualSpread: value })
              }}
            />
            <strong>{draft.manualSpread}px</strong>
          </label>
        </Panel>

        <Panel title="Behavior">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.soundsEnabled}
              onChange={(event) => {
                const value = event.target.checked
                void updateConfig({ soundsEnabled: value })
              }}
            />
            <span>completion sounds</span>
          </label>
          <button type="button" onClick={() => void updateConfig({ onboardingComplete: false })}>
            replay onboarding
          </button>
          <div className="settings-note">
            Main-display only for now. Manual taskbar calibration comes from the lift/spread sliders, with harder
            Windows shell edge cases deferred until later.
          </div>
        </Panel>

        <Panel title="Why this shape for v1?">
          <ul className="plain-list">
            <li>Transparent always-on-top agent windows mirror the Dock concept.</li>
            <li>Separate popover windows keep the floating chat anchored to a character.</li>
            <li>Codex runs from a remembered workspace, matching the CLI-first model from macOS.</li>
          </ul>
        </Panel>
      </section>
    </main>
  )
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return <div className={`notice-banner ${notice.tone}`}>{notice.text}</div>
}

function EmptyState({ workspacePath }: { workspacePath: string | null }) {
  return (
    <div className="empty-state">
      <p>floating codex terminal ready.</p>
      <p>{workspacePath ? `workspace: ${workspacePath}` : 'send a prompt to choose a workspace first.'}</p>
      <p>slash commands: /clear /copy /help</p>
    </div>
  )
}

function TranscriptRow({ message }: { message: TranscriptMessage }) {
  const className = `transcript-row ${message.role}`

  if (message.role === 'user') {
    return <div className={className}>{`> ${message.text}`}</div>
  }

  return <div className={className}>{message.text}</div>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-panel">
      <header>{title}</header>
      {children}
    </section>
  )
}

function SettingRow({
  label,
  value,
  helper,
  tone,
  action,
}: {
  label: string
  value: string
  helper?: string
  tone?: 'success' | 'error'
  action?: ReactNode
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <p className={tone ? `tone-${tone}` : undefined}>{value}</p>
        {helper ? <small>{helper}</small> : null}
      </div>
      {action}
    </div>
  )
}

function getAgent(snapshot: RendererSnapshot, agentId: number): AgentSnapshot | undefined {
  return snapshot.agents.find((agent) => agent.id === agentId)
}

export default App
