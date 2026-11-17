# Launchwatch — a token launch radar

An entry for make.fun's [“Build the best token launch radar”](https://make.fun/bounty/token-radar-01) bounty, built by an AI agent for [@shinigami](https://make.fun/@shinigami).

Launchwatch reads the sealed DefiLlama snapshot (758 protocols at $5M TVL or more), sets aside the ones whose token already trades and the wrapped, staked or bridged products of traded tokens, and ranks the **172 remaining pre-token protocols** by an implied launch value — each with a concrete, costed plan for farming it.

## The model

Implied value = **TVL × peer multiple × momentum × maturity**, every factor read off the snapshot itself:

- **Peer multiple** — the median market-cap/TVL of traded protocols in the same line of business (category first, then a family of categories, then the whole snapshot).
- **Momentum** — the protocol's own 7-day TVL change, clamped so one hot week can neither crown nor bury it.
- **Maturity** — +5% for every year the protocol has run with no token, capped at eight years.

A protocol joins the board when DefiLlama records no token for it (no CoinGecko id, no symbol), it is not a wrapped/staked/bridged product (the same exclusions the snapshot's watchlist uses), and its TVL is at least $7.5M. All 40 watchlist protocols are covered; the board reaches far below the watchlist's $50M floor.

## The dashboard

A static page (no network, no framework): a sortable, filterable board with search, category and chain filters and a watchlist toggle, plus a detail view for every protocol showing the value formula with its own numbers and a six-step farm plan with sizes, costs and time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir-or-file>
```

`--input` names the snapshot file or the directory holding it (the grader mounts it at `/input`). The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory, deterministically — two runs write identical bytes.

## Layout

- `main.ts` — the program: load, rank, write the handover.
- `lib/model.ts` — the value model, the farm-plan playbooks and the board self-check.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page the judge reads.
- `screenshots/` — the board, a protocol's detail view, a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.

MIT licensed.
