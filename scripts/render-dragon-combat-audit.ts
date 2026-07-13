import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  commitDragonCombatAttack,
  constrainDragonCombatPosition,
  createDragonCombatManeuverState,
  createDragonState,
  dragonCombatProfile,
  planDragonCombatManeuver,
  type DragonAttackKind,
  type DragonCombatPhase,
  type DragonPoint,
  type DragonType,
} from "../app/game/dragons.ts";

const OUTPUT = join(process.cwd(), "output", "dragon-combat-ai");
const TARGET = Object.freeze({ x: 0, y: 0, z: 0 });
const DT = 0.1;
const FRAMES = 380;
const PHASE_COLOR: Readonly<Record<DragonCombatPhase, string>> = Object.freeze({
  approach: "#74c7ec",
  "attack-run": "#f2cdcd",
  breakaway: "#fab387",
  orbit: "#a6e3a1",
  reposition: "#cba6f7",
});
const SPECIES_COLOR: Readonly<Record<DragonType, string>> = Object.freeze({
  fire: "#ff6b3d", ice: "#8cdfff", steel: "#b3c4cb", sea: "#45d6c7", gold: "#ffd34d", silver: "#d9e7ff",
});

type CombatSample = Readonly<{
  frame: number;
  seconds: number;
  phase: DragonCombatPhase;
  x: number;
  y: number;
  z: number;
  separation: number;
}>;

type CombatAudit = Readonly<{
  type: DragonType;
  style: string;
  minimumLaneSeparation: number;
  observedMinimumSeparation: number;
  phases: readonly DragonCombatPhase[];
  attacks: readonly Readonly<{ frame: number; kind: DragonAttackKind; x: number; z: number }>[];
  samples: readonly CombatSample[];
}>;

function moveToward(position: DragonPoint, destination: DragonPoint, distance: number): DragonPoint {
  const dx = destination.x - position.x;
  const dz = destination.z - position.z;
  const horizontal = Math.hypot(dx, dz);
  const step = Math.min(horizontal, distance);
  return {
    x: horizontal > 0.001 ? position.x + dx / horizontal * step : position.x,
    y: position.y + (destination.y - position.y) * Math.min(1, DT * 1.4),
    z: horizontal > 0.001 ? position.z + dz / horizontal * step : position.z,
  };
}

function simulate(type: DragonType, seed: number): CombatAudit {
  const dragonState = createDragonState(type, { dragonId: `${type}:combat-audit`, ageDays: 100 });
  const swimming = type === "sea";
  const profile = dragonCombatProfile(type, dragonState.stage, swimming);
  let maneuver = createDragonCombatManeuverState(seed);
  let position: DragonPoint = { x: profile.entryRadius + 6, y: profile.cruiseAltitude, z: profile.missDistance };
  const cooldowns: Record<DragonAttackKind, number> = { melee: 0, breath: 0, projectile: 0 };
  const attacks: Array<{ frame: number; kind: DragonAttackKind; x: number; z: number }> = [];
  const samples: CombatSample[] = [];
  const phases: DragonCombatPhase[] = [];
  let minimumSeparation = Infinity;

  for (let frame = 0; frame < FRAMES; frame += 1) {
    for (const kind of ["melee", "breath", "projectile"] as const) cooldowns[kind] = Math.max(0, cooldowns[kind] - DT);
    // The obscured interval proves the same production planner leaves its
    // attack lane to acquire a new sightline before re-entering.
    const lineOfSight = frame < 190 || frame >= 215;
    const plan = planDragonCombatManeuver({
      dragonState,
      maneuver,
      dt: DT,
      combatSeed: seed,
      targetToken: -1,
      dragonPosition: position,
      targetPosition: TARGET,
      lineOfSight,
      swimming,
      meleeReady: cooldowns.melee <= 0,
      breathReady: cooldowns.breath <= 0,
      projectileReady: cooldowns.projectile <= 0,
    });
    maneuver = plan.maneuver;
    if (phases.at(-1) !== maneuver.phase) phases.push(maneuver.phase);
    if (plan.attack) {
      attacks.push({ frame, kind: plan.attack.kind, x: position.x, z: position.z });
      cooldowns[plan.attack.kind] = plan.attack.cooldownSeconds;
      maneuver = commitDragonCombatAttack(maneuver, plan.attack.kind);
    }
    const speed = 3.8 + dragonState.stage * 1.25;
    position = constrainDragonCombatPosition(
      moveToward(position, plan.destination, speed * plan.speedScale * DT),
      TARGET,
      plan.minimumHorizontalSeparation,
      maneuver.passBearing,
    );
    const separation = Math.hypot(position.x, position.z);
    minimumSeparation = Math.min(minimumSeparation, separation);
    samples.push({
      frame,
      seconds: Number((frame * DT).toFixed(1)),
      phase: maneuver.phase,
      x: Number(position.x.toFixed(3)),
      y: Number(position.y.toFixed(3)),
      z: Number(position.z.toFixed(3)),
      separation: Number(separation.toFixed(3)),
    });
  }

  return {
    type,
    style: profile.style,
    minimumLaneSeparation: Number(profile.missDistance.toFixed(3)),
    observedMinimumSeparation: Number(minimumSeparation.toFixed(3)),
    phases,
    attacks,
    samples,
  };
}

