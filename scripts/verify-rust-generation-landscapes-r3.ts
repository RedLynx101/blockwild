import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import * as THREE from "three";
import { BlockId } from "../app/game/data.ts";
import { LEGACY_TERRAIN_CONTENT_HASH_V2, createGenerateChunkRequestV2, legacyTerrainGeneratorHashV2, type GeneratedChunkV2 } from "../app/game/terrain-generation-contract.ts";
import {
  createRenderFrameV2,
  createRenderResourceBatchV2,
  encodeRenderFrameV2,
  encodeRenderResourceBatchV2,
  type RenderGeometryV2,
} from "../app/game/rust-render-extraction-v2.ts";
import {
  decodeRustTerrainGenerationResultV2,
  encodeRustTerrainGenerationRequestV2,
} from "../app/game/rust-terrain-generation-bridge.ts";

type SceneCase = Readonly<{
  id: string;
  seed: string;
  chunk: readonly [number, number];
  focus: string;
  camera: Readonly<{ position: readonly [number, number, number]; lookAt: readonly [number, number, number]; fov: number }>;
}>;
type SceneData = Readonly<{
  entry: SceneCase;
  geometry: RenderGeometryV2;
  resources: Uint8Array;
  frame: Uint8Array;
  chunkHash: string;
}>;

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "rust-engine", "r3", "landscape-scenes");
const OUTPUT = path.join(ROOT, "work", "hybrid-rust-migration", "r3-generation", "landscape-gallery");
const WIDTH = 960, HEIGHT = 540, MIN_Y = -64, WORLD_HEIGHT = 192, CHUNK_SIZE = 16;

function blockIndex(x: number, y: number, z: number) { return x + z * CHUNK_SIZE + (y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE; }
function blockAt(chunk: GeneratedChunkV2, x: number, y: number, z: number) {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y >= MIN_Y + WORLD_HEIGHT) return BlockId.Air;
  return chunk.blocks[blockIndex(x, y, z)] ?? BlockId.Air;
}

const BIOME_COLORS: readonly (readonly [number, number, number])[] = [
  [88, 139, 72], [63, 119, 70], [51, 103, 82], [83, 130, 66], [111, 151, 76], [199, 171, 98],
  [104, 150, 132], [109, 98, 75], [151, 93, 64], [74, 113, 70], [136, 181, 174], [106, 87, 126],
  [211, 194, 145], [92, 129, 105], [66, 116, 102], [178, 113, 80], [122, 148, 160], [62, 109, 83],
  [92, 103, 83], [75, 124, 112], [178, 155, 105], [105, 133, 148], [104, 93, 129], [78, 125, 96],
];

function colorFor(block: number, biome: number): readonly [number, number, number] {
  if (block === BlockId.Water) return [42, 116, 176];
  if (block === BlockId.Ice) return [151, 215, 231];
  if (block === BlockId.Lava) return [238, 94, 34];
  if (block === BlockId.Sand) return [207, 185, 119];
  if (block === BlockId.RedSand) return [184, 103, 61];
  if (block === BlockId.Snow || block === BlockId.SnowyGrass) return [220, 235, 235];
  if (block === BlockId.Stone || block === BlockId.Bedrock) return [92, 96, 94];
  if (block === BlockId.Dirt || block === BlockId.Mud) return [101, 75, 51];
  if (block === BlockId.WildwoodLog || block === BlockId.PineLog || block === BlockId.BirchLog) return [83, 58, 38];
  if (block === BlockId.WildwoodLeaves || block === BlockId.PineLeaves || block === BlockId.BirchLeaves) return [39, 101, 60];
  return BIOME_COLORS[biome % BIOME_COLORS.length] ?? [110, 130, 92];
}

