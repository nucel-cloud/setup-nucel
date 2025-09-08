import { strict as assert } from 'assert'
import * as fs from 'fs/promises'

export type Context = {
  repo: {
    owner: string
    repo: string
  }
  sha: string
  payload: any
}

export const getContext = async (): Promise<Context> => {
  return {
    repo: getRepo(),
    sha: getEnv('GITHUB_SHA'),
    payload: JSON.parse(await fs.readFile(getEnv('GITHUB_EVENT_PATH'), 'utf-8')),
  }
}

const getRepo = () => {
  const [owner, repo] = getEnv('GITHUB_REPOSITORY').split('/')
  return { owner, repo }
}

const getEnv = (name: string): string => {
  assert(process.env[name], `${name} is required`)
  return process.env[name]
}
