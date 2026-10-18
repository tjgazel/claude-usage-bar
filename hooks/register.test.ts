import { expect, test } from 'claude-code/testing'

import {
  bar,
  baseName,
  branchOf,
  buildHead,
  buildMeters,
  fmtProject,
  fmtReset,
  fmtTokens,
  findBranch,
  fmtUsd,
  gitdirOf,
  langOf,
  pie,
  tone,
} from './register'

const now = Date.parse('2026-10-18T12:00:00Z')
const idle = { input: 0, cacheRead: 0, output: 0 }

test('abbreviates tokens with a dot, whatever the language', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12400)).toBe('12.4k')
  expect(fmtTokens(200000)).toBe('200k')
  expect(fmtTokens(1200000)).toBe('1.2M')
})

test('formats the cost in US dollars', () => {
  expect(fmtUsd(1.234)).toBe('$1.23')
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

const expected = [
  { label: 'ctx', color: 'success', text: 'ctx ▰▰▱▱▱ 38% 76k/200k' },
  { label: '5h', color: 'warning', text: '5h ◑ 55% ↻ 2h10' },
  { label: 'week', color: 'error', text: 'week ◕ 80% ↻ 3d' },
  { label: 'usd', text: '$1.50' },
  { label: 'tok', text: '↑45k (cache 1.2M) ↓12.4k' },
]

test('colored line: meters by band, then cost, then tokens', () => {
  expect(buildMeters(busy, measure, now)).toEqual(expected)
})

test('the data does not change with the language', () => {
  expect(buildMeters(busy, measure, now, 'pt')).toEqual(expected)
})

test('without a reading: dashes, tokens and the waiting hint', () => {
  expect(buildMeters(idle, null, now)).toEqual([
    { label: 'ctx', text: 'ctx –', isDim: true },
    { label: '5h', text: '5h –', isDim: true },
    { label: 'week', text: 'week –', isDim: true },
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

test('project folder name, with either separator and a trailing one', () => {
  expect(baseName('D:\\projects\\claude-mods\\claude-usage-bar')).toBe('claude-usage-bar')
  expect(baseName('/home/me/claude-usage-bar/')).toBe('claude-usage-bar')
  expect(baseName('D:\\projects\\claude-mods\\')).toBe('claude-mods')
})

test('branch from .git/HEAD', () => {
  expect(branchOf('ref: refs/heads/main\n')).toBe('main')
  expect(branchOf('ref: refs/heads/feature/new-bar\n')).toBe('feature/new-bar')
  expect(branchOf('e58d53c3a1b2c3d4e5f60718293a4b5c6d7e8f90\n')).toBe('e58d53c')
  expect(branchOf('')).toBeUndefined()
  expect(branchOf('garbage')).toBeUndefined()
})

test('worktree .git file points to its gitdir', () => {
  expect(gitdirOf('gitdir: C:/repo/.git/worktrees/x\n', 'D:/w')).toBe('C:/repo/.git/worktrees/x')
  expect(gitdirOf('gitdir: /repo/.git/worktrees/x', 'D:/w')).toBe('/repo/.git/worktrees/x')
  expect(gitdirOf('gitdir: ../repo/.git/worktrees/x', 'D:/w')).toBe('D:/w/../repo/.git/worktrees/x')
  expect(gitdirOf('not a gitdir file', 'D:/w')).toBeUndefined()
})

test('project as shown on the first line', () => {
  expect(fmtProject({ name: 'claude-usage-bar', branch: 'main' })).toBe('claude-usage-bar (main)')
  expect(fmtProject({ name: 'notes' })).toBe('notes')
  const head = buildHead({
    main: { model: 'claude-fable-5-1', effort: 'high' },
    agents: {},
    project: { name: 'claude-usage-bar', branch: 'main' },
  })
  expect(head).toEqual({
    project: 'claude-usage-bar (main)',
    model: 'fable-5-1 · high',
    agents: undefined,
  })
  expect(buildHead({ main: null, agents: {}, project: null }).project).toBeUndefined()
})

// an in-memory disk: a path is a file when it is a key, a folder when some key lives under it
const disk = (files: Record<string, string>) => {
  const norm = (path: string) => {
    const parts: string[] = []
    for (const part of path.replace(/\\/g, '/').split('/')) {
      if (part === '..') parts.pop()
      else if (part !== '.') parts.push(part)
    }
    return parts.join('/').replace(/\/+$/, '')
  }
  const keys = Object.keys(files).map(norm)
  const body = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]))

  return {
    fs: {
      stat: async (path: string) => {
        const p = norm(path)
        if (body.has(p)) return { kind: 'file' }
        if (keys.some(k => k.startsWith(`${p}/`))) return { kind: 'dir' }
        throw new Error(`ENOENT ${path}`)
      },
      read: async (path: string) => {
        const text = body.get(norm(path))
        if (text === undefined) throw new Error(`ENOENT ${path}`)
        return text
      },
    },
  }
}

test('finds the branch: repo root, a subfolder, a worktree, detached HEAD and no repo', async () => {
  const $ = disk({
    'D:/p/repo/.git/HEAD': 'ref: refs/heads/dev\n',
    'D:/p/repo/src/deep/file.txt': 'x',
    'D:/p/main/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature/wt\n',
    'D:/p/wt/.git': 'gitdir: D:/p/main/.git/worktrees/wt\n',
    'D:/p/detached/.git/HEAD': 'e58d53c3a1b2c3d4e5f60718293a4b5c6d7e8f90\n',
    'D:/p/plain/note.txt': 'x',
  })

  expect(await findBranch($, 'D:/p/repo')).toBe('dev')
  expect(await findBranch($, 'D:/p/repo/src/deep')).toBe('dev')
  expect(await findBranch($, 'D:\\p\\repo\\src\\deep')).toBe('dev')
  expect(await findBranch($, 'D:/p/repo/')).toBe('dev')
  expect(await findBranch($, 'D:/p/wt')).toBe('feature/wt')
  expect(await findBranch($, 'D:/p/detached')).toBe('e58d53c')
  expect(await findBranch($, 'D:/p/plain')).toBeUndefined()
})

test('finds the branch with POSIX paths, home folders and the filesystem root', async () => {
  const $ = disk({
    '/home/me/work/app/.git/HEAD': 'ref: refs/heads/main\n',
    '/home/me/work/app/packages/ui/index.ts': 'x',
    '/home/me/work/wt/.git': 'gitdir: ../app/.git/worktrees/wt\n',
    '/home/me/work/app/.git/worktrees/wt/HEAD': 'ref: refs/heads/fix/wt\n',
    '/srv/site/.git/HEAD': 'ref: refs/heads/prod\n',
    '/.git/HEAD': 'ref: refs/heads/rootrepo\n',
    '/home/me/empty/readme.md': 'x',
  })

  expect(await findBranch($, '/home/me/work/app')).toBe('main')
  expect(await findBranch($, '/home/me/work/app/packages/ui')).toBe('main')
  expect(await findBranch($, '/home/me/work/wt')).toBe('fix/wt')
  expect(await findBranch($, '/srv/site')).toBe('prod')
  expect(await findBranch($, '/home/me/empty')).toBeUndefined()
  expect(baseName('/home/me/work/app')).toBe('app')
  expect(baseName('/')).toBe('/')
})

test('a folder outside any repository gives no branch, however deep', async () => {
  const $ = disk({ '/a/b/c/d/e/f/g/h/i/j/k.txt': 'x' })
  expect(await findBranch($, '/a/b/c/d/e/f/g/h/i/j')).toBeUndefined()
})