function buildGeometry(chunk: GeneratedChunkV2, cave: boolean, underwater: boolean, id: bigint): RenderGeometryV2 {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const addQuad = (points: readonly (readonly [number, number, number])[], normal: readonly [number, number, number], color: readonly [number, number, number]) => {
    const start = positions.length / 3;
    for (const point of points) {
      positions.push(...point); normals.push(normal[0] * 127, normal[1] * 127, normal[2] * 127); colors.push(...color);
    }
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  };
  const addFace = (x: number, y: number, z: number, side: number, color: readonly [number, number, number]) => {
    const faces = [
      [[[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]], [0, 1, 0]],
      [[[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z]], [0, -1, 0]],
      [[[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]], [1, 0, 0]],
      [[[x, y, z + 1], [x, y, z], [x, y + 1, z], [x, y + 1, z + 1]], [-1, 0, 0]],
      [[[x + 1, y, z + 1], [x, y, z + 1], [x, y + 1, z + 1], [x + 1, y + 1, z + 1]], [0, 0, 1]],
      [[[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z]], [0, 0, -1]],
    ] as const;
    addQuad(faces[side][0], faces[side][1], color);
  };
  if (cave) {
    const minimum = -38, maximum = 4;
    const directions = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const;
    for (let y = minimum; y <= maximum; y += 1) for (let z = 1; z < CHUNK_SIZE - 1; z += 1) for (let x = 1; x <= 8; x += 1) {
      const block = blockAt(chunk, x, y, z);
      if (block === BlockId.Air || block === BlockId.Water || block === BlockId.Lava) continue;
      const color = colorFor(block, chunk.biomes[x + z * CHUNK_SIZE]);
      directions.forEach(([dx, dy, dz], side) => {
        const neighbor = blockAt(chunk, x + dx, y + dy, z + dz);
        if (neighbor === BlockId.Air || neighbor === BlockId.Water || neighbor === BlockId.Lava) addFace(x, y, z, side, color);
      });
    }
  } else if (underwater) {
    const topAt = (x: number, z: number) => {
      for (let y = 34; y >= -16; y -= 1) { const block = blockAt(chunk, x, y, z); if (block !== BlockId.Air && block !== BlockId.Water) return y; }
      return -16;
    };
    for (let z = 0; z < CHUNK_SIZE; z += 1) for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const y = topAt(x, z), block = blockAt(chunk, x, y, z);
      const color = colorFor(block, chunk.biomes[x + z * CHUNK_SIZE]);
      addFace(x, y, z, 0, color);
      for (const [side, dx, dz] of [[2, 1, 0], [3, -1, 0], [4, 0, 1], [5, 0, -1]] as const) {
        const neighbor = x + dx < 0 || x + dx >= CHUNK_SIZE || z + dz < 0 || z + dz >= CHUNK_SIZE ? y - 3 : topAt(x + dx, z + dz);
        for (let faceY = Math.max(neighbor + 1, y - 7); faceY <= y; faceY += 1) addFace(x, faceY, z, side, color.map((value) => Math.round(value * 0.7)) as [number, number, number]);
      }
    }
  } else {
    const topAt = (x: number, z: number) => {
      for (let y = MIN_Y + WORLD_HEIGHT - 1; y >= MIN_Y; y -= 1) if (blockAt(chunk, x, y, z) !== BlockId.Air) return y;
      return MIN_Y;
    };
    for (let z = 0; z < CHUNK_SIZE; z += 1) for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const y = topAt(x, z);
      const block = blockAt(chunk, x, y, z);
      const color = colorFor(block, chunk.biomes[x + z * CHUNK_SIZE]);
      addFace(x, y, z, 0, color);
      for (const [side, dx, dz] of [[2, 1, 0], [3, -1, 0], [4, 0, 1], [5, 0, -1]] as const) {
        const neighbor = x + dx < 0 || x + dx >= CHUNK_SIZE || z + dz < 0 || z + dz >= CHUNK_SIZE
          ? y - 4 : topAt(x + dx, z + dz);
        for (let faceY = Math.max(neighbor + 1, y - 12); faceY <= y; faceY += 1) addFace(x, faceY, z, side, color.map((value) => Math.round(value * 0.74)) as [number, number, number]);
      }
    }
  }
  const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(positions, 3));
  return {
    id, revision: 1, kind: 0,
    bounds: { minimum: bounds.min.toArray() as [number, number, number], maximum: bounds.max.toArray() as [number, number, number] },
    positions: Float32Array.from(positions), normals: Int8Array.from(normals), colors: Uint8Array.from(colors),
    lights: new Uint8Array(), emissions: new Uint8Array(), occlusions: new Uint8Array(), uvs: new Uint16Array(), indices: Uint32Array.from(indices),
  };
}

