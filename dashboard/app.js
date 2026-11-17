// Launchwatch page logic: renders window.RADAR (written by main.ts beside
// this page) as a sortable, filterable board with a detail view per protocol.
// No network, no framework: the whole page runs from the two files it ships.

const radar = window.RADAR;
const rows = radar.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));

const state = { q: '', category: '', chain: '', watchOnly: false, sort: 'rank', selected: null };

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  return money(n);
};
const pct = (v) => {
  if (v === null) return '<span class="flat">n/a</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fillStats() {
  const totalImplied = rows.reduce((sum, r) => sum + r.implied_value_usd, 0);
  const watchCount = rows.filter((r) => r.watchlist).length;
  $('stats').innerHTML = [
    [String(radar.scanned), 'protocols scanned'],
    [String(rows.length), 'on the board'],
    [`${watchCount}/${radar.watchlist_total}`, 'watchlist covered'],
    [moneyShort(totalImplied), 'combined implied value'],
  ].map(([v, label]) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`).join('');
  $('asof').textContent = radar.as_of;
  $('scanned').textContent = String(radar.scanned);
}

function fillFilters() {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  $('category').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

function visible() {
  const q = state.q.trim().toLowerCase();
  let list = rows.filter((r) =>
    (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (state.category === '' || r.category === state.category) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (!state.watchOnly || r.watchlist));
  const key = state.sort;
  const by = {
    rank: (a, b) => a.rank - b.rank,
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => b.age_years - a.age_years,
    name: (a, b) => a.name.localeCompare(b.name),
  }[key];
  return list.sort(by);
}

function render() {
  const list = visible();
  $('count').textContent = `${list.length} of ${rows.length} protocols`;
  $('empty').hidden = list.length > 0;
  $('rows').innerHTML = list.map((r) => `
    <tr data-slug="${r.slug}">
      <td class="num">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.watchlist ? '<span class="badge">watchlist</span>' : ''}<br><span class="pcat">${esc(r.category ?? 'Uncategorised')}</span></td>
      <td class="num">${money(r.implied_value_usd)}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${pct(r.change_7d)}</td>
      <td class="num">${r.age_years}y</td>
      <td>${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="open-hint">plan &rarr;</td>
    </tr>`).join('');
  for (const tr of document.querySelectorAll('#rows tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  }
}

function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  state.selected = slug;
  const d = $('detail');
  d.hidden = false;
  d.innerHTML = `
    <button class="close" id="closeDetail">Close</button>
    <h2>${esc(r.name)} <span class="badge">rank #${r.rank}</span>${r.watchlist ? '<span class="badge">watchlist</span>' : ''}</h2>
    <p class="sub">${esc(r.category ?? 'Uncategorised')} &middot; records no token in the snapshot &middot; tracked since ${r.listed_at ?? 'an unreported date'}</p>
    <p class="formula">${money(r.tvl_usd)} TVL &times; <b>${r.multiple}&times;</b> peer multiple &times; <b>${r.momentum}</b> momentum &times; <b>${r.maturity}</b> maturity = <b>${money(r.implied_value_usd)}</b></p>
    <p class="basis">Peer multiple: ${esc(r.multiple_basis)}. Momentum from its own 7-day TVL change (${r.change_7d === null ? 'unreported, counted as flat' : r.change_7d.toFixed(1) + '%'}). Maturity: ${r.age_years} years with no token.</p>
    <dl class="kv">
      <div><dt>Implied value</dt><dd>${money(r.implied_value_usd)}</dd></div>
      <div><dt>TVL</dt><dd>${money(r.tvl_usd)}</dd></div>
      <div><dt>7-day change</dt><dd>${r.change_7d === null ? 'n/a' : r.change_7d.toFixed(2) + '%'}</dd></div>
      <div><dt>Years tokenless</dt><dd>${r.age_years}</dd></div>
      <div><dt>Chains</dt><dd>${esc(r.chains.join(', '))}</dd></div>
    </dl>
    <h3>How to farm it</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('closeDetail').addEventListener('click', () => { d.hidden = true; state.selected = null; });
  d.scrollIntoView({ block: 'nearest' });
}

function wire() {
  $('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  $('category').addEventListener('change', (e) => { state.category = e.target.value; render(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
  $('watchOnly').addEventListener('change', (e) => { state.watchOnly = e.target.checked; render(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
}

// Screenshot poses: ?view=detail&slug=<slug> opens that protocol's detail;
// ?view=filter&category=<name> (or &watchlist=1) applies a filter. The page
// itself is the renderer's own state, nothing is faked for the camera.
function applyShotPose() {
  const params = new URLSearchParams(location.search);
  if (params.get('watchlist') === '1') { state.watchOnly = true; $('watchOnly').checked = true; }
  const cat = params.get('category');
  if (cat) { state.category = cat; $('category').value = cat; }
  const chain = params.get('chain');
  if (chain) { state.chain = chain; $('chain').value = chain; }
  render();
  const slug = params.get('slug');
  if (params.get('view') === 'detail' && slug && bySlug.has(slug)) openDetail(slug);
}

fillStats();
fillFilters();
wire();
applyShotPose();
window.__ready = true;
