// Copies the single-file game into the Electron shell (desktop/game/index.html) with a full document wrapper.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const page = readFileSync('artifact/the-deep-hours.html', 'utf8');
mkdirSync('desktop/game', { recursive: true });
writeFileSync('desktop/game/index.html', `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n${page}</html>\n`);
console.log('wrote desktop/game/index.html');