function galleryCamera(entry: SceneCase, geometry: RenderGeometryV2) {
  const origin = new THREE.Vector3(entry.chunk[0] * CHUNK_SIZE, 0, entry.chunk[1] * CHUNK_SIZE);
  const minimum = new THREE.Vector3().fromArray(geometry.bounds.minimum).add(origin);
  const maximum = new THREE.Vector3().fromArray(geometry.bounds.maximum).add(origin);
  const center = minimum.clone().add(maximum).multiplyScalar(0.5);
  const cave = entry.id.includes("cave"), underwater = entry.id.includes("ocean-flora");
  const position = cave ? center.clone().add(new THREE.Vector3(18, 3, 0))
    : underwater ? center.clone().add(new THREE.Vector3(18, 10, 18))
      : center.clone().add(new THREE.Vector3(17, 14, 17));
  const lookAt = cave ? center.clone().add(new THREE.Vector3(0, -2, 0)) : center;
  const fov = cave ? 52 : underwater ? 56 : 48;
  const camera = new THREE.PerspectiveCamera(fov, WIDTH / HEIGHT, 0.1, 400);
  camera.position.copy(position);
  camera.lookAt(lookAt);
  return camera.quaternion.toArray() as [number, number, number, number];
}

async function generationModule() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "public", "engine", "manifest.json"), "utf8"));
  const hash = manifest.artifacts[manifest.defaultVariant].hash as string;
  const directory = path.join(ROOT, "public", "engine", hash);
  const module = await import(`${pathToFileURL(path.join(directory, "engine.js")).href}?landscape=${Date.now()}`);
  await module.default({ module_or_path: new Uint8Array(await readFile(path.join(directory, "engine_bg.wasm"))) });
  return module;
}