function label(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderPanel(audit: CombatAudit, panelX: number, panelY: number) {
  const width = 360;
  const height = 305;
  const centerX = panelX + width / 2;
  const centerY = panelY + 166;
  const scale = 3.55;
  const pathSegments: Array<{ phase: DragonCombatPhase; points: string[] }> = [];
  for (let index = 1; index < audit.samples.length; index += 1) {
    const sample = audit.samples[index];
    const prior = audit.samples[index - 1];
    let segment = pathSegments.at(-1);
    if (!segment || segment.phase !== sample.phase) {
      segment = {
        phase: sample.phase,
        points: [`M ${centerX + prior.x * scale} ${centerY + prior.z * scale}`],
      };
      pathSegments.push(segment);
    }
    segment.points.push(`L ${centerX + sample.x * scale} ${centerY + sample.z * scale}`);
  }
  const path = pathSegments.map((segment) => `<path d="${segment.points.join(" ")}" fill="none" stroke="${PHASE_COLOR[segment.phase]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>`).join("");
  const attacks = audit.attacks.map((attack) => `<g transform="translate(${centerX + attack.x * scale} ${centerY + attack.z * scale})"><circle r="5.5" fill="${SPECIES_COLOR[audit.type]}" stroke="#111820" stroke-width="2"/><path d="M-2.5 0 L3.5 0 M1 -2.5 L3.5 0 L1 2.5" fill="none" stroke="#111820" stroke-width="1.4"/></g>`).join("");
  const safeRadius = audit.minimumLaneSeparation * scale;
  return `<g>
    <rect x="${panelX}" y="${panelY}" width="${width}" height="${height}" rx="18" fill="#17212a" stroke="#334554" stroke-width="2"/>
    <text x="${panelX + 18}" y="${panelY + 31}" class="species" fill="${SPECIES_COLOR[audit.type]}">${label(audit.type.toUpperCase())} DRAGON</text>
    <text x="${panelX + 18}" y="${panelY + 52}" class="detail">${label(audit.style)} | ${audit.attacks.length} attacks | min ${audit.observedMinimumSeparation.toFixed(1)} blocks</text>
    <circle cx="${centerX}" cy="${centerY}" r="${safeRadius}" fill="#0d141a" stroke="#ff879b" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.9"/>
    <line x1="${centerX - 9}" y1="${centerY}" x2="${centerX + 9}" y2="${centerY}" stroke="#ff879b" stroke-width="2"/>
    <line x1="${centerX}" y1="${centerY - 9}" x2="${centerX}" y2="${centerY + 9}" stroke="#ff879b" stroke-width="2"/>
    ${path}${attacks}
    <circle cx="${centerX + audit.samples.at(-1)!.x * scale}" cy="${centerY + audit.samples.at(-1)!.z * scale}" r="4" fill="#ffffff"/>
  </g>`;
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const audits = (["fire", "ice", "steel", "sea", "gold", "silver"] as const).map((type, index) => simulate(type, 41 + index * 17));
  const panels = audits.map((audit, index) => renderPanel(audit, 30 + (index % 3) * 380, 96 + Math.floor(index / 3) * 320)).join("");
  const legend = (Object.entries(PHASE_COLOR) as Array<[DragonCombatPhase, string]>).map(([phase, color], index) => `<g transform="translate(${44 + index * 154} 765)"><line x1="0" y1="0" x2="26" y2="0" stroke="${color}" stroke-width="5" stroke-linecap="round"/><text x="36" y="5" class="legend">${label(phase)}</text></g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#0b1117"/>
    <style>.title{font:700 28px system-ui,sans-serif;letter-spacing:1.5px}.subtitle,.detail,.legend{font:500 14px system-ui,sans-serif;fill:#bac8d3}.species{font:800 17px system-ui,sans-serif;letter-spacing:1px}.detail{font-size:11px}.legend{font-size:13px}</style>
    <text x="34" y="43" class="title" fill="#eef5f8">DRAGON COMBAT FLIGHT | PRODUCTION PLANNER</text>
    <text x="34" y="70" class="subtitle">Top-down; target at each cross. Dashed circle = protected miss lane. Paths = deterministic production phases.</text>
    ${panels}${legend}
  </svg>`;
  await writeFile(join(OUTPUT, "dragon-combat-trajectories.svg"), svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(join(OUTPUT, "dragon-combat-trajectories.png"));
  await writeFile(join(OUTPUT, "dragon-combat-trajectories.json"), JSON.stringify({
    generatedFrom: "app/game/dragons.ts#planDragonCombatManeuver",
    dt: DT,
    frames: FRAMES,
    target: TARGET,
    audits,
  }, null, 2), "utf8");
  console.log(`Dragon combat audit written to ${OUTPUT}`);
  for (const audit of audits) console.log(`${audit.type}: ${audit.style}, ${audit.attacks.length} attacks, ${audit.observedMinimumSeparation} block minimum separation`);
}

await main();
