# setup-nucel

[![CI](https://github.com/nucel-cloud/setup-nucel/actions/workflows/ci.yml/badge.svg)](https://github.com/nucel-cloud/setup-nucel/actions/workflows/ci.yml)
[![Release](https://github.com/nucel-cloud/setup-nucel/actions/workflows/release.yml/badge.svg)](https://github.com/nucel-cloud/setup-nucel/actions/workflows/release.yml)

A GitHub Action to set up the Nucel CLI for use in workflows. This action installs the Nucel CLI and makes it available for subsequent steps.

## Features

- Fast Installation: Uses npm for quick global installation
- Smart Caching: Caches installations to speed up subsequent runs
- Cross-Platform: Supports Windows, macOS, and Linux
- Secure: Uses official Nucel CLI package with optional authentication
- Clean: Automatic cleanup of temporary files
- Lightweight: Minimal dependencies and fast execution

## Usage

### Basic Usage

```yaml
- name: Set up Nucel CLI
  uses: nucel-cloud/setup-nucel@v1
  with:
    version: 'latest'
```

### Advanced Usage

```yaml
- name: Set up Nucel CLI with specific version
  uses: nucel-cloud/setup-nucel@v1
  with:
    version: '1.2.3'
    token: ${{ secrets.NUCEL_TOKEN }}
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `version` | No | `'latest'` | Version of Nucel CLI to install (e.g., `'1.0.0'`, `'latest'`) |
| `token` | No | `''` | Authentication token for Nucel CLI (if required) |
| `install-path` | No | `''` | Custom installation path (optional, uses npm global by default) |

## Outputs

| Name | Description |
|------|-------------|
| `cli-version` | Installed Nucel CLI version |
| `cli-path` | Path to the installed Nucel CLI executable |

## Examples

### CI/CD Pipeline

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Set up Nucel CLI
        uses: nucel-cloud/setup-nucel@v1
        with:
          version: 'latest'

      - name: Run Nucel commands
        run: |
          nucel --version
          nucel deploy --config ./nucel.config.json
```

### Multi-Platform Build

```yaml
name: Build
on: [push]

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Nucel CLI
        uses: nucel-cloud/setup-nucel@v1
        with:
          version: '1.2.3'

      - name: Build with Nucel
        run: nucel build
```

### With Authentication

```yaml
name: Deploy
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Nucel CLI
        uses: nucel-cloud/setup-nucel@v1
        with:
          version: 'latest'
          token: ${{ secrets.NUCEL_AUTH_TOKEN }}

      - name: Deploy to production
        run: nucel deploy --env production
```

### Using Outputs

```yaml
name: Version Check
on: [push]

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Nucel CLI
        id: setup-nucel
        uses: nucel-cloud/setup-nucel@v1
        with:
          version: 'latest'

      - name: Display version info
        run: |
          echo "Nucel CLI version: ${{ steps.setup-nucel.outputs.cli-version }}"
          echo "Nucel CLI path: ${{ steps.setup-nucel.outputs.cli-path }}"
```

## Platform Support

This action supports all GitHub-hosted runners:

- **Ubuntu**: `ubuntu-latest`, `ubuntu-22.04`, `ubuntu-20.04`
- **Windows**: `windows-latest`, `windows-2022`, `windows-2019`
- **macOS**: `macos-latest`, `macos-13`, `macos-12`

## Caching

The action automatically caches Nucel CLI installations based on:
- CLI version
- Operating system
- Architecture

This significantly speeds up subsequent workflow runs with the same configuration.

## Error Handling

The action provides clear error messages for common issues:

- **Installation failures**: Network issues, invalid versions, permission problems
- **Authentication errors**: Invalid or missing tokens
- **Platform compatibility**: Unsupported operating systems or architectures
- **Cache issues**: Corrupted cache, permission problems

## Security

- Uses the official `@nucel.cloud/cli` npm package
- Supports authentication via tokens for private registries
- No sensitive data is logged or exposed
- Follows GitHub Actions security best practices

## Development

### Prerequisites

- Node.js 20.x
- pnpm

### Setup

```bash
git clone https://github.com/nucel-cloud/setup-nucel.git
cd setup-nucel
pnpm install
```

### Testing

```bash
pnpm test
```

### Building

```bash
pnpm build
```

### Release Process

1. Create a feature branch
2. Make changes and add tests
3. Create a pull request
4. Merge to main (triggers automated release)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Create a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: https://docs.nucel.cloud
- Issue Tracker: https://github.com/nucel-cloud/setup-nucel/issues
- Discussions: https://github.com/nucel-cloud/setup-nucel/discussions
