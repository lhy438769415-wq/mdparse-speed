import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';
// This single-batch CLI benefits from avoiding optimizing-compiler startup work.
setFlagsFromString('--no-opt');
const source = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(source, 'cases.json'), 'utf8'));
const results = cases.map((entry: { markdown: string }) => parse(entry.markdown));
mkdirSync(destination, { recursive: true });
writeFileSync(join(destination, 'html.json'), JSON.stringify(results));
