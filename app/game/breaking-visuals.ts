import * as THREE from "three";
import { BLOCKS, ITEMS, type BlockDefinition, type ItemCode } from "./data";

export const BREAK_CRACK_STAGES = 8;
export type ToolEffectiveness = "preferred" | "usable" | "poor" | "blocked";

export function breakCrackStage(progress: number) {
  if (!Number.isFinite(progress) || progress <= 0) return -1;
  return Math.min(BREAK_CRACK_STAGES - 1, Math.floor(Math.min(0.9999, progress) * BREAK_CRACK_STAGES));
}

export function toolEffectivenessFor(block: BlockDefinition | undefined, heldItem: ItemCode | null | undefined): ToolEffectiveness {
  if (!block || block.id === 0) return "usable";
  const held = heldItem === null || heldItem === undefined ? undefined : ITEMS[heldItem];
  if (block.requiredTier > (held?.tier ?? 0)) return "blocked";
  if (block.preferredTool === "hand") return "preferred";
  if (held?.toolKind === block.preferredTool) return "preferred";
  if (block.hardness <= 0.15) return "usable";
  return held?.toolKind ? "poor" : "poor";
}

export function toolEffectivenessForIds(blockId: number | undefined, heldItem: ItemCode | null | undefined) {
  return toolEffectivenessFor(blockId === undefined ? undefined : BLOCKS[blockId], heldItem);
}

export const TOOL_OUTLINE_COLORS: Readonly<Record<ToolEffectiveness, number>> = Object.freeze({
  preferred: 0x8ee6a2,
  usable: 0xf3e5b1,
  poor: 0xd99a77,
  blocked: 0xc85d5d,
});

/** Generates a low-cost transparent crack sheet; stage is selected by UV offset. */
export function createBreakingCrackTexture() {
  if (typeof document === "undefined") return null;
  const tile = 32;
  const canvas = document.createElement("canvas");
  canvas.width = tile * BREAK_CRACK_STAGES;
  canvas.height = tile;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "square";
  for (let stage = 0; stage < BREAK_CRACK_STAGES; stage += 1) {
    const ox = stage * tile;
    context.strokeStyle = `rgba(28, 24, 20, ${0.34 + stage * 0.07})`;
    context.lineWidth = 1.1 + stage * 0.08;
    const branches = 2 + stage;
    for (let branch = 0; branch < branches; branch += 1) {
      const angle = (branch / branches) * Math.PI * 2 + stage * 0.31;
      let x = ox + tile / 2;
      let y = tile / 2;
      context.beginPath();
      context.moveTo(x, y);
      for (let segment = 1; segment <= 2 + Math.floor(stage / 2); segment += 1) {
        const length = 3.2 + segment * 2 + stage * 0.32;
        x = ox + tile / 2 + Math.cos(angle + segment * 0.18 * (branch % 2 ? 1 : -1)) * length;
        y = tile / 2 + Math.sin(angle + segment * 0.18 * (branch % 2 ? 1 : -1)) * length;
        context.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      }
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(1 / BREAK_CRACK_STAGES, 1);
  texture.needsUpdate = true;
  return texture;
}

export function setBreakingCrackTextureStage(texture: THREE.Texture, stage: number) {
  const bounded = Math.max(0, Math.min(BREAK_CRACK_STAGES - 1, Math.floor(stage)));
  texture.repeat.set(1 / BREAK_CRACK_STAGES, 1);
  texture.offset.set(bounded / BREAK_CRACK_STAGES, 0);
  texture.needsUpdate = true;
}
