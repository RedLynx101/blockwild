import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WIKI_CATEGORY_ORDER, WIKI_ENTRIES, WIKI_SCHEMA, wikiIndex } from "../app/game/wiki-content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "knowledge");

async function main() {
  await mkdir(output, { recursive: true });
  const categories = Object.fromEntries(WIKI_CATEGORY_ORDER.map((category) => [
    category,
    WIKI_ENTRIES.filter((entry) => entry.category === category).length,
  ]));
  await writeFile(path.join(output, "index.json"), `${JSON.stringify({
    schema: WIKI_SCHEMA,
    generatedFrom: "app/game/wiki-content.ts",
    categories,
    entries: wikiIndex(),
  })}\n`, "utf8");
  for (const category of WIKI_CATEGORY_ORDER) {
    await writeFile(path.join(output, `${category}.json`), `${JSON.stringify({
      schema: WIKI_SCHEMA,
      category,
      entries: WIKI_ENTRIES.filter((entry) => entry.category === category),
    })}\n`, "utf8");
  }
  process.stdout.write(`Built ${WIKI_ENTRIES.length} wiki entries in ${output}.\n`);
}

await main();
