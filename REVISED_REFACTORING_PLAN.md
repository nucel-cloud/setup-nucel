# Nucel CLI Setup Action - REVISED Refactoring Plan

## Problem Analysis - ROOT CAUSE IDENTIFIED

After researching existing setup actions (setup-ollama, setup-node, etc.), the fundamental issue is **architectural**: we're using the wrong approach entirely.

### Current Broken Approach
```typescript
// ❌ WRONG: Relies on npm's unpredictable global installation
npm install -g @nucel.cloud/cli
// Then try to guess where npm installed it
```

### Industry Standard Approach  
```typescript
// ✅ CORRECT: Direct download and controlled installation
downloadTool(releaseUrl) → extract() → addPath() → return exactPath
```

## Architectural Decision

**RECOMMENDATION**: Abandon npm global installation entirely and follow the industry-standard pattern used by all successful setup actions.

## Solution Architecture

### Option 1: Direct Binary Distribution (PREFERRED)
```typescript
const installNucelCLI = async (inputs: Inputs): Promise<string> => {
  // 1. Download from @nucel.cloud/cli releases or CDN
  const downloadUrl = getDownloadUrl(inputs.version, getPlatform())
  const downloadedFile = await downloadTool(downloadUrl)
  
  // 2. Extract to controlled location
  const extractedDir = await extractTool(downloadedFile)
  
  // 3. Find the binary in extracted directory
  const binaryPath = path.join(extractedDir, getBinaryName(getPlatform()))
  
  // 4. Add to PATH so it's available globally
  addPath(path.dirname(binaryPath))
  
  // 5. Return exact path
  return binaryPath
}
```

### Option 2: npm with Fixed Path Resolution (FALLBACK)
If direct binary distribution isn't available, fix npm approach properly:

```typescript
const installNucelCLI = async (inputs: Inputs): Promise<string> => {
  // Install to controlled location, not global
  const installDir = path.join(os.tmpdir(), 'nucel-cli')
  await exec.exec('npm', ['install', '@nucel.cloud/cli', '--prefix', installDir])
  
  // Binary is always at: installDir/node_modules/.bin/nucel
  const binaryPath = path.join(installDir, 'node_modules', '.bin', getBinaryName())
  
  // Verify it exists
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at expected location: ${binaryPath}`)
  }
  
  // Add to PATH
  addPath(path.dirname(binaryPath))
  
  return binaryPath
}
```

## Implementation Plan

### Phase 1: Investigate Distribution Method
- Check if @nucel.cloud/cli has GitHub releases with pre-built binaries
- Check if there's a CDN or direct download URL
- Determine available platforms/architectures

### Phase 2: Implement Direct Download (if available)
```typescript
interface PlatformInfo {
  platform: 'linux' | 'darwin' | 'win32'
  arch: 'x64' | 'arm64'
  ext: string // '.tar.gz', '.zip', etc.
  binaryName: string // 'nucel', 'nucel.exe'
}

