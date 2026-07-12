import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Item } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import {
  objectToInspectionSpec,
  renderModelInspection,
  renderModelPortraits,
  type InspectionModelSpec,
} from "./render-models.ts";

const out = path.resolve(process.argv[2] ?? "output/metallic-dragons/eggs");
await mkdir(out, { recursive: true });

const eggs = [
  { item: Item.GoldDragonEgg, id: "gold-dragon-egg", label: "Gold Dragon Egg" },
  { item: Item.SilverDragonEgg, id: "silver-dragon-egg", label: "Silver Dragon Egg" },
] as const;

const specs: InspectionModelSpec[] = eggs.map(({ item, id, label }) => {
  const model = createAvatarHeldItemModel(item);
  if (!model) throw new Error(`${label} did not create its production held/drop model.`);
  return objectToInspectionSpec(model, {
    id,
    label,
    category: "utility",
    front: "-z",
    inspection: { source: "model-specs" },
  });
});

await renderModelInspection({ out, columns: 2, views: ["iso", "front", "side"], specs });
await renderModelPortraits({ out: path.join(out, "portraits"), columns: 2, specs, png: true });
console.log(JSON.stringify({ status: "rendered", out, specs: specs.map((spec) => spec.id) }, null, 2));
