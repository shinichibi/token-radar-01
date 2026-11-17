// Launchwatch: a token launch radar for make.fun's token-radar-01 bounty.
//
// One run does the whole job. It loads the sealed snapshot the grader mounts
// at /input (or the file named by --input), ranks every qualifying pre-token
// protocol with the model in lib/model.ts, and writes the handover into
// /output (or $MAKEFUN_OUTPUT_DIR): board.json for the scorer, data.js for
// the page, the dashboard/ and screenshots/ folders copied across, and
// dossier.json written last with the vendored library, because the scorer
// rebuilds the dossier from those very files and compares it byte for byte.
// The run is deterministic: nothing here reads a clock or a random source,
// so the grader's two runs write identical bytes.
//
// Local dry run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit-dir/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = dirname(fileURLToPath(import.meta.url));

/** Read `--name value` or `--name=value` from the arguments, else the fallback. */
function option(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at !== -1 && args[at + 1] !== undefined) return args[at + 1]!;
  const joined = args.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

const inputPath = option('input', '/input');
const snapshotFile = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write(`launchwatch: no snapshot at ${snapshotFile} (pass --input <file|dir>)\n`);
  process.exit(2);
}
const outDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write(`launchwatch: refusing to hand in a board the gate would refuse: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a folder's plain files (dot names skipped) and return the names copied. */
function copyFolder(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    names.push(name);
  }
  return names;
}

copyFolder(join(root, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyFolder(join(root, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`launchwatch: screenshots/ holds ${shots.length} images; the handover needs 3 (board, detail, filtered)\n`);
  process.exit(1);
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `launchwatch: scanned ${radar.scanned} protocols, set aside ${radar.live_set_aside} with a token and ${radar.set_aside} wrapped or staked products, ranked ${board.length} pre-token protocols\n`,
);
