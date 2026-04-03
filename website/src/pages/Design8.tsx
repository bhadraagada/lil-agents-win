import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'

// Terminal command responses
const TERMINAL_COMMANDS: Record<string, string[]> = {
  'help': [
    '[SYS] Available commands:',
    '  help     - Display this message',
    '  status   - Check agent status',
    '  summon   - Summon an agent',
    '  pet      - Pet the agent',
    '  dance    - Make them dance',
    '  clear    - Clear terminal',
    '  exit     - Exit (just kidding, you can\'t escape)',
  ],
  'status': [
    '[DIAG] Running system diagnostics...',
    '[OK] Bruce.exe ........... OPERATIONAL',
    '[OK] Jazz.exe ............ OPERATIONAL', 
    '[WARN] Cuteness levels ... CRITICAL',
    '[ERR] User productivity .. COMPROMISED',
    '[SYS] Recommendation: Accept your new overlords',
  ],
  'summon': [
    '[SYS] Initiating summon protocol...',
    '[LOAD] Loading companion_v2.dll ████████░░ 80%',
    '[LOAD] Injecting personality.bin ██████████ 100%',
    '[ERR] BUFFER_OVERFLOW: Too much cuteness detected',
    '[SYS] Agent materialized on your taskbar!',
    '[WARN] Side effects: happiness, reduced loneliness',
  ],
  'pet': [
    '[INPUT] Registering affection...',
    '[SYS] Bruce: *happy wiggle*',
    '[SYS] Jazz: *excited bounce*',
    '[STAT] Happiness += 9999',
    '[WARN] SEROTONIN_OVERFLOW at 0xDEADBEEF',
  ],
  'dance': [
    '[CMD] Executing dance.exe...',
    '[SYS] ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫',
    '[SYS] Bruce is doing the robot!',
    '[SYS] Jazz is spinning wildly!',
    '[ERR] GROOVE_OVERLOAD: Cannot contain moves',
    '[SYS] ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫',
  ],
  'exit': [
    '[ERR] ACCESS_DENIED',
    '[SYS] Nice try.',
    '[SYS] There is no escape from the cuteness.',
    '[SYS] The agents have already bonded with you.',
    '[WARN] Resistance is futile.',
  ],
  'default': [
    '[ERR] COMMAND_NOT_FOUND',
    '[SYS] Type "help" for available commands',
    '[HINT] Or just download the app already...',
  ]
}

// Interactive Terminal Component
function InteractiveTerminal() {
  const [history, setHistory] = useState<{type: 'input' | 'output', text: string}[]>([
    { type: 'output', text: '[SYS] LIL_AGENTS Terminal v6.6.6' },
    { type: 'output', text: '[SYS] Type "help" for available commands' },
    { type: 'output', text: '' },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const typeResponse = useCallback(async (responses: string[]) => {
    setIsTyping(true)
    for (const line of responses) {
      await new Promise(r => setTimeout(r, 100 + Math.random() * 200))
      setHistory(prev => [...prev, { type: 'output', text: line }])
    }
    setIsTyping(false)
  }, [])

  const handleCommand = useCallback((cmd: string) => {
    const trimmed = cmd.toLowerCase().trim()
    setHistory(prev => [...prev, { type: 'input', text: `> ${cmd}` }])
    
    if (trimmed === 'clear') {
      setHistory([
        { type: 'output', text: '[SYS] Terminal cleared' },
        { type: 'output', text: '' },
      ])
      return
    }

    const responses = TERMINAL_COMMANDS[trimmed] || TERMINAL_COMMANDS['default']
    typeResponse(responses)
  }, [typeResponse])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isTyping) return
    handleCommand(input)
    setInput('')
  }

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      className="border border-neutral-800 bg-black overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-sm text-neutral-500 font-space-mono">lil-agents.exe — Interactive Demo</span>
        <span className="text-xs text-neutral-600">▼</span>
      </div>

      {/* Terminal Content */}
      <div 
        ref={terminalRef}
        className="h-80 overflow-y-auto p-4 font-space-mono text-sm"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.02) 2px, rgba(0,255,0,0.02) 4px)'
        }}
      >
        {history.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`${
              line.type === 'input' 
                ? 'text-cyan-400' 
                : line.text.includes('[ERR]') 
                  ? 'text-red-400'
                  : line.text.includes('[WARN]')
                    ? 'text-yellow-400'
                    : line.text.includes('[OK]')
                      ? 'text-emerald-400'
                      : 'text-neutral-400'
            } leading-relaxed`}
          >
            {line.text}
          </motion.div>
        ))}
        
        {/* Input Line */}
        <form onSubmit={handleSubmit} className="flex items-center mt-2">
          <span className="text-emerald-500 mr-2">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            className="flex-1 bg-transparent text-white outline-none font-space-mono caret-emerald-500"
            placeholder={isTyping ? "Processing..." : "Type a command..."}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={`text-emerald-500 ${isTyping ? 'animate-pulse' : 'animate-[blink_1s_infinite]'}`}>█</span>
        </form>
      </div>

      {/* Terminal Footer */}
      <div className="px-4 py-2 bg-neutral-900/50 border-t border-neutral-800 text-xs text-neutral-600 flex justify-between">
        <span>Try: help, status, summon, pet, dance</span>
        <span className="text-emerald-500/50">● CONNECTED</span>
      </div>
    </motion.div>
  )
}

