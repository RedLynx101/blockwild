import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, type AdventureMobKind } from "../app/game/mobs.ts";
import { objectToInspectionSpec, renderModelInspection, type InspectionModelSpec } from "./render-models.ts";

const LIMB_AUDIT_KINDS = ["auric-scarab", "rootwrithe", "bellroot-matron"] as const satisfies readonly AdventureMobKind[];
type AuditPose = "neutral" | "motion";

function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}

/** Reproduces the production runtime limb channels at a readable gait/windup phase. */
function applyMotionPose(kind: (typeof LIMB_AUDIT_KINDS)[number], model: ReturnType<typeof createMobVisual>) {
  const gait = 1.1;
  const legSwingAmplitude = kind === "auric-scarab" ? 0.34 : kind === "rootwrithe" ? 0.18 : 0.12;
  for (const leg of model.parts.legs) leg.rotation.x = Math.sin(gait + Number(leg.userData.phase ?? 0)) * legSwingAmplitude;
  for (const arm of model.parts.arms) arm.rotation.x = Math.sin(gait + Number(arm.userData.phase ?? 0)) * 0.5 - 1.1;
}

function createAuditSpec(kind: (typeof LIMB_AUDIT_KINDS)[number], pose: AuditPose): InspectionModelSpec {
  const model = createMobVisual(kind, -1337);
  if (pose === "motion") applyMotionPose(kind, model);
  const runtime = new THREE.Group();
  runtime.name = `${kind}-${pose}-limb-audit`;
  runtime.add(model.group);
  model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
  const spec = objectToInspectionSpec(runtime, {
    id: `v13-${kind}-${pose}`,
    label: `${MOB_DEFS[kind].name} · ${pose === "neutral" ? "Neutral" : "Stride / Windup"}`,
    category: "mob",
    front: "-z",
    groundY: 0,
    inspection: { source: "MobVisual", mob: kind },
  });
  dispose(runtime);
  return spec;
}

export async function renderV13LimbAudit(out = path.resolve("output/v1-3-limb-audit")) {
  const specs = LIMB_AUDIT_KINDS.flatMap((kind) => [createAuditSpec(kind, "neutral"), createAuditSpec(kind, "motion")]);
  return renderModelInspection({ out, columns: 3, views: ["iso", "front"], specs });
}

async function main() {
  const result = await renderV13LimbAudit(path.resolve(process.argv[2] ?? "output/v1-3-limb-audit"));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
