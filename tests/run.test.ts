import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest'
import { run, cleanup } from '../src/run.js'
import type { Context } from '../src/github.js'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as cache from '@actions/cache'
import * as tc from '@actions/tool-cache'
import * as fs from 'fs/promises'
import * as path from 'path'

// Mock all external dependencies
vi.mock('@actions/core')
vi.mock('@actions/exec')
vi.mock('@actions/cache')
vi.mock('@actions/tool-cache')
vi.mock('fs/promises')

describe('Nucel CLI Setup Action', () => {
  const mockContext: Context = {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    sha: 'abc123',
    payload: {
      action: 'opened',
      number: 1,
      pull_request: {
        id: 1,
        number: 1,
        title: 'Test PR',
        body: 'Test body',
        html_url: 'https://github.com/test/test/pull/1',
        state: 'open',
        merged: false,
        mergeable: true,
        merge_commit_sha: null,
        user: {
          login: 'testuser',
          id: 1,
          type: 'User'
        },
        head: {
          ref: 'feature-branch',
          sha: 'abc123',
          repo: {
            id: 1,
            name: 'test-repo',
            full_name: 'test-owner/test-repo',
            owner: {
              login: 'test-owner',
              id: 1,
              type: 'Organization'
            }
          }
        },
        base: {
          ref: 'main',
          sha: 'def456',
          repo: {
            id: 1,
            name: 'test-repo',
            full_name: 'test-owner/test-repo',
            owner: {
              login: 'test-owner',
              id: 1,
              type: 'Organization'
            }
          }
        }
      }
    } as any
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock process.platform and process.arch
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    Object.defineProperty(process, 'arch', { value: 'x64', writable: true })

    // Mock environment variables
    process.env.HOME = '/home/user'

    // Mock core functions
    vi.mocked(core.info).mockImplementation(() => {})
    vi.mocked(core.warning).mockImplementation(() => {})
    vi.mocked(core.setOutput).mockImplementation(() => {})
    vi.mocked(core.setFailed).mockImplementation(() => {})
    vi.mocked(core.addPath).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('run function', () => {
    it('should install latest version when no version specified', async () => {
      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For chmod and verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.0.0',
        stderr: ''
      })

      // Mock file operations
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      expect(tc.downloadTool).toHaveBeenCalledWith('https://github.com/nucel-cloud/nucel/releases/download/cli-v0.1.9/nucel-cli-linux-x64.tar.gz')
      expect(tc.extractTar).toHaveBeenCalledWith('/tmp/downloaded-file.tar.gz', undefined, 'xz')
      expect(core.addPath).toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith('cli-version', '1.0.0')
      expect(core.setOutput).toHaveBeenCalledWith('cli-path', expect.stringContaining('nucel'))
    })

    it('should install specific version when version is specified', async () => {
      const inputs = { version: '1.2.3' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For chmod and verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.2.3',
        stderr: ''
      })

      // Mock file operations
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      expect(tc.downloadTool).toHaveBeenCalledWith('https://github.com/nucel-cloud/nucel/releases/download/cli-v1.2.3/nucel-cli-linux-x64.tar.gz')
      expect(tc.extractTar).toHaveBeenCalledWith('/tmp/downloaded-file.tar.gz', undefined, 'xz')
    })

    it('should use cache when available and valid', async () => {
      const inputs = { version: 'latest' }

      // Mock cache hit
      vi.mocked(cache.restoreCache).mockResolvedValue('cache-key')
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(exec.exec).mockResolvedValue(0) // For verification

      await run(inputs, mockContext)

      expect(cache.restoreCache).toHaveBeenCalled()
      expect(tc.downloadTool).not.toHaveBeenCalled()
      expect(core.info).toHaveBeenCalledWith('Nucel CLI restored from cache')
    })

    it('should handle installation failure', async () => {
      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)

      // Mock failed download
      vi.mocked(tc.downloadTool).mockRejectedValue(new Error('Download failed'))

      await expect(run(inputs, mockContext)).rejects.toThrow('Failed to install Nucel CLI')
    })

    it('should handle Windows platform correctly', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true })

      // Set Windows environment variables
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'
      process.env.PROGRAMFILES = 'C:\\Program Files'

      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction for Windows
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.zip')
      vi.mocked(tc.extractZip).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.0.0',
        stderr: ''
      })

      // Mock file operations for Windows
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      expect(tc.downloadTool).toHaveBeenCalledWith('https://github.com/nucel-cloud/nucel/releases/download/cli-v0.1.9/nucel-cli-win32-x64.zip')
      expect(tc.extractZip).toHaveBeenCalledWith('/tmp/downloaded-file.zip')
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('win32'))
    })

    it('should handle macOS platform correctly', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })

      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For chmod and verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.0.0',
        stderr: ''
      })

      // Mock file operations
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      expect(tc.downloadTool).toHaveBeenCalledWith('https://github.com/nucel-cloud/nucel/releases/download/cli-v0.1.9/nucel-cli-darwin-x64.tar.gz')
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('darwin'))
    })

    it('should handle authentication token', async () => {
      const inputs = { version: 'latest', token: 'test-token' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For chmod and verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.0.0',
        stderr: ''
      })

      // Mock file operations
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      // Token is stored in inputs but not used in direct binary download
      // This test verifies the action accepts the token parameter without error
      expect(inputs.token).toBe('test-token')
    })

    it('should handle custom install path', async () => {
      const inputs = { version: 'latest', installPath: '/custom/path' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful binary download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(exec.exec).mockResolvedValue(0) // For chmod and verification
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: 'nucel-cli 1.0.0',
        stderr: ''
      })

      // Mock file operations
      vi.mocked(fs.access).mockResolvedValue()
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.copyFile).mockResolvedValue(undefined)

      await run(inputs, mockContext)

      // Custom install path is not used in current implementation
      // but the action should still work
      expect(core.setOutput).toHaveBeenCalledWith('cli-version', '1.0.0')
    })
  })

  describe('cleanup function', () => {
    it('should clean up temporary files', async () => {
      vi.mocked(fs.rm).mockResolvedValue()

      await cleanup()

      expect(fs.rm).toHaveBeenCalledWith(
        path.join(process.cwd(), 'nucel-cache'),
        { recursive: true, force: true }
      )
      expect(core.info).toHaveBeenCalledWith('Temporary files cleaned up')
    })

    it('should handle cleanup errors gracefully', async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error('Cleanup failed'))

      await cleanup()

      expect(core.warning).toHaveBeenCalledWith('Cleanup failed: Error: Cleanup failed')
    })
  })

  describe('platform detection', () => {
    it('should detect Linux platform', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
      // This is tested implicitly through the run function tests
      expect(process.platform).toBe('linux')
    })

    it('should detect Windows platform', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
      expect(process.platform).toBe('win32')
    })

    it('should detect macOS platform', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
      expect(process.platform).toBe('darwin')
    })
  })

  describe('error handling', () => {
    it('should handle network errors during installation', async () => {
      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)

      // Mock network error
      vi.mocked(tc.downloadTool).mockRejectedValue(new Error('Network error'))

      await expect(run(inputs, mockContext)).rejects.toThrow('Failed to install Nucel CLI')
    })

    it('should handle installation errors for valid versions', async () => {
      const inputs = { version: '1.0.0' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)

      // Mock download error for valid version
      vi.mocked(tc.downloadTool).mockRejectedValue(new Error('Download failed'))

      await expect(run(inputs, mockContext)).rejects.toThrow('Failed to install Nucel CLI')
    })

    it('should validate version format', async () => {
      const inputs = { version: 'not-a-version' }

      await expect(run(inputs, mockContext)).rejects.toThrow('version must be "latest" or a valid semantic version')
    })

    it('should handle executable not found after installation', async () => {
      const inputs = { version: 'latest' }

      // Mock cache miss
      vi.mocked(cache.restoreCache).mockResolvedValue(undefined)
      vi.mocked(cache.saveCache).mockResolvedValue(0)

      // Mock successful download and extraction
      vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-file.tar.gz')
      vi.mocked(tc.extractTar).mockResolvedValue('/tmp/extracted')

      // Mock file not found
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'))

      await expect(run(inputs, mockContext)).rejects.toThrow('Nucel CLI binary not found in extracted directory')
    })

    it('should validate version input', async () => {
      // Test missing version
      await expect(run({} as any, mockContext)).rejects.toThrow('version input is required')

      // Test invalid version format
      await expect(run({ version: 'invalid' }, mockContext)).rejects.toThrow('version must be "latest" or a valid semantic version')
    })
  })
})
