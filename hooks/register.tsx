import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Limit, Measure, ModelLabel, Totals } from '../types'

const EMPTY: Totals = { input: 0, cacheRead: 0, output: 0 }
const WARN_AT = 90
const MAX_AGENTS_SHOWN = 2

// The data on the bar is always English and US-formatted; only the messages follow the `language` setting
export type Lang = 'en' | 'pt'

const TEXT = {
  en: {
    waiting: 'waiting for the first response',
    toast: (kind: string, percent: number) =>
      `${kind === 'five_hour' ? '5h limit' : 'Weekly limit'}: ${percent}% used`,
  },
  pt: {
    waiting: 'aguardando a 1ª resposta',
    toast: (kind: string, percent: number) =>
      `${kind === 'five_hour' ? 'Limite de 5h' : 'Limite semanal'}: ${percent}% usado`,
  },
} as const

const decimal = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '')

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${decimal(n / 1e6)}M` : n >= 1e3 ? `${decimal(n / 1e3)}k` : String(n)

export const fmtUsd = (usd: number) => `$${usd.toFixed(2)}`

export type Tone = 'success' | 'warning' | 'error'

// green below 50%, yellow from 50% to 75%, red above (the theme's own colors)
export const tone = (percent: number): Tone =>
  percent < 50 ? 'success' : percent <= 75 ? 'warning' : 'error'

// a 5-block bar, used by the context and by both limits
export const bar = (percent: number) => {
  const filled = Math.max(0, Math.min(5, Math.round(percent / 20)))
  return '▰'.repeat(filled) + '▱'.repeat(5 - filled)
}

export const fmtReset = (ms: number) => {
  const minutes = Math.round(ms / 60000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `${days}d` : `${days}d${hours % 24}h`
}

export const shortModel = (model: string) => model.replace(/^claude-/, '')

const fmtModel = ({ model, effort }: ModelLabel) =>
  effort === undefined ? shortModel(model) : `${shortModel(model)} · ${effort}`

export type Meter = { label: string; text: string; color?: Tone; isDim?: boolean }

const resetTail = (limit: Limit, now: number) =>
  limit.resetsAt === undefined ? '' : ` ↻ ${fmtReset(Date.parse(limit.resetsAt) - now)}`

const limitMeter = (label: string, limit: Limit | undefined, now: number): Meter =>
  limit === undefined
    ? { label, text: `${label} –`, isDim: true }
    : {
        label,
        color: tone(limit.percentUsed),
        text: `${label} ${bar(limit.percentUsed)} ${Math.round(limit.percentUsed)}%${resetTail(limit, now)}`,
      }

const contextMeter = (context: Measure['context']): Meter =>
  context.percent === undefined || context.tokens === undefined
    ? { label: 'ctx', text: 'ctx –', isDim: true }
    : {
        label: 'ctx',
        color: tone(context.percent),
        text: `ctx ${bar(context.percent)} ${Math.round(context.percent)}% ${fmtTokens(context.tokens)}/${fmtTokens(context.window)}`,
      }

const tokensMeter = (totals: Totals): Meter => {
  const cache = totals.cacheRead > 0 ? ` (cache ${fmtTokens(totals.cacheRead)})` : ''

  return { label: 'tok', text: `↑${fmtTokens(totals.input)}${cache} ↓${fmtTokens(totals.output)}` }
}

// the colored second line: meters, cost and, last, the tokens; `lang` only picks the hint's language
export const buildMeters = (
  totals: Totals,
  measure: Measure | null,
  now: number,
  lang: Lang = 'en',
): Meter[] => {
  const find = (kind: string) => measure?.rateLimits.find(l => l.kind === kind)
  const isWaiting =
    measure === null || (measure.context.percent === undefined && measure.rateLimits.length === 0)

  return [
    measure === null
      ? { label: 'ctx', text: 'ctx –', isDim: true }
      : contextMeter(measure.context),
    limitMeter('5h', find('five_hour'), now),
    limitMeter('week', find('seven_day'), now),
    ...(measure?.usd === undefined ? [] : [{ label: 'usd', text: fmtUsd(measure.usd) }]),
    tokensMeter(totals),
    ...(isWaiting ? [{ label: 'wait', text: TEXT[lang].waiting, isDim: true }] : []),
  ]
}

const fmtAgents = (agents: Record<string, AgentRun>) => {
  const running = Object.values(agents)
  if (running.length === 0) return undefined
  const shown = running.slice(0, MAX_AGENTS_SHOWN).map(a => `${a.type} ${fmtModel(a)}`)
  const more = running.length > MAX_AGENTS_SHOWN ? ` +${running.length - MAX_AGENTS_SHOWN}` : ''
  return `⎇ ${shown.join(', ')}${more}`
}

export type Snapshot = {
  main: ModelLabel | null
  totals: Totals
  agents: Record<string, AgentRun>
  measure: Measure | null
}

// the first line: the project, the model and the running subagents, each drawn on its own
export const buildHead = (s: Pick<Snapshot, 'main' | 'agents'> & { project?: Project | null }) => ({
  project: s.project === undefined || s.project === null ? undefined : fmtProject(s.project),
  model: s.main === null ? '…' : fmtModel(s.main),
  agents: fmtAgents(s.agents),
})

export type Project = { name: string; branch?: string }

// the last segment of a path, with either separator
export const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

// the branch named by the contents of .git/HEAD; a detached HEAD gives the short hash
export const branchOf = (head: string): string | undefined => {
  const text = head.trim()
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text)
  if (ref !== null) return ref[1]
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : undefined
}

// where a worktree's `.git` file points (`gitdir: <path>`); a relative path is taken from `dir`
export const gitdirOf = (content: string, dir: string): string | undefined => {
  const path = /^gitdir:\s*(.+)$/m.exec(content)?.[1]?.trim()
  if (path === undefined) return undefined
  return /^([A-Za-z]:|[\\/])/.test(path) ? path : `${dir}/${path}`
}

export const fmtProject = ({ name, branch }: Project) =>
  branch === undefined ? name : `${name} (${branch})`

// whether a `language` setting (`portuguese`, `Português`, `pt-BR`) asks for Portuguese
export const langOf = (language: unknown): Lang =>
  typeof language === 'string' && /^(pt|port)/i.test(language.trim()) ? 'pt' : 'en'

async function readLang($: EngineInterface): Promise<Lang> {
  try {
    return langOf((await $.settings.read()).language)
  } catch {
    return 'en'
  }
}

// what the engine already knows before the first turn (a mod installed mid-session never gets session.start)
async function initialMeasure($: EngineInterface): Promise<Measure> {
  const { context, rateLimits, cost } = await $.session.usage()

  return { context, rateLimits, usd: cost?.usd }
}

const PROJECT_TTL_MS = 2000

type ProjectCache = { at: number; value: Project | null }

// the branch of the repository that holds `root`, looking up to 8 folders above it
// only what findBranch needs of the engine, so a test can hand it an in-memory disk
type FsLike = {
  fs: {
    stat: (path: string) => Promise<{ kind: string }>
    read: (path: string) => Promise<string>
  }
}

export async function findBranch($: FsLike, root: string): Promise<string | undefined> {
  let dir = root.replace(/[\\/]+$/, '')
  for (let level = 0; level < 8; level++) {
    const git = `${dir}/.git`
    const stat = await $.fs.stat(git).catch(() => undefined)
    if (stat?.kind === 'dir') return branchOf(await $.fs.read(`${git}/HEAD`))
    if (stat?.kind === 'file') {
      const gitdir = gitdirOf(await $.fs.read(git), dir)
      return gitdir === undefined ? undefined : branchOf(await $.fs.read(`${gitdir}/HEAD`))
    }
    const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
    if (cut <= 0) return undefined
    dir = dir.slice(0, cut)
  }
  return undefined
}

// the project folder and its branch, read at most every PROJECT_TTL_MS: a redraw is frequent
async function readProject($: EngineInterface, cache: ProjectCache): Promise<Project | null> {
  const now = await $.clock.now()
  if (now - cache.at < PROJECT_TTL_MS) return cache.value
  try {
    const root = await $.session.root()
    cache.value = { name: baseName(root), branch: await findBranch($, root).catch(() => undefined) }
  } catch {
    cache.value = null
  }
  cache.at = now

  return cache.value
}

type Live = Snapshot & { warned: string[] }

async function refresh($: EngineInterface, s: Live) {
  await Promise.all([
    $.state.set({ plugin: 'usage-bar', key: 'main' }, s.main),
    $.state.set({ plugin: 'usage-bar', key: 'totals' }, s.totals),
    $.state.set({ plugin: 'usage-bar', key: 'agents' }, s.agents),
    $.state.set({ plugin: 'usage-bar', key: 'measure' }, s.measure),
    $.state.set({ plugin: 'usage-bar', key: 'warned' }, s.warned),
  ])
}

export const register: Register = on => {
  const s: Live = { main: null, totals: EMPTY, agents: {}, measure: null, warned: [] }
  const projectCache: ProjectCache = { at: -Infinity, value: null }

  on('session.start', async ($, e, next) => {
    s.totals = (await $.state.get({ plugin: 'usage-bar', key: 'totals' })).value ?? EMPTY
    s.agents = (await $.state.get({ plugin: 'usage-bar', key: 'agents' })).value ?? {}
    s.measure = (await $.state.get({ plugin: 'usage-bar', key: 'measure' })).value ?? null
    s.warned = (await $.state.get({ plugin: 'usage-bar', key: 'warned' })).value ?? []
    s.main = (await $.state.get({ plugin: 'usage-bar', key: 'main' })).value ?? {
      model: await $.session.model(),
    }
    $.ui.status(undefined)
    await refresh($, s)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const seen = { model: e.model, effort: e.effort === undefined ? undefined : String(e.effort) }

    if (e.agentId === undefined) {
      s.main = seen
    } else if (s.agents[e.agentId] === undefined) {
      const info = (await $.agent.list()).find(a => a.id === e.agentId)
      s.agents = { ...s.agents, [e.agentId]: { type: info?.type ?? 'agent', ...seen } }
    } else {
      s.agents = { ...s.agents, [e.agentId]: { ...s.agents[e.agentId]!, ...seen } }
    }
    await refresh($, s)

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage !== undefined) {
      s.totals = {
        input: s.totals.input + e.usage.input_tokens + e.usage.cache_creation_input_tokens,
        cacheRead: s.totals.cacheRead + e.usage.cache_read_input_tokens,
        output: s.totals.output + e.usage.output_tokens,
      }
    }
    if (e.agentId !== undefined) {
      const { [e.agentId]: _done, ...rest } = s.agents
      s.agents = rest
    }
    await refresh($, s)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    s.measure = { context: e.context, rateLimits: e.rateLimits, usd: e.cost?.usd }

    const isTerminal = (await $.session.surfaces()).includes('terminal')

    for (const limit of e.rateLimits) {
      const id = `${limit.kind}:${limit.resetsAt ?? ''}`
      if (isTerminal && limit.percentUsed >= WARN_AT && !s.warned.includes(id)) {
        s.warned = [...s.warned, id]
        $.ui.toast(TEXT[await readLang($)].toast(limit.kind, Math.round(limit.percentUsed)))
      }
    }
    await refresh($, s)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // the bar is for the terminal (CLI) only; the desktop app and the other surfaces get nothing
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    const { value: totals = EMPTY } = await $.state.get({ plugin: 'usage-bar', key: 'totals' })
    const { value: stored = null } = await $.state.get({ plugin: 'usage-bar', key: 'measure' })
    const { value: seen = null } = await $.state.get({ plugin: 'usage-bar', key: 'main' })
    const measure = stored ?? (await initialMeasure($))
    const main = seen ?? { model: await $.session.model() }
    const { value: agents = {} } = await $.state.get({ plugin: 'usage-bar', key: 'agents' })
    const head = buildHead({ main, agents, project: await readProject($, projectCache) })
    const meters = buildMeters(totals, measure, await $.clock.now(), await readLang($))
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={0}>
        <Text>
          {head.project === undefined ? null : (
            <Text dimColor>
              {head.project}
              {'  │  '}
            </Text>
          )}
          <Text color="claude" bold>
            {head.model}
          </Text>
          {head.agents === undefined ? null : (
            <Text color="suggestion" bold>
              {'  │  '}
              {head.agents}
            </Text>
          )}
        </Text>
        <Text>
          {meters.flatMap((m, i) => [
            i > 0 ? (
              <Text key={`${m.label}-sep`} dimColor>
                {'  │  '}
              </Text>
            ) : null,
            <Text key={m.label} color={m.color} dimColor={m.isDim === true}>
              {m.text}
            </Text>,
          ])}
        </Text>
      </Box>
    )
  })
}
