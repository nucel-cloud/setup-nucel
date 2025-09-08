import * as core from '@actions/core'
import { run, cleanup } from './run.js'
import { getContext } from './github.js'

const isPost = !!process.env.STATE_isPost

try {
  if (isPost) {
    // Post step - cleanup
    await cleanup()
  } else {
    // Main step - installation
    await run(
      {
        version: core.getInput('version', { required: false }) || 'latest',
        token: core.getInput('token', { required: false }),
        installPath: core.getInput('install-path', { required: false }),
      },
      await getContext(),
    )

    // Mark that post step should run
    core.saveState('isPost', 'true')
  }
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
