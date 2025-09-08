import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as cache from '@actions/cache'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Context } from './github.js'

type Inputs = {
  version: string
  token?: string
  installPath?: string
}

type PlatformInfo = {
  platform: string
  arch: string
  isWindows: boolean
  isMacOS: boolean
  isLinux: boolean
}

export const run = async (inputs: Inputs, context: Context): Promise<void> => {
  if (!inputs.version || typeof inputs.version !== 'string') {
    throw new Error('version input is required and must be a string')
  }

  if (inputs.version !== 'latest' && !/^\d+\.\d+\.\d+(-[\w\.\-]+)?$/.test(inputs.version)) {
    throw new Error('version must be "latest" or a valid semantic version (e.g., "1.0.0")')
  }

  const platform = getPlatformInfo()
  const cacheKey = `nucel-cli-${inputs.version}-${platform.platform}-${platform.arch}`

  core.info(`Setting up Nucel CLI ${inputs.version} on ${platform.platform}`)

  const cacheHit = await restoreFromCache(cacheKey)
  if (cacheHit) {
    core.info('Nucel CLI restored from cache')
    await setOutputs(cacheHit)
    return
  }

  const installPath = await installNucelCLI(inputs, platform)

  await saveToCache(cacheKey, installPath)

  await setOutputs(installPath)
}

const getPlatformInfo = (): PlatformInfo => {
  const platform = process.platform
  const arch = process.arch

  return {
    platform,
    arch,
    isWindows: platform === 'win32',
    isMacOS: platform === 'darwin',
    isLinux: platform === 'linux'
  }
}

const restoreFromCache = async (cacheKey: string): Promise<string | null> => {
  try {
    const cachePath = path.join(process.cwd(), 'nucel-cache')
    const cacheHit = await cache.restoreCache([cachePath], cacheKey)

    if (cacheHit) {
      const nucelPath = await findNucelExecutable(cachePath)
      if (nucelPath && await verifyInstallation(nucelPath)) {
        return nucelPath
      }
    }
  } catch (error) {
    core.warning(`Cache restore failed: ${error}`)
  }

  return null
}

const installNucelCLI = async (inputs: Inputs, platform: PlatformInfo): Promise<string> => {
  const packageName = inputs.version === 'latest'
    ? '@nucel.cloud/cli'
    : `@nucel.cloud/cli@${inputs.version}`

  core.info(`Installing ${packageName}...`)

  try {
    const npmConfig = []
    if (inputs.token) {
      npmConfig.push('--registry', 'https://registry.npmjs.org/')
      process.env.NPM_TOKEN = inputs.token
    }

    const installArgs = ['install', '-g', packageName, ...npmConfig]

    const exitCode = await exec.exec('npm', installArgs, {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => core.info(data.toString().trim()),
        stderr: (data: Buffer) => core.warning(data.toString().trim())
      }
    })

    if (exitCode !== 0) {
      throw new Error(`npm install failed with exit code ${exitCode}`)
    }

    const nucelPath = await findNucelExecutable()
    if (!nucelPath) {
      throw new Error('Nucel CLI executable not found after installation')
    }

    if (!(await verifyInstallation(nucelPath))) {
      throw new Error('Nucel CLI installation verification failed')
    }

    core.info(`Nucel CLI installed successfully at ${nucelPath}`)
    return nucelPath

  } catch (error) {
    throw new Error(`Failed to install Nucel CLI: ${error}`)
  }
}

const findNucelExecutable = async (searchPath?: string): Promise<string | null> => {
  const platform = getPlatformInfo()
  const possibleNames = platform.isWindows ? ['nucel.exe', 'nucel.cmd'] : ['nucel']
  const searchPaths = searchPath ? [searchPath] : getGlobalNpmPaths(platform)

  for (const basePath of searchPaths) {
    for (const name of possibleNames) {
      const fullPath = path.join(basePath, name)
      try {
        await fs.access(fullPath)
        return fullPath
      } catch {
        // Continue searching
      }
    }
  }

  return null
}

const getGlobalNpmPaths = (platform: PlatformInfo): string[] => {
  const paths: string[] = []

  if (platform.isWindows) {
    const appData = process.env.APPDATA
    const programFiles = process.env.PROGRAMFILES
    if (appData) paths.push(path.join(appData, 'npm'))
    if (programFiles) paths.push(path.join(programFiles, 'nodejs'))
  } else {
    paths.push('/usr/local/bin', '/usr/bin', '/opt/homebrew/bin')
    const home = process.env.HOME
    if (home) {
      paths.push(path.join(home, '.npm-global', 'bin'))
      paths.push(path.join(home, 'node_modules', '.bin'))
    }
  }

  return paths
}

const verifyInstallation = async (nucelPath: string): Promise<boolean> => {
  try {
    const exitCode = await exec.exec(nucelPath, ['--version'], {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => core.info(`Nucel CLI version: ${data.toString().trim()}`),
        stderr: (data: Buffer) => core.warning(data.toString().trim())
      }
    })
    return exitCode === 0
  } catch {
    return false
  }
}

const saveToCache = async (cacheKey: string, nucelPath: string): Promise<void> => {
  try {
    const cachePath = path.join(process.cwd(), 'nucel-cache')
    await fs.mkdir(cachePath, { recursive: true })

    const cachedNucelPath = path.join(cachePath, path.basename(nucelPath))
    await fs.copyFile(nucelPath, cachedNucelPath)

    await cache.saveCache([cachePath], cacheKey)
    core.info('Nucel CLI cached successfully')
  } catch (error) {
    core.warning(`Failed to cache Nucel CLI: ${error}`)
  }
}

const setOutputs = async (nucelPath: string): Promise<void> => {
  let version = 'unknown'
  try {
    const output = await exec.getExecOutput(nucelPath, ['--version'])
    if (output.exitCode === 0) {
      version = output.stdout.trim().split(' ').pop() || 'unknown'
    }
  } catch {
    core.warning('Could not determine Nucel CLI version')
  }

  core.setOutput('cli-version', version)
  core.setOutput('cli-path', nucelPath)

  core.info(`Nucel CLI setup complete:`)
  core.info(`  Version: ${version}`)
  core.info(`  Path: ${nucelPath}`)
}

export const cleanup = async (): Promise<void> => {
  core.info('Running post-step cleanup...')

  try {
    const cachePath = path.join(process.cwd(), 'nucel-cache')
    await fs.rm(cachePath, { recursive: true, force: true })
    core.info('Temporary files cleaned up')
  } catch (error) {
    core.warning(`Cleanup failed: ${error}`)
  }
}
