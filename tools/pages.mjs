import { listPages } from './cdp.mjs';
const pages = await listPages();
for (const p of pages) {
  console.log(`[${p.type}] ${p.title}\n    ${p.url.slice(0, 140)}\n    ${p.id}`);
}