const getDownloadUrl = (version: string, platform: PlatformInfo): string => {
  // Example patterns:
  // https://github.com/nucel-cloud/cli/releases/download/v1.0.0/nucel-linux-x64.tar.gz
  // https://registry.npmjs.org/@nucel.cloud/cli/-/cli-1.0.0.tgz
  // https://cdn.nucel.cloud/cli/v1.0.0/nucel-linux-x64.tar.gz
}
```

### Phase 3: Implement Controlled npm Installation (fallback)
```typescript
const installWithNpm = async (inputs: Inputs): Promise<string> => {
  const tempDir = path.join(os.tmpdir(), `nucel-cli-${Date.now()}`)
  
  // Install to specific directory with --prefix
  await exec.exec('npm', [
    'install', 
    getPackageName(inputs.version),
    '--prefix', tempDir,
    '--no-audit',
    '--no-fund'
  ])
  
  // Binary location is predictable with --prefix
  const binDir = path.join(tempDir, 'node_modules', '.bin')
  const binaryPath = path.join(binDir, getBinaryName())
  
  if (await fileExists(binaryPath)) {
    addPath(binDir)
    return binaryPath
  }
  
  // Fallback: look in package's bin directory
  const pkgBinPath = path.join(tempDir, 'node_modules', '@nucel.cloud', 'cli', 'bin', getBinaryName())
  if (await fileExists(pkgBinPath)) {
    addPath(path.dirname(pkgBinPath))
    return pkgBinPath
  }
  
  throw new Error(`Nucel CLI binary not found after npm installation`)
}
```

## Key Changes from Original Plan

### ❌ Remove These Approaches:
- Guessing npm global paths with `getGlobalNpmPaths()`
- Using `which`/`where` commands to search system
- Complex retry and discovery logic
- Hardcoded path arrays

### ✅ Add These Patterns:
- Direct binary download using `@actions/tool-cache`
- Controlled installation directories  
- Predictable path resolution
- `addPath()` for PATH management
- Platform-specific binary handling

## Revised Code Structure

```typescript
// src/install.ts
export const installNucelCLI = async (inputs: Inputs): Promise<string> => {
  const platform = getPlatformInfo()
  
  try {
    // Try direct binary download first
    return await installFromBinary(inputs, platform)
  } catch (error) {
    core.warning(`Binary installation failed: ${error}`)
    
    // Fallback to npm with controlled installation
    return await installFromNpm(inputs, platform)
  }
}

const installFromBinary = async (inputs: Inputs, platform: PlatformInfo): Promise<string> => {
  const downloadUrl = getDownloadUrl(inputs.version, platform)
  const downloadPath = await downloadTool(downloadUrl)
  
  let extractedPath: string
  if (downloadPath.endsWith('.zip')) {
    extractedPath = await extractZip(downloadPath)
  } else {
    extractedPath = await extractTar(downloadPath, undefined, 'xz')
  }
  
  const binaryPath = await findBinaryInDir(extractedPath, platform.binaryName)
  
  // Make executable on Unix systems
  if (platform.platform !== 'win32') {
    await exec.exec('chmod', ['+x', binaryPath])
  }
  
  // Add to PATH
  addPath(path.dirname(binaryPath))
  
  return binaryPath
}

const installFromNpm = async (inputs: Inputs, platform: PlatformInfo): Promise<string> => {
  const installDir = path.join(os.tmpdir(), `nucel-cli-${Date.now()}`)
  const packageName = inputs.version === 'latest' ? '@nucel.cloud/cli' : `@nucel.cloud/cli@${inputs.version}`
  
  await exec.exec('npm', [
    'install', packageName,
    '--prefix', installDir,
    '--no-audit', '--no-fund', '--no-save'
  ])
  
  // Check predictable locations
  const binLocations = [
    path.join(installDir, 'node_modules', '.bin', platform.binaryName),
    path.join(installDir, 'node_modules', '@nucel.cloud', 'cli', 'bin', platform.binaryName),
    path.join(installDir, 'node_modules', '@nucel.cloud', 'cli', platform.binaryName)
  ]
  
  for (const binaryPath of binLocations) {
    if (await fileExists(binaryPath)) {
      addPath(path.dirname(binaryPath))
      return binaryPath
    }
  }
  
  throw new Error('Nucel CLI binary not found in npm installation')
}
```

## Benefits of This Approach

1. **Reliability**: No dependency on npm's unpredictable global behavior
2. **Consistency**: Works the same way across all CI environments  
3. **Speed**: Direct binary downloads are faster than npm installs
4. **Predictability**: We know exactly where the binary will be
5. **Industry Standard**: Follows patterns used by all major setup actions

## Next Steps

1. Research @nucel.cloud/cli distribution method
2. Implement direct binary approach if available
3. Implement controlled npm approach as fallback
4. Update tests to use new architecture
5. Remove all the complex path guessing logic

This approach eliminates the entire class of problems we were trying to solve with path discovery, retry logic, and complex error handling. Instead of trying to fix a fundamentally flawed approach, we adopt the industry-standard pattern that actually works.