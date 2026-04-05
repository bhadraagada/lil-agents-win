import { nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Display, NativeImage } from 'electron'

type DisplayInsets = {
  top: number
  bottom: number
  left: number
  right: number
}

const fallbackIconSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#2a2f3d"/>
        <stop offset="100%" style="stop-color:#1a1d26"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="url(#bg)"/>
    <circle cx="22" cy="30" r="14" fill="#3ecf8e"/>
    <circle cx="17" cy="27" r="3" fill="#1a1d26"/>
    <circle cx="27" cy="27" r="3" fill="#1a1d26"/>
    <ellipse cx="22" cy="35" rx="5" ry="3" fill="#1a1d26" opacity="0.6"/>
    <circle cx="42" cy="38" r="14" fill="#ff8b3d"/>
    <circle cx="37" cy="35" r="3" fill="#1a1d26"/>
    <circle cx="47" cy="35" r="3" fill="#1a1d26"/>
    <ellipse cx="42" cy="43" rx="5" ry="3" fill="#1a1d26" opacity="0.6"/>
  </svg>
`)}`

export function isMacPlatform() {
  return process.platform === 'darwin'
}

export function isWindowsPlatform() {
  return process.platform === 'win32'
}

export function runtimeIconPath(appPath: string) {
  const candidates = isMacPlatform()
    ? ['public/icons.icns', 'public/icons.png', 'public/icons.svg', 'public/icons.ico']
    : isWindowsPlatform()
      ? ['public/icons.ico', 'public/icons.png', 'public/icons.svg']
      : ['public/icons.png', 'public/icons.svg', 'public/icons.ico']

  for (const relativePath of candidates) {
    const absolutePath = path.join(appPath, relativePath)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return null
}

export function appIcon(appPath: string): NativeImage {
  const iconPath = runtimeIconPath(appPath)
  if (iconPath) {
    return nativeImage.createFromPath(iconPath)
  }

  return nativeImage.createFromDataURL(fallbackIconSvg)
}

export function trayIconSize() {
  return isMacPlatform() ? 18 : 16
}

export function shouldHideDockIcon() {
  return isMacPlatform()
}

export function selectDisplay(displays: Display[], primaryDisplay: Display, pinnedDisplayId: number | null) {
  if (pinnedDisplayId != null) {
    const pinned = displays.find((display) => display.id === pinnedDisplayId)
    if (pinned) {
      return pinned
    }
  }

  if (isMacPlatform()) {
    return displays.find(displayHasVisibleDockReservedArea) ?? primaryDisplay
  }

  const candidates = displays.filter(displayHasReservedDesktopArea)
  return candidates.find((display) => display.id === primaryDisplay.id) ?? candidates[0] ?? primaryDisplay
}

export function defaultAgentCenterX(display: Display) {
  if (isMacPlatform()) {
    return display.bounds.x + display.bounds.width / 2
  }

  return display.workArea.x + display.workArea.width / 2
}

export function resolveAgentY(display: Display, agentHeight: number, manualLift: number) {
  const insets = getDisplayInsets(display)

  if (isWindowsPlatform() && insets.top > 0 && insets.bottom === 0) {
    return display.workArea.y + 6 - manualLift
  }

  const baselineY = isMacPlatform() && insets.bottom === 0
    ? display.bounds.y + display.bounds.height
    : display.workArea.y + display.workArea.height

  const offset = isMacPlatform() ? 10 : 26
  return baselineY - agentHeight + offset - manualLift
}

function displayHasReservedDesktopArea(display: Display) {
  const insets = getDisplayInsets(display)
  return insets.top > 0 || insets.bottom > 0 || insets.left > 0 || insets.right > 0
}

function displayHasVisibleDockReservedArea(display: Display) {
  const insets = getDisplayInsets(display)
  return insets.left > 0 || insets.right > 0 || insets.bottom > 0
}

function getDisplayInsets(display: Display): DisplayInsets {
  const top = Math.max(0, display.workArea.y - display.bounds.y)
  const left = Math.max(0, display.workArea.x - display.bounds.x)
  const bottom = Math.max(0, display.bounds.y + display.bounds.height - (display.workArea.y + display.workArea.height))
  const right = Math.max(0, display.bounds.x + display.bounds.width - (display.workArea.x + display.workArea.width))

  return { top, bottom, left, right }
}
