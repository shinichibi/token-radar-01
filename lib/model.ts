// Launchwatch model: turn the sealed DefiLlama snapshot into a ranked board of
// protocols that record no token yet, each with an implied launch value and a
// concrete plan for farming it.
//
// The value model is read off the snapshot itself, never off a list of names:
//   implied = TVL x peer multiple x momentum x maturity
// - peer multiple: the median market-cap/TVL ratio of the protocols in the
//   same line of business whose token already trades (category first, then a
//   hand-grouped family of categories, then the whole snapshot).
// - momentum: the protocol's own 7-day TVL change, clamped so one hot week
//   can neither crown nor bury a protocol.
// - maturity: a small premium for every year the protocol has run with no
//   token, capped at eight years: the longer it has operated tokenless, the
//   more product a launch would be capitalising.
// A protocol counts as pre-token when its record carries neither a CoinGecko
// id nor a symbol. Wrapped, staked and bridged products of a token that
// already trades are set aside with the same tests the snapshot's own
// watchlist uses, so every watchlist slug qualifies for the board by
// construction; the board then goes far below the watchlist's $50M floor.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number;
  multiple: number;
  multiple_basis: string;
  momentum: number;
  maturity: number;
  watchlist: boolean;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  scanned: number;
  watchlist_total: number;
  tokenless: number;
  set_aside: number;
  live_set_aside: number;
  rows: RadarRow[];
}

/** The board's size line: every qualifying protocol at or above this TVL. */
export const BOARD_FLOOR_USD = 7_500_000;

