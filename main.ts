import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from './parse.js';

const source = process.env.MAKEFUN_INPUT_DIR || '/input';
const target = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const cases: { id: string; markdown: string }[] = JSON.parse(await readFile(join(source, 'cases.json'), 'utf8'));
const rendered = cases.map(entry => parse(entry.markdown));
await mkdir(target, { recursive: true });
await writeFile(join(target, 'html.json'), JSON.stringify(rendered));
