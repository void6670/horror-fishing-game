// Inlines the Vite build into a single self-contained HTML page (artifact/the-deep-hours.html).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const dir = 'dist/assets';
const files = readdirSync(dir);
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/g, '<\\/script');
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/the-deep-hours.html', `<title>The Deep Hours</title>\n<style>:root{color-scheme:dark} html,body{background:#050607}\n${css}</style>\n<canvas id="game"></canvas>\n<div id="ui"></div>\n<script type="module">\n${js}\n</script>\n`);
console.log('wrote artifact/the-deep-hours.html');
