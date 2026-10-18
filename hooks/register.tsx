import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Limit, Measure, ModelLabel, Totals } from '../types'

const EMPTY: Totals = { input: 0, cacheRead: 0, output: 0 }
const WARN_AT = 90
const MAX_AGENTS_SHOWN = 2

const decimal = (x: number) =>
  (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '').replace('.', ',')

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${decimal(n / 1e6)}M` : n >= 1e3 ? `${decimal(n / 1e3)}k` : String(n)

export const fmtUsd = (usd: number) => `US$ ${usd.toFixed(2).replace('.', ',')}`

export type Tone = 'success' | 'warning' | 'error'

// verde abaixo de 50%, amarelo de 50% a 75%, vermelho acima (cores do tema)
export const tone = (percent: number): Tone =>
  percent < 50 ? 'success' : percent <= 75 ? 'warning' : 'error'

// pizza que enche: ○ ◔ ◑ ◕ ●
export const pie = (percent: number) =>
  percent < 12.5 ? '○' : percent < 37.5 ? '◔' : percent < 62.5 ? '◑' : percent < 87.5 ? '◕' : '●'

// mini-barra de 5 blocos
export const bar = (percent: number) => {
  const filled = Math.max(0, Math.min(5, Math.round(percent / 20)))
  return '▰'.repeat(filled) + '▱'.repeat(5 - filled)
}

export const fmtReset = (ms: number) => {
  const minutes = Math.round(ms / 60000)
  if (minutes <= 0) return 'agora'
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
        text: `${label} ${pie(limit.percentUsed)} ${Math.round(limit.percentUsed)}%${resetTail(limit, now)}`,
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

// a faixa colorida acima do prompt: medidores, custo e, por último, os tokens
export const buildMeters = (totals: Totals, measure: Measure | null, now: number): Meter[] => {
  const find = (kind: string) => measure?.rateLimits.find(l => l.kind === kind)
  const isWaiting =
    measure === null || (measure.context.percent === undefined && measure.rateLimits.length === 0)

  return [
    measure === null ? { label: 'ctx', text: 'ctx –', isDim: true } : contextMeter(measure.context),
    limitMeter('5h', find('five_hour'), now),
    limitMeter('sem', find('seven_day'), now),
    ...(measure?.usd === undefined ? [] : [{ label: 'usd', text: fmtUsd(measure.usd) }]),
    tokensMeter(totals),
    ...(isWaiting ? [{ label: 'wait', text: 'aguardando a 1ª resposta', isDim: true }] : []),
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

// a primeira linha da faixa: o modelo e os subagentes, cada um na sua cor
export const buildHead = (s: Pick<Snapshot, 'main' | 'agents'>) => ({
  model: s.main === null ? '…' : fmtModel(s.main),
  agents: fmtAgents(s.agents),
})

// o que o engine já sabe antes do primeiro turno (uma instalação no meio da sessão não passa por session.start)
async function initialMeasure($: EngineInterface): Promise<Measure> {
  const { context, rateLimits, cost } = await $.session.usage()

  return { context, rateLimits, usd: cost?.usd }
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
      s.agents = { ...s.agents, [e.agentId]: { type: info?.type ?? 'agente', ...seen } }
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

    for (const limit of e.rateLimits) {
      const id = `${limit.kind}:${limit.resetsAt ?? ''}`
      if (limit.percentUsed >= WARN_AT && !s.warned.includes(id)) {
        s.warned = [...s.warned, id]
        $.ui.toast(`Limite de ${limit.kind === 'five_hour' ? '5h' : 'semana'}: ${Math.round(limit.percentUsed)}% usado`)
      }
    }
    await refresh($, s)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { value: totals = EMPTY } = await $.state.get({ plugin: 'usage-bar', key: 'totals' })
    const { value: stored = null } = await $.state.get({ plugin: 'usage-bar', key: 'measure' })
    const { value: seen = null } = await $.state.get({ plugin: 'usage-bar', key: 'main' })
    const measure = stored ?? (await initialMeasure($))
    const main = seen ?? { model: await $.session.model() }
    const { value: agents = {} } = await $.state.get({ plugin: 'usage-bar', key: 'agents' })
    const head = buildHead({ main, agents })
    const meters = buildMeters(totals, measure, await $.clock.now())
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" marginTop={1} marginBottom={0}>
        <Text>
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
