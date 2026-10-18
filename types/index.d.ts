export type Totals = { input: number; cacheRead: number; output: number }
export type ModelLabel = { model: string; effort?: string }
export type AgentRun = ModelLabel & { type: string }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Measure = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Limit[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': {
      totals: Totals
      main: ModelLabel | null
      agents: Record<string, AgentRun>
      measure: Measure | null
      warned: string[]
    }
  }
}