async function buildScenes() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "tests", "fixtures", "rust-engine", "r3", "landscape-corpus.json"), "utf8")) as { cases: SceneCase[] };
  const module = await generationModule();
  await mkdir(FIXTURES, { recursive: true });
  const scenes: SceneData[] = [];
  for (const [index, entry] of manifest.cases.entries()) {
    const [cx, cz] = entry.chunk;
    const namespace = `terrain-v5|g18|${entry.seed}|{}|${cx},${cz}|0`;
    const request = createGenerateChunkRequestV2({ epoch: 1, taskId: index + 1, revision: 1, namespace,
      contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2, generatorHash: legacyTerrainGeneratorHashV2(namespace), seedText: entry.seed,
      generationOptions: {}, key: `${cx},${cz}`, cx, cz, edits: [] });
    const chunk = decodeRustTerrainGenerationResultV2(module.blockwild_generate_chunk_v2(encodeRustTerrainGenerationRequestV2(request)), request);
    const cave = entry.id.includes("cave"), underwater = entry.id.includes("ocean-flora");
    const geometry = buildGeometry(chunk, cave, underwater, BigInt(index * 10 + 2));
    const origin = new THREE.Vector3(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    const minimum = new THREE.Vector3().fromArray(geometry.bounds.minimum).add(origin);
    const maximum = new THREE.Vector3().fromArray(geometry.bounds.maximum).add(origin);
    const center = minimum.clone().add(maximum).multiplyScalar(0.5);
    const cameraPosition = cave ? center.clone().add(new THREE.Vector3(18, 3, 0)) : underwater ? center.clone().add(new THREE.Vector3(18, 10, 18)) : center.clone().add(new THREE.Vector3(17, 14, 17));
    const cameraLookAt = cave ? center.clone().add(new THREE.Vector3(0, -2, 0)) : center;
    const cameraFov = cave ? 52 : underwater ? 56 : 48;
    const materialId = BigInt(index * 10 + 1), geometryId = geometry.id;
    const resources = createRenderResourceBatchV2({ epoch: BigInt(3), revision: BigInt(1), operations: [
      { kind: "upsert-material", material: { id: materialId, revision: 1, shading: 1, blend: 0, baseColorRgba8: [255, 255, 255, 255], emissiveRgb8: [0, 0, 0], emissiveStrength: 0, roughness: 0.92, metalness: 0, alphaCutoff: 0, atlasTile: null, doubleSided: false, depthWrite: true } },
      { kind: "upsert-geometry", geometry },
    ] });
    const frame = createRenderFrameV2({ epoch: BigInt(3), frameSequence: BigInt(index + 1), simulationTick: BigInt(0), animationTimeMicros: BigInt(0),
      resourceRevision: BigInt(1), camera: { position: cameraPosition.toArray() as [number, number, number], orientation: galleryCamera(entry, geometry), verticalFovRadians: THREE.MathUtils.degToRad(cameraFov), near: 0.1, far: 400, viewport: [WIDTH, HEIGHT] },
      environment: { clearRgba8: [110, 160, 190, 255], ambientRgb8: [185, 204, 195], ambientIntensity: entry.id.includes("cave") ? 0.34 : 0.72,
        sunDirection: [-0.45, -0.8, -0.35], sunRgb8: [255, 238, 198], sunIntensity: entry.id.includes("cave") ? 0.22 : 1.2,
        fogRgb8: entry.id.includes("cave") ? [18, 27, 31] : [125, 169, 187], fogNear: entry.id.includes("cave") ? 18 : 70,
        fogFar: entry.id.includes("cave") ? 75 : 260, underwater: entry.id.includes("ocean-flora") ? 0.35 : 0, caveOcclusion: entry.id.includes("cave") ? 0.8 : 0 },
      instances: [{ stableId: BigInt(index + 1), domain: 0, geometry: geometryId, material: materialId, parent: null,
        transform: { translation: [cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, tintRgba8: [255, 255, 255, 255], visibilityMask: 0xffff_ffff, sortKey: 0, animationFlags: 0 }], particles: [] });
    const resourceBytes = encodeRenderResourceBatchV2(resources), frameBytes = encodeRenderFrameV2(frame);
    await writeFile(path.join(FIXTURES, `${entry.id}.bwrd`), resourceBytes);
    await writeFile(path.join(FIXTURES, `${entry.id}.bwrf`), frameBytes);
    await writeFile(path.join(FIXTURES, `${entry.id}.json`), `${JSON.stringify({ schema: 1, id: entry.id, focus: entry.focus, seed: entry.seed, chunk: entry.chunk,
      chunkHash: chunk.chunkHash, vertices: geometry.positions.length / 3, triangles: geometry.indices.length / 3,
      camera: { position: cameraPosition.toArray(), lookAt: cameraLookAt.toArray(), fov: cameraFov },
      resourceBytes: resourceBytes.byteLength, frameBytes: frameBytes.byteLength, source: "published Rust/Wasm generation -> renderer extraction V2" }, null, 2)}\n`);
    scenes.push({ entry, geometry, resources: resourceBytes, frame: frameBytes, chunkHash: chunk.chunkHash });
  }
  return scenes;
}

async function playwrightModule() {
  for (const candidate of ["playwright", path.join(os.homedir(), ".codex", "skills", "develop-web-game", "scripts", "node_modules", "playwright", "index.mjs")]) {
    try { return await import(candidate.startsWith("playwright") ? candidate : pathToFileURL(candidate).href); } catch { /* next */ }
  }
  throw new Error("Playwright is required for the R3 landscape gallery");
}

async function main() {
  const scenes = await buildScenes();
  await mkdir(OUTPUT, { recursive: true });
  const rendererManifest = JSON.parse(await readFile(path.join(ROOT, "public", "renderer", "manifest.json"), "utf8"));
  const runtime = rendererManifest.runtime;
  const sceneByPath = new Map<string, Uint8Array>();
  for (const scene of scenes) {
    sceneByPath.set(`/scene/${scene.entry.id}.bwrd`, scene.resources);
    sceneByPath.set(`/scene/${scene.entry.id}.bwrf`, scene.frame);
  }
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/") { response.writeHead(200, { "content-type": "text/html" }); response.end("<!doctype html><canvas width=960 height=540></canvas>"); return; }
    if (pathname === "/three.module.js" || pathname === "/three.core.js") { const bytes = await readFile(path.join(ROOT, "node_modules", "three", "build", pathname.slice(1))); response.writeHead(200, { "content-type": "text/javascript" }); response.end(bytes); return; }
    const scene = sceneByPath.get(pathname); if (scene) { response.writeHead(200, { "content-type": "application/octet-stream" }); response.end(scene); return; }
    if (pathname.startsWith("/renderer/")) { const relative = pathname.slice("/renderer/".length); const target = path.resolve(path.join(ROOT, "public", "renderer"), relative);
      if (!target.startsWith(path.resolve(path.join(ROOT, "public", "renderer")))) { response.writeHead(403).end(); return; }
      const bytes = await readFile(target); response.writeHead(200, { "content-type": target.endsWith(".wasm") ? "application/wasm" : target.endsWith(".js") ? "text/javascript" : "application/json" }); response.end(bytes); return; }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("gallery server failed to bind");
  const url = `http://127.0.0.1:${address.port}`;
  const playwright = await playwrightModule();
  const executable = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
  const browser = await playwright.chromium.launch({ headless: true, executablePath: executable, ignoreDefaultArgs: ["--disable-gpu"], args: ["--enable-gpu", "--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--force-high-performance-gpu", "--use-angle=d3d11"] });
  const reports: Record<string, unknown>[] = [];
  try {
    for (const [index, scene] of scenes.entries()) {
      const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      await page.goto(url);
      const sceneMetadata = JSON.parse(await readFile(path.join(FIXTURES, `${scene.entry.id}.json`), "utf8"));
      const geometryPayload = { positions: Array.from(scene.geometry.positions), normals: Array.from(scene.geometry.normals), colors: Array.from(scene.geometry.colors), indices: Array.from(scene.geometry.indices),
        camera: sceneMetadata.camera, origin: [scene.entry.chunk[0] * CHUNK_SIZE, 0, scene.entry.chunk[1] * CHUNK_SIZE] };
      await page.evaluate(`(async()=>{ const T=await import('/three.module.js'); const d=${JSON.stringify(geometryPayload)}; const canvas=document.querySelector('canvas');
        const r=new T.WebGLRenderer({canvas,antialias:true}); r.setSize(${WIDTH},${HEIGHT},false); r.setPixelRatio(1); r.outputColorSpace=T.SRGBColorSpace;
        const s=new T.Scene(); s.background=new T.Color(${scene.entry.id.includes("cave") ? "0x111a1d" : "0x6ea0be"});
        const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(d.positions,3)); g.setAttribute('normal',new T.Int8BufferAttribute(d.normals,3,true)); g.setAttribute('color',new T.Uint8BufferAttribute(d.colors,3,true)); g.setIndex(d.indices);
        const m=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0}); const mesh=new T.Mesh(g,m); mesh.position.fromArray(d.origin); s.add(mesh);
        s.add(new T.HemisphereLight(0xdde8df,0x26362e,${scene.entry.id.includes("cave") ? 0.7 : 1.5})); const light=new T.DirectionalLight(0xffedc8,${scene.entry.id.includes("cave") ? 0.4 : 2.2}); light.position.set(40,80,20); s.add(light);
        s.fog=new T.Fog(s.background,${scene.entry.id.includes("cave") ? 18 : 70},${scene.entry.id.includes("cave") ? 75 : 260}); const c=new T.PerspectiveCamera(d.camera.fov,${WIDTH / HEIGHT},.1,400); c.position.fromArray(d.camera.position); c.lookAt(new T.Vector3().fromArray(d.camera.lookAt)); r.render(s,c); globalThis.__done=true; })()`);
      await page.waitForFunction("globalThis.__done===true");
      const threePath = path.join(OUTPUT, `${index + 1}-${scene.entry.id}-three.png`); await page.locator("canvas").screenshot({ path: threePath });
      await page.close();

      const wgpuPage = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      await wgpuPage.goto(url);
      const wgpuReport = await wgpuPage.evaluate(`(async()=>{ if(!navigator.gpu)return {skipped:'navigator.gpu unavailable'}; const m=await import('/renderer/${runtime.module}'); await m.default({module_or_path:'/renderer/${runtime.wasm}'});
        const canvas=document.querySelector('canvas'); const surface=await m.create_blockwild_renderer(canvas.transferControlToOffscreen(),${WIDTH},${HEIGHT});
        const resources=new Uint8Array(await (await fetch('/scene/${scene.entry.id}.bwrd')).arrayBuffer()); const frame=new Uint8Array(await (await fetch('/scene/${scene.entry.id}.bwrf')).arrayBuffer());
        const applied=JSON.parse(surface.apply_resources(resources)); const rendered=JSON.parse(surface.render_frame(frame)); await new Promise(r=>setTimeout(r,120)); surface.shutdown(); surface.free(); return {applied,rendered}; })()`);
      const wgpuPath = path.join(OUTPUT, `${index + 1}-${scene.entry.id}-wgpu.png`); await wgpuPage.locator("canvas").screenshot({ path: wgpuPath });
      await wgpuPage.close();
      reports.push({ id: scene.entry.id, chunkHash: scene.chunkHash, three: threePath, wgpu: wgpuPath, wgpuReport });
    }
  } finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  const tiles: sharp.OverlayOptions[] = [];
  for (const [index, report] of reports.entries()) for (const [column, renderer] of ["three", "wgpu"].entries()) {
    const input = await sharp(report[renderer as "three" | "wgpu"] as string).resize(600, 338).toBuffer();
    tiles.push({ input, left: column * 600, top: index * 382 });
    const label = Buffer.from(`<svg width="600" height="44"><rect width="100%" height="100%" fill="#0d1713"/><text x="18" y="18" fill="#eed17a" font-family="monospace" font-size="13">${scenes[index].entry.id} · ${renderer.toUpperCase()}</text><text x="18" y="35" fill="#a8bdb1" font-family="monospace" font-size="10">${scenes[index].entry.focus}</text></svg>`);
    tiles.push({ input: label, left: column * 600, top: index * 382 + 338 });
  }
  const contact = path.join(OUTPUT, "r3-landscape-three-wgpu-contact-sheet.png");
  await sharp({ create: { width: 1200, height: reports.length * 382, channels: 4, background: "#07100d" } }).composite(tiles).png().toFile(contact);
  const trackedContact = path.join(FIXTURES, "r3-landscape-three-wgpu-contact-sheet.png");
  await writeFile(trackedContact, await readFile(contact));
  const trackedEvidence = {
    schema: 1,
    source: "exact published Rust generation and shared BWRD/BWRF records",
    rendererContract: "RenderResourceBatchV2/RenderFrameV2",
    contactSheet: "r3-landscape-three-wgpu-contact-sheet.png",
    reports: reports.map((report) => ({
      id: report.id,
      chunkHash: report.chunkHash,
      resources: `${report.id}.bwrd`,
      frame: `${report.id}.bwrf`,
      wgpuReport: report.wgpuReport,
    })),
  };
  await writeFile(path.join(FIXTURES, "evidence.json"), `${JSON.stringify(trackedEvidence, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "evidence.json"), `${JSON.stringify({ ...trackedEvidence, workContactSheet: contact }, null, 2)}\n`);
  console.log(JSON.stringify({ scenes: reports.length, contact, reports }, null, 2));
}

await main();
