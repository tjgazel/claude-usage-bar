import { expect, test } from 'claude-code/testing'

import { bar, buildHead, buildMeters, fmtReset, fmtTokens, fmtUsd, pie, tone } from './register'

test('abrevia tokens', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12400)).toBe('12,4k')
  expect(fmtTokens(200000)).toBe('200k')
  expect(fmtTokens(1200000)).toBe('1,2M')
})

test('formata custo', () => {
  expect(fmtUsd(1.234)).toBe('US$ 1,23')
})

test('faixas de cor: verde <50, amarelo 50-75, vermelho >75', () => {
  expect(tone(49.9)).toBe('success')
  expect(tone(50)).toBe('warning')
  expect(tone(75)).toBe('warning')
  expect(tone(75.1)).toBe('error')
})

test('pizza e mini-barra enchem com a porcentagem', () => {
  expect([0, 25, 50, 75, 100].map(pie)).toEqual(['○', '◔', '◑', '◕', '●'])
  expect([0, 38, 55, 80, 100].map(bar)).toEqual(['▱▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰'])
})

test('tempo até o reset', () => {
  expect(fmtReset(-5)).toBe('agora')
  expect(fmtReset(45 * 60000)).toBe('45min')
  expect(fmtReset((2 * 60 + 5) * 60000)).toBe('2h05')
  expect(fmtReset(3 * 24 * 3600000)).toBe('3d')
  expect(fmtReset((3 * 24 + 4) * 3600000)).toBe('3d4h')
})

const now = Date.parse('2026-10-18T12:00:00Z')

test('primeira linha: modelo e subagente separados', () => {
  const head = buildHead({
    main: { model: 'claude-fable-5-1', effort: 'high' },
    agents: { a1: { type: 'Explore', model: 'claude-haiku-5-5', effort: 'low' } },
  })
  expect(head).toEqual({ model: 'fable-5-1 · high', agents: '⎇ Explore haiku-5-5 · low' })
})

test('primeira linha sem leitura ainda', () => {
  expect(buildHead({ main: null, agents: {} })).toEqual({ model: '…', agents: undefined })
})

test('faixa colorida: tokens, custo e medidores por faixa', () => {
  const meters = buildMeters(
    { input: 45000, cacheRead: 1200000, output: 12400 },
    {
      context: { tokens: 76000, window: 200000, percent: 38 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 55, resetsAt: '2026-10-18T14:10:00Z' },
        { kind: 'seven_day', percentUsed: 80, resetsAt: '2026-10-21T12:00:00Z' },
      ],
      usd: 1.5,
    },
    now,
  )
  expect(meters).toEqual([
    { label: 'ctx', color: 'success', text: 'ctx ▰▰▱▱▱ 38% 76k/200k' },
    { label: '5h', color: 'warning', text: '5h ◑ 55% ↻ 2h10' },
    { label: 'sem', color: 'error', text: 'sem ◕ 80% ↻ 3d' },
    { label: 'usd', text: 'US$ 1,50' },
    { label: 'tok', text: '↑45k (cache 1,2M) ↓12,4k' },
  ])
})

test('sem leitura: tokens aparecem, medidores ficam com traço', () => {
  const meters = buildMeters({ input: 0, cacheRead: 0, output: 0 }, null, now)
  expect(meters).toEqual([
    { label: 'ctx', text: 'ctx –', isDim: true },
    { label: '5h', text: '5h –', isDim: true },
    { label: 'sem', text: 'sem –', isDim: true },
    { label: 'tok', text: '↑0 ↓0' },
    { label: 'wait', text: 'aguardando a 1ª resposta', isDim: true },
  ])
})

test('só a janela de contexto conhecida (sem resposta ainda): mostra o aviso', () => {
  const meters = buildMeters({ input: 0, cacheRead: 0, output: 0 }, { context: { window: 200000 }, rateLimits: [] }, now)
  expect(meters.at(-1)).toEqual({ label: 'wait', text: 'aguardando a 1ª resposta', isDim: true })
})

test('com leitura de contexto, o aviso some', () => {
  const meters = buildMeters(
    { input: 0, cacheRead: 0, output: 0 },
    { context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [] },
    now,
  )
  expect(meters.some(m => m.label === 'wait')).toBe(false)
})
