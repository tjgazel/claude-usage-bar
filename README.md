# claude-usage-bar

A [Claude Code](https://claude.com/claude-code) mod that draws a two-line usage bar above the prompt:

```
claude-usage-bar (main)  │  fable-5-1 · high  │  ⎇ Explore haiku-5-5 · low
ctx ▰▰▱▱▱ 38% 76k/200k  │  5h ◑ 55% ↻ 2h10  │  week ◕ 80% ↻ 3d  │  $1.50  │  ↑45k (cache 1.2M) ↓12.4k
```

**Line 1**:

- the project folder and its git branch, dimmed (`claude-usage-bar (main)`; a detached HEAD shows the short hash, and a folder outside a git repository shows just its name);
- the main model and its reasoning effort, in bold;
- every subagent that is running, with its type, model and effort, in bold (`⎇ Explore haiku-5-5 · low`; up to two are named, then `+N`).

**Line 2**:

- `ctx`: how full the context window is, as a 5-block bar, with tokens used / window size;
- `5h` and `week`: how much of the 5-hour and the weekly limit is used, as a pie that fills up (`○ ◔ ◑ ◕ ●`), with the time until each one resets (`↻`);
- `$`: the cost of the session so far, as `/cost` totals it;
- `↑` / `↓`: input and output tokens of the session, subagents included; `(cache …)` is what the prompt cache served.

`ctx`, `5h` and `week` change color with usage, following your theme (`success`, `warning`, `error`):

| Used | Color |
| --- | --- |
| below 50% | green |
| 50% to 75% | yellow |
| above 75% | red |

A toast also warns once per window when the 5-hour or the weekly limit passes 90%.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-bar --marketplace tjgazel/claude-usage-bar
```

Claude Code asks `Add marketplace?`: answer `y`, then pick a scope (user scope is the first option). It prints `Installed usage-bar. Plugin is now active.` and the bar shows up with no reload.

From a shell instead:

```
claude plugin install usage-bar --marketplace tjgazel/claude-usage-bar
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `tjgazel/claude-usage-bar`, then **Add plugin**.

To remove it: `claude plugin uninstall usage-bar`.

## Notes

- The bar is drawn in the band above the prompt, because that is the only place a mod can use colors. The status line under the prompt is plain text and always carries the mod's name, so it is not used.
- The band is drawn on the terminal and desktop surfaces. You can collapse it with `ctrl+x ctrl+a`, and it steps aside while a survey is shown.
- The 5-hour and weekly limits only exist on a subscription. Without one, or before the first response of a session, they show `–`, with a dim *waiting for the first response* hint at the end of the line.
- The colors and the 50% / 75% thresholds are in `hooks/register.tsx` (`tone`).

## Language

The data on the bar is always the same: English labels and US formats (`week`, `$1.50`, `12.4k`), whatever the language. Only the messages follow the `language` setting of Claude Code: when it is Portuguese (`portuguese`, `Português`, `pt`, `pt-BR`), the *waiting for the first response* hint and the 90% limit toast are shown in Portuguese. Any other language falls back to English. The setting is read each time the bar is drawn.

## Develop

```
claude --plugin-dir <path to this folder>
claude plugin validate .
claude plugin test .
```

The formatting (token abbreviation, thresholds, reset time, language) is covered by `hooks/register.test.ts`.

## License

MIT, see [LICENSE](LICENSE).

---

## Português

Mod do Claude Code que desenha acima do prompt uma barra de uso em duas linhas: modelo/esforço e subagentes em execução na primeira; contexto, limite de 5h, limite semanal, custo e tokens (entrada, saída e cache) na segunda. Contexto e limites mudam de cor: verde abaixo de 50%, amarelo de 50% a 75% e vermelho acima. Os dados da barra ficam sempre em inglês e no formato americano (`week`, `$1.50`, `12.4k`); só as mensagens (o aviso de espera e o aviso dos 90%) seguem o idioma configurado no Claude Code, em português quando `language` é português.

### Instalação

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install usage-bar --marketplace tjgazel/claude-usage-bar
```

Responda `y` em `Add marketplace?` e escolha o escopo (o de usuário é a primeira opção). Quando aparecer `Installed usage-bar. Plugin is now active.`, a barra já está ativa, sem precisar recarregar.

Pelo shell:

```
claude plugin install usage-bar --marketplace tjgazel/claude-usage-bar
```

No app desktop, onde `/plugin` não funciona: clique em **+** ao lado da caixa de prompt, depois em **Plugins**, **Add marketplace** com `tjgazel/claude-usage-bar` e **Add plugin**.

Para remover: `claude plugin uninstall usage-bar`.