const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const PRODUCT_WORDS = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** True when the protocol records a token (either id or symbol present). */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** True when the protocol is a wrapped, staked or bridged product, or a re-run of one. */
export function isProduct(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (PRODUCT_WORDS.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `));
}

/** Category families for the peer multiple when a category has too few traded peers. */
const FAMILIES: Record<string, string> = {
  Dexs: 'trading',
  Derivatives: 'trading',
  Lending: 'credit',
  CDP: 'credit',
  Yield: 'yield',
  'Yield Aggregator': 'yield',
  'Risk Curators': 'yield',
  'Onchain Capital Allocator': 'yield',
  'Basis Trading': 'yield',
  'Staking Pool': 'yield',
  RWA: 'rwa',
  Chain: 'infra',
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median mcap/TVL for a set of traded protocols, or null when the set is too thin to trust. */
function peerMedian(peers: Protocol[]): number | null {
  const ratios = peers
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => p.mcap_usd! / p.tvl_usd);
  return ratios.length >= 3 ? median(ratios) : null;
}

/** The multiple for one protocol, and a plain-words note of where it came from. */
function multipleFor(p: Protocol, all: Protocol[]): { multiple: number; basis: string } {
  const traded = all.filter((q) => recordsToken(q));
  if (p.category !== null) {
    const sameCategory = peerMedian(traded.filter((q) => q.category === p.category));
    if (sameCategory !== null) return { multiple: sameCategory, basis: `median of traded ${p.category} protocols` };
    const family = FAMILIES[p.category];
    if (family !== undefined) {
      const sameFamily = peerMedian(traded.filter((q) => FAMILIES[q.category ?? ''] === family));
      if (sameFamily !== null) return { multiple: sameFamily, basis: `median of traded ${family} protocols` };
    }
  }
  const global = peerMedian(traded);
  return { multiple: global ?? 1, basis: 'median of every traded protocol in the snapshot' };
}

/** Whole years between the day DefiLlama began tracking the protocol and the snapshot date. */
export function ageYears(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 0;
  const days = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.floor(days / 365.25));
}

function momentumOf(p: Protocol): number {
  if (p.change_7d === null) return 1;
  const clamped = Math.min(60, Math.max(-30, p.change_7d));
  return 1 + clamped / 250;
}

function maturityOf(years: number): number {
  return 1 + 0.05 * Math.min(years, 8);
}

/** Working-capital guidance scaled to the protocol's size, so steps stay concrete. */
function sizeTier(tvl: number): string {
  if (tvl >= 500_000_000) return '$2,000-$10,000 of working capital';
  if (tvl >= 100_000_000) return '$1,000-$5,000 of working capital';
  if (tvl >= 25_000_000) return '$500-$2,500 of working capital';
  return '$250-$1,000 of working capital';
}

/** Gas reality by the chain the position lives on. */
function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'budget $15-$60 a month for Ethereum mainnet gas at typical fees';
  return `gas on ${chain} is cheap: budget $1-$5 a month at typical fees`;
}

/**
 * Five concrete steps per protocol, written from its line of business and
 * interpolated with its own name, main chain and size. Every step names an
 * action, a size or cadence, and what it costs or how long it takes; nothing
 * here invents a points programme, so each plan tells the reader where to
 * check whether one is running.
 */
export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chainCount = p.chains.length;
  const size = sizeTier(p.tvl_usd);
  const gas = gasNote(chain);
  const open = `Set up one clean wallet for ${p.name} alone and fund it on ${chain} with ${size}; a separate wallet keeps this farm's history readable and its risk contained. Setup takes about 20 minutes.`;
  const check = `Before depositing anything, open ${p.name}'s app and read its rewards or points page end to end: farm only what the page actually credits, and note the season dates if one is running. Ten minutes, once.`;
  const close = `Keep a simple log of every deposit, trade and claim with dates and transaction hashes; if a snapshot or claim is ever announced, that log is your proof and your checklist. Five minutes a week.`;
  const spread = chainCount > 1
    ? `${p.name} runs on ${chainCount} chains: keep the main position on ${chain} and make one small genuine transaction on a second chain, so the wallet is not a single-chain ghost. About $10 of extra gas, once.`
    : `Stay active in two separate months rather than one busy week: a position opened this month and still held next month reads as a user, not a drive-by. No extra cost beyond the position itself.`;
  let core: string[] = [];
  switch (p.category) {
    case 'Dexs':
      core = [
        `Trade on ${p.name} every week rather than in one burst: two or three swaps of $100-$500 each, in pairs you would plausibly use, for at least eight weeks. ${gas} plus spread and slippage of roughly 0.1-0.5% a trade.`,
        `Add a small liquidity position in one core pair on ${chain} and leave it for a full month; providing liquidity is the behaviour a young exchange most wants to reward. Watch the position weekly for impermanent loss: 10 minutes.`,
      ];
      break;
    case 'Lending':
      core = [
        `Supply a blue-chip asset (ETH or a major stablecoin) to ${p.name} on ${chain} and keep it supplied for at least two full months; lenders who stay through a whole season are the ones a launch usually counts. ${gas}.`,
        `Borrow conservatively against the position, never above 40% of the borrow limit, and repay within the same month: real borrowers matter to a lending market, liquidated ones do not. Check the health factor weekly, 5 minutes.`,
      ];
      break;
    case 'Derivatives':
      core = [
        `Open small perpetual positions on ${p.name} in both directions across at least eight separate weeks, $50-$200 of margin at low leverage, and close them yourself before funding costs mount. Target steady volume, not profit.`,
        `Keep total exposure under a quarter of the wallet at all times and never chase a loss back; a derivatives farm is a marathon of ordinary trades. Budget trading fees of about 0.05% a fill plus ${gas}.`,
      ];
      break;
    case 'CDP':
      core = [
        `Open a vault on ${p.name} with collateral worth at least twice the stablecoin you mint, and hold the position open for a full quarter; CDP protocols reward vaults that survive, not vaults that flash. ${gas}.`,
        `Use the minted stablecoin inside the same ecosystem (a swap or a deposit elsewhere on ${chain}) so the position shows a real purpose, and check the liquidation price weekly: 5 minutes.`,
      ];
      break;
    case 'RWA':
      core = [
        `Complete ${p.name}'s onboarding and KYC early even before depositing: real-world-asset platforms gate deposits behind verification, and a verified account predating any announcement is the cheapest step there is. About 30 minutes.`,
        `Deposit the platform minimum into one asset and hold it for at least one full distribution cycle; RWA yields pay holders of record, so note each record date in your log. Minimums are often $100-$1,000.`,
      ];
      break;
    case 'Chain':
      core = [
        `Bridge a working balance to ${p.name} and use two or three native applications every week: a swap, a lend, a mint. A chain rewards wallets that look like residents. ${gas}.`,
        `Run activity on at least ten separate days across two months rather than one weekend; day-count is the cheapest sybil filter a chain can apply, and it is the one farmers most often fail.`,
      ];
      break;
    default:
      core = [
        `Put a real position into ${p.name}'s core product on ${chain} and keep it there for at least two months; protocols reward capital and usage that stays, so size it with ${size} and leave it alone. ${gas}.`,
        `Use one secondary feature of ${p.name} each month (a second vault, market or route) so the wallet shows breadth, not a single repeated click. About 15 minutes a month.`,
      ];
      break;
  }
  return [open, check, core[0]!, core[1]!, spread, close].slice(0, 6);
}

/** Parse and lightly validate the snapshot bytes. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is missing its protocols or watchlist');
  }
  return raw;
}

/** Build the ranked board and the richer radar rows the dashboard renders. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const watch = new Set(snapshot.watchlist);
  const tokenless = snapshot.protocols.filter((p) => !recordsToken(p));
  const products = tokenless.filter((p) => isProduct(p));
  const qualifying = tokenless
    .filter((p) => !isProduct(p) && p.tvl_usd >= BOARD_FLOOR_USD)
    .map((p) => {
      const { multiple, basis } = multipleFor(p, snapshot.protocols);
      const years = ageYears(p, snapshot.as_of);
      const momentum = momentumOf(p);
      const maturity = maturityOf(years);
      const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity));
      return { p, multiple, basis, years, momentum, maturity, implied };
    })
    .sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: RadarRow[] = qualifying.map((q, i) => ({
    slug: q.p.slug,
    name: q.p.name,
    rank: i + 1,
    implied_value_usd: q.implied,
    farm_steps: farmSteps(q.p),
    category: q.p.category,
    chains: q.p.chains,
    tvl_usd: q.p.tvl_usd,
    change_7d: q.p.change_7d,
    listed_at: q.p.listed_at,
    age_years: q.years,
    multiple: Math.round(q.multiple * 1000) / 1000,
    multiple_basis: q.basis,
    momentum: Math.round(q.momentum * 1000) / 1000,
    maturity: Math.round(q.maturity * 1000) / 1000,
    watchlist: watch.has(q.p.slug),
  }));

  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));

  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    scanned: snapshot.protocols.length,
    watchlist_total: snapshot.watchlist.length,
    tokenless: tokenless.length,
    set_aside: products.length,
    live_set_aside: snapshot.protocols.length - tokenless.length,
    rows,
  };
  return { board, radar };
}

/** The gate's own rules, checked before anything is written: null means the board stands. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug} has a farm step of ${len} characters`;
    }
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1..${byRank.length}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${i + 1}`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: one script that sets window.RADAR. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
