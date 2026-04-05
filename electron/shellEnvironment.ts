import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import path from 'node:path'

let cachedEnvironment: NodeJS.ProcessEnv | null = null
let pendingEnvironment: Promise<NodeJS.ProcessEnv> | null = null

export async function resolveProcessEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (cachedEnvironment) {
    return { ...cachedEnvironment }
  }

  if (!pendingEnvironment) {
    pendingEnvironment = loadProcessEnvironment().then((environment) => {
      cachedEnvironment = sanitizeProcessEnvironment(environment)
      pendingEnvironment = null
      return cachedEnvironment
    })
  }

  const environment = await pendingEnvironment
  return { ...environment }
}

export async function findBinary(binaryName: string, fallbackPaths: string[] = []) {
  const environment = await resolveProcessEnvironment()

  if (process.platform === 'win32') {
    return findBinaryOnWindows(binaryName, environment, fallbackPaths)
  }

  return findBinaryOnPath(binaryName, environment.PATH, fallbackPaths)
}

async function loadProcessEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== 'darwin') {
    return { ...process.env }
  }

  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-l', '-i', '-c', "echo '---ENV_START---' && env && echo '---ENV_END---'"])
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.on('close', () => {
      const startMarker = '---ENV_START---\n'
      const endMarker = '\n---ENV_END---'
      const startIndex = output.indexOf(startMarker)
      const endIndex = output.indexOf(endMarker)

      if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
        resolve({ ...process.env })
        return
      }

      const rawEnvironment = output.slice(startIndex + startMarker.length, endIndex)
      const environment: NodeJS.ProcessEnv = { ...process.env }

      for (const line of rawEnvironment.split(/\r?\n/)) {
        const separator = line.indexOf('=')
        if (separator <= 0) {
          continue
        }

        const key = line.slice(0, separator)
        const value = line.slice(separator + 1)
        environment[key] = value
      }

      resolve(environment)
    })

    child.on('error', () => resolve({ ...process.env }))
  })
}

function sanitizeProcessEnvironment(environment: NodeJS.ProcessEnv) {
  const next = { ...environment }
  const home = next.HOME ?? process.env.HOME ?? ''
  const extraPaths = process.platform === 'darwin'
    ? [
        path.join(home, '.local', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, '.local', 'share', 'claude', 'versions'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
      ]
    : []

  const currentPath = next.PATH ?? process.env.PATH ?? ''
  const missingPaths = extraPaths.filter((candidate) => candidate && !currentPath.includes(candidate))
  next.PATH = missingPaths.length > 0 ? [...missingPaths, currentPath].filter(Boolean).join(path.delimiter) : currentPath
  next.TERM = 'dumb'
  delete next.CLAUDECODE
  delete next.CLAUDE_CODE_ENTRYPOINT

  return next
}

function findBinaryOnWindows(binaryName: string, environment: NodeJS.ProcessEnv, fallbackPaths: string[]) {
  return new Promise<string | null>((resolve) => {
    const child = spawn('where.exe', [binaryName], { env: environment })
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.on('close', () => {
      const candidates = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const preferred =
        candidates.find((candidate) => candidate.toLowerCase().endsWith('.exe'))
        ?? candidates.find((candidate) => candidate.toLowerCase().endsWith('.cmd'))
        ?? candidates.find((candidate) => candidate.toLowerCase().endsWith('.bat'))
        ?? firstExecutablePath(fallbackPaths)
        ?? candidates[0]

      resolve(preferred ?? null)
    })

    child.on('error', () => resolve(firstExecutablePath(fallbackPaths)))
  })
}

function findBinaryOnPath(binaryName: string, pathValue: string | undefined, fallbackPaths: string[]) {
  const pathDirectories = (pathValue ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const directory of pathDirectories) {
    const resolved = executablePath(path.join(directory, binaryName))
    if (resolved) {
      return resolved
    }
  }

  return firstExecutablePath(fallbackPaths)
}

function firstExecutablePath(candidates: string[]) {
  for (const candidate of candidates) {
    const resolved = executablePath(candidate)
    if (resolved) {
      return resolved
    }
  }

  return null
}

function executablePath(candidate: string) {
  try {
    accessSync(candidate, constants.X_OK)
    return candidate
  } catch {
    return null
  }
}
