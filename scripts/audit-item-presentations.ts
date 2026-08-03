import { ITEMS } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { itemPresentationFamily } from "../app/game/item-presentation.ts";
import { itemIconKind } from "../app/game/VoxelGame.tsx";

const counts = new Map<string, number>();
const failures: string[] = [];
let meshes = 0;

for (const definition of Object.values(ITEMS)) {
  const icon = itemIconKind(definition.id);
  const family = itemPresentationFamily(definition.id);
  counts.set(family, (counts.get(family) ?? 0) + 1);
  if (["item", "block", "crafted-component"].includes(icon)) failures.push(`${definition.name}: generic inventory icon ${icon}`);
  if (family === "crafted-component") failures.push(`${definition.name}: unresolved presentation family`);
  const model = createAvatarHeldItemModel(definition.id);
  let modelMeshes = 0;
  model?.traverse((object) => { if (object.type === "Mesh") modelMeshes += 1; });
  meshes += modelMeshes;
  if (!model || modelMeshes === 0) failures.push(`${definition.name}: no held/drop geometry`);
  if (model?.userData.itemPresentationFamily !== family) failures.push(`${definition.name}: model family metadata mismatch`);
  model?.traverse((object) => {
    const renderable = object as typeof object & { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
    renderable.geometry?.dispose();
    for (const material of Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : []) material.dispose();
  });
}

console.log(`Item presentation audit: ${Object.keys(ITEMS).length} catalog entries · ${meshes} authored mesh parts`);
for (const [family, count] of [...counts].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${String(count).padStart(3, " ")}  ${family}`);
}
if (failures.length) {
  console.error(`\n${failures.length} presentation issue(s):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else console.log("\nPASS · no generic inventory, held, or dropped-item presentation fallbacks remain.");
