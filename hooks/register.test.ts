import { expect, test } from 'claude-code/testing'

import {
  bar,
  buildHead,
  buildMeters,
  fmtReset,
  fmtTokens,
  fmtUsd,
  langOf,
  pie,
  tone,
} from './register'

const now = Date.parse('2026-10-18T12:00:00Z')
const idle = { input: 0, cacheRead: 0, output: 0 }

test('abbreviates tokens, with the decimal mark of the language', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12400)).toBe('12.4k')
  expect(fmtTokens(200000)).toBe('200k')
  expect(fmtTokens(1200000)).toBe('1.2M')
  expect(fmtTokens(12400, 'pt')).toBe('12,4k')
  expect(fmtTokens(1200000, 'pt')).toBe('1,2M')
})

test('formats the cost', () => {
  expect(fmtUsd(1.234)).toBe('$1.23')
  expect(fmtUsd(1.234, 'pt')).toBe('US$ 1,23')
})

test('color bands: green below 50, yellow 50-75, red above 75', () => {
  expect(tone(49.9)).toBe('success')
  expect(tone(50)).toBe('warning')
  expect(tone(75)).toBe('warning')
  expect(tone(75.1)).toBe('error')
})

test('the pie and the bar fill up with the percentage', () => {
  expect([0, 25, 50, 75, 100].map(pie)).toEqual(['○', '◔', '◑', '◕', '●'])
  expect([0, 38, 55, 80, 100].map(bar)).toEqual(['▱▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰'])
})

test('time until the reset', () => {
  expect(fmtReset(-5)).toBe('now')
  expect(fmtReset(-5, 'pt')).toBe('agora')
  expect(fmtReset(45 * 60000)).toBe('45min')
  expect(fmtReset((2 * 60 + 5) * 60000)).toBe('2h05')
  expect(fmtReset(3 * 24 * 3600000)).toBe('3d')
  expect(fmtReset((3 * 24 + 4) * 3600000)).toBe('3d4h')
})

test('reads the language setting', () => {
  expect(['portuguese', 'Portuguese', 'português', 'pt', 'pt-BR', ' PT '].map(langOf)).toEqual(
    Array(6).fill('pt'),
  )
  expect([undefined, '', 'english', 'spanish', 'fr', 42].map(langOf)).toEqual(Array(6).fill('en'))
})

test('first line: the model and the subagent, apart', () => {
  const head = buildHead({
    main: { model: 'claude-fable-5-1', effort: 'high' },
    agents: { a1: { type: 'Explore', model: 'claude-haiku-5-5', effort: 'low' } },
  })
  expect(head).toEqual({ model: 'fable-5-1 · high', agents: '⎇ Explore haiku-5-5 · low' })
})

test('first line before any reading', () => {
  expect(buildHead({ main: null, agents: {} })).toEqual({ model: '…', agents: undefined })
})

const measure = {
  context: { tokens: 76000, window: 200000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 55, resetsAt: '2026-10-18T14:10:00Z' },
    { kind: 'seven_day', percentUsed: 80, resetsAt: '2026-10-21T12:00:00Z' },
  ],
  usd: 1.5,
}
const busy = { input: 45000, cacheRead: 1200000, output: 12400 }

test('colored line in English: meters by band, then cost, then tokens', () => {
  expect(buildMeters(busy, measure, now)).toEqual([
    { label: 'ctx', color: 'success', text: 'ctx ▰▰▱▱▱ 38% 76k/200k' },
    { label: '5h', color: 'warning', text: '5h ◑ 55% ↻ 2h10' },
    { label: 'wk', color: 'error', text: 'wk ◕ 80% ↻ 3d' },
    { label: 'usd', text: '$1.50' },
    { label: 'tok', text: '↑45k (cache 1.2M) ↓12.4k' },
  ])
})

test('colored line in Portuguese', () => {
  expect(buildMeters(busy, measure, now, 'pt')).toEqual([
    { label: 'ctx', color: 'success', text: 'ctx ▰▰▱▱▱ 38% 76k/200k' },
    { label: '5h', color: 'warning', text: '5h ◑ 55% ↻ 2h10' },
    { label: 'sem', color: 'error', text: 'sem ◕ 80% ↻ 3d' },
    { label: 'usd', text: 'US$ 1,50' },
    { label: 'tok', text: '↑45k (cache 1,2M) ↓12,4k' },
  ])
})

test('without a reading: dashes, tokens and the waiting hint', () => {
  expect(buildMeters(idle, null, now)).toEqual([
    { label: 'ctx', text: 'ctx –', isDim: true },
    { label: '5h', text: '5h –', isDim: true },
    { label: 'wk', text: 'wk –', isDim: true },
    { label: 'tok', text: '↑0 ↓0' },
    { label: 'wait', text: 'waiting for the first response', isDim: true },
  ])
  expect(buildMeters(idle, null, now, 'pt').at(-1)).toEqual({
    label: 'wait',
    text: 'aguardando a 1ª resposta',
    isDim: true,
  })
})

test('only the window known (no response yet): the hint shows', () => {
  const meters = buildMeters(idle, { context: { window: 200000 }, rateLimits: [] }, now)
  expect(meters.at(-1)).toEqual({
    label: 'wait',
    text: 'waiting for the first response',
    isDim: true,
  })
})

test('with a context reading the hint goes away', () => {
  const meters = buildMeters(
    idle,
    { context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [] },
    now,
  )
  expect(meters.some(m => m.label === 'wait')).toBe(false)
})