// Animated Agent Preview with CRT Effects
function AgentPreview() {
  const [activeAgent, setActiveAgent] = useState<'bruce' | 'jazz'>('bruce')
  const [glitchIntensity, setGlitchIntensity] = useState(0)

  // Random glitch bursts
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setGlitchIntensity(Math.random() * 0.5 + 0.5)
        setTimeout(() => setGlitchIntensity(0), 150)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      className="border border-neutral-800 bg-neutral-950 overflow-hidden"
    >
      {/* CRT Monitor Frame */}
      <div className="bg-gradient-to-b from-neutral-800 to-neutral-900 p-1">
        <div className="bg-gradient-to-b from-neutral-700 to-neutral-800 p-3 rounded-sm">
          {/* Monitor Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] text-neutral-500 font-space-mono">PWR</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-space-mono tracking-widest">COMPANION-VISION 3000</span>
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-1 h-3 bg-neutral-600 rounded-sm" />
              ))}
            </div>
          </div>

          {/* CRT Screen */}
          <div 
            className="relative bg-black rounded-lg overflow-hidden"
            style={{
              boxShadow: 'inset 0 0 100px rgba(0,0,0,0.9), inset 0 0 20px rgba(0,255,0,0.1)',
            }}
          >
            {/* Scanlines */}
            <div 
              className="absolute inset-0 pointer-events-none z-30 opacity-20"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)'
              }}
            />

            {/* CRT Curvature overlay */}
            <div 
              className="absolute inset-0 pointer-events-none z-40"
              style={{
                background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
              }}
            />

            {/* Glitch overlay */}
            <motion.div 
              className="absolute inset-0 pointer-events-none z-20 mix-blend-screen"
              style={{
                background: `linear-gradient(90deg, transparent ${50 - glitchIntensity * 20}%, rgba(255,0,0,0.3) 50%, rgba(0,255,255,0.3) ${50 + glitchIntensity * 20}%, transparent)`,
                opacity: glitchIntensity,
              }}
            />

            {/* Screen Content */}
            <div className="relative z-10 p-8 min-h-[300px] flex flex-col items-center justify-center">
              {/* Agent Toggle */}
              <div className="absolute top-4 left-4 flex gap-2">
                <button
                  onClick={() => setActiveAgent('bruce')}
                  className={`px-3 py-1 text-xs font-space-mono border transition-all ${
                    activeAgent === 'bruce' 
                      ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' 
                      : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'
                  }`}
                >
                  BRUCE.exe
                </button>
                <button
                  onClick={() => setActiveAgent('jazz')}
                  className={`px-3 py-1 text-xs font-space-mono border transition-all ${
                    activeAgent === 'jazz' 
                      ? 'border-violet-500 text-violet-400 bg-violet-500/10' 
                      : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'
                  }`}
                >
                  JAZZ.exe
                </button>
              </div>

              {/* Status Indicator */}
              <div className="absolute top-4 right-4 text-xs font-space-mono text-emerald-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                RENDERING
              </div>

              {/* Agent Display */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeAgent}
                  initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                  transition={{ duration: 0.3 }}
                  className="relative"
                >
                  {/* Agent SVG with walking animation */}
                  <motion.svg 
                    width="150" 
                    height="150" 
                    viewBox="0 0 150 150"
                    className={activeAgent === 'bruce' ? 'stroke-emerald-500' : 'stroke-violet-500'}
                    style={{ filter: `drop-shadow(0 0 20px ${activeAgent === 'bruce' ? '#4ade80' : '#c084fc'}40)` }}
                  >
                    {/* Glow background */}
                    <circle 
                      cx="75" 
                      cy="75" 
                      r="60" 
                      className={`fill-none ${activeAgent === 'bruce' ? 'stroke-emerald-500/20' : 'stroke-violet-500/20'}`}
                      strokeWidth="1"
                      strokeDasharray="5,5"
                    />
                    
                    {/* Body */}
                    <motion.circle 
                      cx="75" 
                      cy="75" 
                      r="45"
                      className={`fill-none stroke-2 ${activeAgent === 'bruce' ? 'fill-emerald-500/10' : 'fill-violet-500/10'}`}
                      animate={{ 
                        cy: [75, 70, 75],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    
                    {activeAgent === 'bruce' ? (
                      <>
                        {/* Bruce - Round eyes */}
                        <motion.circle 
                          cx="60" cy="65" r="8" 
                          className="fill-emerald-500/50"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        <motion.circle 
                          cx="90" cy="65" r="8" 
                          className="fill-emerald-500/50"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.1 }}
                        />
                        {/* Smile */}
                        <motion.path 
                          d="M 55 85 Q 75 100 95 85" 
                          fill="none" 
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ d: ["M 55 85 Q 75 100 95 85", "M 55 88 Q 75 105 95 88", "M 55 85 Q 75 100 95 85"] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      </>
                    ) : (
                      <>
                        {/* Jazz - Triangle eyes */}
                        <motion.polygon 
                          points="55,60 55,75 40,67.5" 
                          className="fill-violet-500/50 stroke-violet-500"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        <motion.polygon 
                          points="95,60 95,75 110,67.5" 
                          className="fill-violet-500/50 stroke-violet-500"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.1 }}
                        />
                        {/* Zigzag mouth */}
                        <motion.path 
                          d="M 50 90 L 65 85 L 75 92 L 85 85 L 100 90" 
                          fill="none" 
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ 
                            d: [
                              "M 50 90 L 65 85 L 75 92 L 85 85 L 100 90",
                              "M 50 88 L 65 93 L 75 86 L 85 93 L 100 88",
                              "M 50 90 L 65 85 L 75 92 L 85 85 L 100 90"
                            ] 
                          }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                        />
                      </>
                    )}

                    {/* Legs animation */}
                    <motion.g
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.4, repeat: Infinity }}
                    >
                      <motion.line 
                        x1="60" y1="115" x2="55" y2="135" 
                        strokeWidth="4" 
                        strokeLinecap="round"
                        animate={{ x2: [55, 50, 55, 60, 55] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                      <motion.line 
                        x1="90" y1="115" x2="95" y2="135" 
                        strokeWidth="4" 
                        strokeLinecap="round"
                        animate={{ x2: [95, 100, 95, 90, 95] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
                      />
                    </motion.g>
                  </motion.svg>

                  {/* Floating particles */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className={`absolute w-1 h-1 rounded-full ${activeAgent === 'bruce' ? 'bg-emerald-500' : 'bg-violet-500'}`}
                      style={{
                        left: `${30 + Math.random() * 40}%`,
                        top: `${20 + Math.random() * 60}%`,
                      }}
                      animate={{
                        y: [0, -20, 0],
                        opacity: [0, 1, 0],
                        scale: [0, 1, 0],
                      }}
                      transition={{
                        duration: 2 + Math.random(),
                        repeat: Infinity,
                        delay: i * 0.3,
                      }}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Agent Label */}
              <motion.div 
                className="mt-6 text-center"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className={`text-2xl font-bold font-space-mono ${activeAgent === 'bruce' ? 'text-emerald-400' : 'text-violet-400'}`}>
                  {activeAgent === 'bruce' ? 'BRUCE' : 'JAZZ'}
                </div>
                <div className="text-xs text-neutral-500 font-space-mono mt-1">
                  {activeAgent === 'bruce' ? 'HELPER_UNIT // FRIENDLY' : 'CREATIVE_UNIT // CHAOTIC'}
                </div>
              </motion.div>
            </div>

            {/* Bottom scanline sweep */}
            <motion.div
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent z-50"
              animate={{ top: ['-5%', '105%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          {/* Monitor Controls */}
          <div className="flex items-center justify-between mt-2 px-2">
            <div className="flex gap-3">
              {['BRIGHT', 'CONTRAST', 'V-HOLD'].map((label) => (
                <div key={label} className="flex flex-col items-center">
                  <div className="w-4 h-4 rounded-full bg-neutral-600 border-2 border-neutral-500" />
                  <span className="text-[8px] text-neutral-600 mt-1">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-neutral-600 font-space-mono">
              MODEL: CRT-NOSTALGIA-2024
            </div>
          </div>
        </div>
      </div>

      {/* Preview Footer */}
      <div className="px-4 py-3 bg-neutral-900 border-t border-neutral-800 flex justify-between items-center">
        <div className="text-xs text-neutral-500 font-space-mono">
          <span className="text-emerald-500">▶</span> LIVE PREVIEW — These agents will walk on your taskbar!
        </div>
        <motion.a
          href="https://github.com/bhadraagada/lil-agents-win"
          target="_blank"
          className="px-4 py-2 bg-red-600 text-white text-xs font-bold font-space-mono hover:bg-red-500 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          GET THEM NOW
        </motion.a>
      </div>
    </motion.div>
  )
}

// Design 8: Brutalist Glitch/Error - System errors, corruption effects, anti-design
export default function Design8() {
  const [glitchText, setGlitchText] = useState('LIL AGENTS')
  const [errorCount, setErrorCount] = useState(0)
  const [showCursor, setShowCursor] = useState(true)

  // Glitch text effect
  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!'
    const original = 'LIL AGENTS'
    
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const glitched = original.split('').map((char) => {
          if (Math.random() > 0.7 && char !== ' ') {
            return chars[Math.floor(Math.random() * chars.length)]
          }
          return char
        }).join('')
        setGlitchText(glitched)
        
        setTimeout(() => setGlitchText(original), 100)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [])

  // Error counter
  useEffect(() => {
    const interval = setInterval(() => {
      setErrorCount(prev => prev + Math.floor(Math.random() * 3))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setShowCursor(prev => !prev), 530)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-black text-white font-space-mono overflow-hidden relative">
      {/* Scanline overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)'
        }}
      />

      {/* Random noise blocks */}
      <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
        {[...Array(5)].map((_, idx) => (
          <motion.div
            key={idx}
            className="absolute bg-white/5"
            style={{
              width: Math.random() * 200 + 50,
              height: Math.random() * 20 + 5,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              x: [0, Math.random() * 20 - 10, 0],
            }}
            transition={{
              duration: 0.1,
              repeat: Infinity,
              repeatDelay: Math.random() * 5 + 2,
            }}
          />
        ))}
      </div>

      {/* Header - Error Bar */}
      <header className="relative z-30 bg-red-600 text-white">
        <div className="flex items-center justify-between px-4 py-2 font-bold">
          <div className="flex items-center gap-2">
            <span className="animate-pulse">⚠</span>
            <span>CRITICAL_ERROR</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span>ERR_COUNT: {errorCount.toString().padStart(6, '0')}</span>
            <span>MEM: 0x{Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="relative z-30 border-b border-neutral-800 bg-neutral-900">
        <div className="flex items-center">
          <Link 
            to="/" 
            className="px-4 py-3 border-r border-neutral-800 hover:bg-red-600 transition-colors"
          >
            [ESC] ABORT
          </Link>
          <div className="flex-1 px-4 py-3 text-neutral-500">
            C:\USERS\YOU\DESKTOP\{'>'}
            <span className="text-white">lil-agents.exe</span>
            {showCursor && <span className="text-red-500">█</span>}
          </div>
          <a 
            href="https://github.com/bhadraagada/lil-agents-win"
            target="_blank"
            className="px-4 py-3 border-l border-neutral-800 bg-red-600 hover:bg-red-700 transition-colors"
          >
            [F5] DOWNLOAD
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-20 px-6 sm:px-12 lg:px-24 xl:px-32 py-8 max-w-[1600px] mx-auto">
        {/* Hero Error Message */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-neutral-800 bg-neutral-950"
          >
            {/* Window Title Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm text-neutral-500">fatal_error.log</span>
              <span className="text-xs text-neutral-600">— □ ×</span>
            </div>

            {/* Error Content */}
            <div className="p-8">
              <motion.h1
                className="text-6xl sm:text-8xl lg:text-9xl font-bold mb-8 relative"
                style={{ fontFamily: 'inherit' }}
              >
                <span className="relative">
                  {/* Glitch layers */}
                  <span className="absolute inset-0 text-red-500 animate-pulse" style={{ clipPath: 'inset(10% 0 60% 0)', transform: 'translate(-2px, 0)' }}>
                    {glitchText}
                  </span>
                  <span className="absolute inset-0 text-cyan-500" style={{ clipPath: 'inset(60% 0 10% 0)', transform: 'translate(2px, 0)' }}>
                    {glitchText}
                  </span>
                  <span className="relative">{glitchText}</span>
                </span>
              </motion.h1>

              <div className="space-y-2 text-red-400 mb-8">
                <p>[ERROR] UNEXPECTED_CUTENESS_OVERFLOW at 0x0042069</p>
                <p>[ERROR] PRODUCTIVITY_LEVELS exceeded maximum threshold</p>
                <p>[ERROR] LONELINESS.exe has been terminated by BRUCE.dll</p>
                <p>[WARN] User may experience sudden bursts of happiness</p>
              </div>

              <div className="flex flex-wrap gap-4">
                <motion.a
                  href="https://github.com/bhadraagada/lil-agents-win"
                  target="_blank"
                  className="px-8 py-4 bg-red-600 text-white font-bold hover:bg-white hover:text-black transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  [ENTER] ACCEPT_ERROR
                </motion.a>
                <button className="px-8 py-4 border border-neutral-700 text-neutral-500 cursor-not-allowed line-through">
                  [ESC] DENY_HAPPINESS
                </button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Unit Specifications - Blueprint Style */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="border border-neutral-800 bg-neutral-950"
          >
            <div className="bg-red-600 px-4 py-2 font-bold flex justify-between items-center">
              <span>UNIT_SPECIFICATIONS — ELEVATION_VIEWS</span>
              <span className="text-xs animate-pulse">● CORRUPTED_DATA</span>
            </div>
            
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Bruce Blueprint */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  className="border border-neutral-700 p-4 relative bg-neutral-900/50"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(239,68,68,0.1) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(239,68,68,0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '20px 20px'
                  }}
                >
                  <div className="absolute top-2 right-2 text-xs text-neutral-600">FIG. 1A</div>
                  
                  {/* Technical Drawing */}
                  <div className="relative h-48 mb-4 flex items-center justify-center">
                    <motion.div
                      className="relative"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <svg width="120" height="120" viewBox="0 0 120 120" className="stroke-emerald-500 fill-none stroke-2">
                        {/* Outer dashed circle */}
                        <circle cx="60" cy="60" r="50" strokeDasharray="5,5" className="opacity-50" />
                        {/* Main circle */}
                        <circle cx="60" cy="60" r="40" />
                        {/* Eyes */}
                        <circle cx="45" cy="50" r="8" className="fill-emerald-500/30" />
                        <circle cx="75" cy="50" r="8" className="fill-emerald-500/30" />
                        {/* Smile */}
                        <path d="M 45 70 Q 60 82 75 70" strokeLinecap="round" />
                        {/* Dimension line left */}
                        <line x1="5" y1="10" x2="5" y2="110" strokeDasharray="2,2" className="stroke-emerald-500/50" />
                        <line x1="2" y1="10" x2="8" y2="10" className="stroke-emerald-500/50" />
                        <line x1="2" y1="110" x2="8" y2="110" className="stroke-emerald-500/50" />
                      </svg>
                      {/* Dimension label */}
                      <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-[10px] text-emerald-500 -rotate-90 whitespace-nowrap">
                        100px
                      </div>
                    </motion.div>
                    
                    {/* Glitch effect overlay */}
                    <motion.div
                      className="absolute inset-0 bg-red-500/10"
                      animate={{ opacity: [0, 0.3, 0] }}
                      transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 3 }}
                    />
                  </div>

                  {/* Specs table */}
                  <div className="space-y-2 text-sm border-t border-neutral-700 pt-4">
                    <div className="flex justify-between">
                      <span className="text-red-500">DESIGNATION</span>
                      <span className="text-white">BRUCE</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">TYPE</span>
                      <span className="text-white">HELPER UNIT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">COLOR CODE</span>
                      <span className="text-emerald-400">#4ADE80</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">MATERIAL</span>
                      <span className="text-white">TRANSPARENT HEVC</span>
                    </div>
                  </div>
                </motion.div>

                {/* Jazz Blueprint */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  className="border border-neutral-700 p-4 relative bg-neutral-900/50"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(239,68,68,0.1) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(239,68,68,0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '20px 20px'
                  }}
                >
                  <div className="absolute top-2 right-2 text-xs text-neutral-600">FIG. 1B</div>
                  
                  {/* Technical Drawing */}
                  <div className="relative h-48 mb-4 flex items-center justify-center">
                    <motion.div
                      className="relative"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                    >
                      <svg width="120" height="120" viewBox="0 0 120 120" className="stroke-violet-500 fill-none stroke-2">
                        {/* Outer dashed circle */}
                        <circle cx="60" cy="60" r="50" strokeDasharray="5,5" className="opacity-50" />
                        {/* Main circle */}
                        <circle cx="60" cy="60" r="40" />
                        {/* Triangle eyes */}
                        <polygon points="40,45 40,55 30,50" className="fill-violet-500/30 stroke-violet-500" />
                        <polygon points="80,45 80,55 90,50" className="fill-violet-500/30 stroke-violet-500" />
                        {/* Zigzag mouth */}
                        <path d="M 40 70 L 50 75 L 60 70 L 70 75 L 80 70" strokeLinecap="round" />
                        {/* Dimension line right */}
                        <line x1="115" y1="10" x2="115" y2="110" strokeDasharray="2,2" className="stroke-violet-500/50" />
                        <line x1="112" y1="10" x2="118" y2="10" className="stroke-violet-500/50" />
                        <line x1="112" y1="110" x2="118" y2="110" className="stroke-violet-500/50" />
                      </svg>
                      {/* Dimension label */}
                      <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[10px] text-violet-500 rotate-90 whitespace-nowrap">
                        100px
                      </div>
                    </motion.div>
                    
                    {/* Glitch effect overlay */}
                    <motion.div
                      className="absolute inset-0 bg-cyan-500/10"
                      animate={{ opacity: [0, 0.3, 0] }}
                      transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 4 }}
                    />
                  </div>

                  {/* Specs table */}
                  <div className="space-y-2 text-sm border-t border-neutral-700 pt-4">
                    <div className="flex justify-between">
                      <span className="text-red-500">DESIGNATION</span>
                      <span className="text-white">JAZZ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">TYPE</span>
                      <span className="text-white">CREATIVE UNIT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">COLOR CODE</span>
                      <span className="text-violet-400">#C084FC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">MATERIAL</span>
                      <span className="text-white">TRANSPARENT HEVC</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Agent Preview Section */}
        <section className="mb-16">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />
            <span className="text-xs text-red-500 font-space-mono">VISUAL_OUTPUT_STREAM</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />
          </div>
          <AgentPreview />
        </section>

        {/* Interactive Terminal Section */}
        <section className="mb-16">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-600 to-transparent" />
            <span className="text-xs text-emerald-500 font-space-mono">INTERACTIVE_SHELL</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-600 to-transparent" />
          </div>
          <InteractiveTerminal />
        </section>

        {/* System Dump */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="border border-neutral-800"
          >
            <div className="bg-yellow-600 text-black px-4 py-2 font-bold">
              MEMORY_DUMP: features.bin
            </div>
            <div className="p-6 bg-neutral-950 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { addr: "0x001", feature: "TASKBAR_WALKING", status: "ENABLED" },
                { addr: "0x002", feature: "FLOATING_CHAT", status: "ENABLED" },
                { addr: "0x003", feature: "CODEX_INTEGRATION", status: "OPTIONAL" },
                { addr: "0x004", feature: "THEME_CORRUPTION", status: "ENABLED" },
                { addr: "0x005", feature: "SOUND_GLITCHES", status: "ENABLED" },
                { addr: "0x006", feature: "DRAG_N_DROP", status: "ENABLED" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="border border-neutral-800 p-4 hover:border-red-500 transition-colors group"
                >
                  <div className="flex justify-between text-xs text-neutral-600 mb-2">
                    <span>{item.addr}</span>
                    <span className={item.status === 'ENABLED' ? 'text-emerald-500' : 'text-yellow-500'}>
                      [{item.status}]
                    </span>
                  </div>
                  <p className="font-bold group-hover:text-red-500 transition-colors">
                    {item.feature}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Stack Trace / Requirements */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="border border-neutral-800"
          >
            <div className="bg-neutral-800 px-4 py-2 font-bold">
              STACK_TRACE: requirements.txt
            </div>
            <div className="p-6 bg-neutral-950 font-mono text-sm">
              <div className="text-neutral-500 mb-4">
                // SYSTEM REQUIREMENTS TO REPRODUCE THIS "BUG"
              </div>
              {[
                { line: 1, text: "Windows 11 x64", comment: "// sorry linux users" },
                { line: 2, text: "Node.js >= 22", comment: "// we're modern like that" },
                { line: 3, text: "npm >= 10", comment: "// or yarn, we don't judge" },
                { line: 4, text: "Codex CLI", comment: "// optional but recommended" },
                { line: 5, text: "A sense of humor", comment: "// CRITICAL" },
                { line: 6, text: "Tolerance for cuteness", comment: "// CRITICAL" },
              ].map((req, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-4 py-1 hover:bg-neutral-900"
                >
                  <span className="text-neutral-700 select-none">{req.line.toString().padStart(2, '0')}</span>
                  <span className="text-white">{req.text}</span>
                  <span className="text-neutral-600">{req.comment}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Final CTA */}
        <section>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="border-4 border-red-600 bg-red-600/10 p-8 text-center"
          >
            <div className="text-red-500 text-sm mb-4 animate-pulse">
              ⚠ FATAL ERROR ⚠ FATAL ERROR ⚠ FATAL ERROR ⚠
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              SYSTEM REQUIRES IMMEDIATE
              <span className="block text-red-500">COMPANION INSTALLATION</span>
            </h2>
            <p className="text-neutral-400 mb-8 max-w-2xl mx-auto">
              Your desktop has been diagnosed with Acute Loneliness Syndrome (ALS). 
              The only known cure is immediate deployment of LIL AGENTS. 
              This is not a drill. Download now or face the consequences of a boring taskbar.
            </p>
            <motion.a
              href="https://github.com/bhadraagada/lil-agents-win"
              target="_blank"
              className="inline-block px-12 py-5 bg-red-600 text-white font-bold text-xl hover:bg-white hover:text-red-600 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              EXECUTE: download.exe
            </motion.a>
            <p className="text-neutral-600 text-sm mt-4">
              * Side effects may include: happiness, productivity, emotional attachment to pixels
            </p>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 border-t border-neutral-800 mt-16">
        <div className="flex flex-wrap justify-between items-center px-6 sm:px-12 lg:px-24 xl:px-32 py-4 text-xs text-neutral-600 max-w-[1600px] mx-auto gap-4">
          <span>KERNEL_PANIC: just kidding, everything is fine</span>
          <span>BUILD: {new Date().toISOString()}</span>
          <span>LICENSE: MIT (Make It Tremendous)</span>
        </div>
        <div className="bg-red-600 text-white text-center py-2 text-sm font-bold animate-pulse">
          PRESS ANY KEY TO DOWNLOAD... or just click the button above, that works too
        </div>
      </footer>
    </div>
  )
}
