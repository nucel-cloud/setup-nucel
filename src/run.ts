import * as core from '@actions/core'
import { addPath } from '@actions/core'
import * as exec from '@actions/exec'
import * as cache from '@actions/cache'
import * as tc from '@actions/tool-cache'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { Context } from './github.js'

type Inputs = {
  version: string
  token?: string
  installPath?: string
}

type PlatformInfo = {
  platform: 'linux' | 'darwin' | 'win32'
  arch: 'x64' | 'arm64'
  ext: string
  binaryName: string
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

  core.info(`Setting up Nucel CLI ${inputs.version} on ${platform.platform}-${platform.arch}`)

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
  const platform = process.platform as 'linux' | 'darwin' | 'win32'
  const arch = process.arch as 'x64' | 'arm64'

  const platformMap = {
    linux: { ext: '.tar.gz', binaryName: 'nucel' },
    darwin: { ext: '.tar.gz', binaryName: 'nucel' },
    win32: { ext: '.zip', binaryName: 'nucel.exe' }
  }

  return {
    platform,
    arch,
    ...platformMap[platform]
  }
}

const restoreFromCache = async (cacheKey: string): Promise<string | null> => {
  try {
    const cachePath = path.join(process.cwd(), 'nucel-cache')
    const cacheHit = await cache.restoreCache([cachePath], cacheKey)

    if (cacheHit) {
      const nucelPath = await findBinaryInCache(cachePath)
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
  core.info(`Installing Nucel CLI ${inputs.version}...`)

  try {
    // Download binary directly from GitHub releases
    const downloadUrl = getDownloadUrl(inputs.version, platform)
    core.info(`Downloading from: ${downloadUrl}`)

    const downloadPath = await tc.downloadTool(downloadUrl)
    core.info(`Downloaded to: ${downloadPath}`)

    // Extract the binary
    let extractedPath: string
    if (platform.ext === '.zip') {
      extractedPath = await tc.extractZip(downloadPath)
    } else {
      extractedPath = await tc.extractTar(downloadPath, undefined, 'xz')
    }
    core.info(`Extracted to: ${extractedPath}`)

    // Find the binary in the extracted directory
    const binaryPath = await findBinaryInDir(extractedPath, platform.binaryName)
    if (!binaryPath) {
      throw new Error(`Nucel CLI binary not found in extracted directory: ${extractedPath}`)
    }

    // Make executable on Unix systems
    if (platform.platform !== 'win32') {
      await exec.exec('chmod', ['+x', binaryPath])
      core.info(`Made binary executable: ${binaryPath}`)
    }

    // Verify the installation
    if (!(await verifyInstallation(binaryPath))) {
      throw new Error('Nucel CLI installation verification failed')
    }

    // Add the binary directory to PATH
    const binaryDir = path.dirname(binaryPath)
    addPath(binaryDir)
    core.info(`Added to PATH: ${binaryDir}`)

    core.info(`Nucel CLI installed successfully at ${binaryPath}`)
    return binaryPath

  } catch (error) {
    throw new Error(`Failed to install Nucel CLI: ${error}`)
  }
}

const getDownloadUrl = (version: string, platform: PlatformInfo): string => {
  const baseUrl = 'https://github.com/nucel-cloud/nucel/releases/download'
  const versionTag = version === 'latest' ? 'cli-v0.1.9' : `cli-v${version}` // Use latest known version for 'latest'
  const fileName = `nucel-cli-${platform.platform}-${platform.arch}${platform.ext}`

  return `${baseUrl}/${versionTag}/${fileName}`
}

const findBinaryInDir = async (dirPath: string, binaryName: string): Promise<string | null> => {
  try {
    // First, try the root directory
    const rootBinary = path.join(dirPath, binaryName)
    if (await fileExists(rootBinary)) {
      return rootBinary
    }

    // Then try common subdirectories
    const commonDirs = ['bin', 'cli', 'nucel', 'nucel-cli']
    for (const subDir of commonDirs) {
      const subBinary = path.join(dirPath, subDir, binaryName)
      if (await fileExists(subBinary)) {
        return subBinary
      }
    }

    // Recursively search for the binary
    const binaryPath = await findBinaryRecursive(dirPath, binaryName)
    return binaryPath

  } catch (error) {
    core.warning(`Error finding binary in directory: ${error}`)
    return null
  }
}

const findBinaryRecursive = async (dirPath: string, binaryName: string): Promise<string | null> => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isFile() && entry.name === binaryName) {
        return fullPath
      }

      if (entry.isDirectory()) {
        const found = await findBinaryRecursive(fullPath, binaryName)
        if (found) {
          return found
        }
      }
    }
  } catch (error) {
    // Ignore errors and continue searching
  }

  return null
}

const findBinaryInCache = async (cachePath: string): Promise<string | null> => {
  try {
    const platform = getPlatformInfo()
    const cachedBinary = path.join(cachePath, platform.binaryName)

    if (await fileExists(cachedBinary)) {
      return cachedBinary
    }
  } catch (error) {
    core.warning(`Error finding binary in cache: ${error}`)
  }

  return null
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath, fs.constants.F_OK | fs.constants.X_OK)
    return true
  } catch {
    return false
  }
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
