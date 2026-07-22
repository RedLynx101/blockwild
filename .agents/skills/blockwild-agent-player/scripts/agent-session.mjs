#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const FORBIDDEN_PIN_FIELD = /(?:api.?key|authorization|bearer|secret|token|invite|password|prompt|reasoning|chain.?of.?thought)/iu;
const SAFE_SEGMENT = /[^A-Za-z0-9_-]+/gu;

function args(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) { result._.push(entry); continue; }
    const key = entry.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
    result[key] = value;
  }
  return result;
}

function safeSegment(value, fallback) {
  return String(value || fallback).replace(SAFE_SEGMENT, "-").replace(/^-+|-+$/gu, "").slice(0, 96) || fallback;
}

function notebookRoot() {
  return path.resolve(process.env.BLOCKWILD_AGENT_NOTEBOOK_DIR || ".blockwild-agent/notebooks");
}

function notebookPath(worldFingerprint, agentId) {
  return path.join(notebookRoot(), safeSegment(worldFingerprint, "unlinked-world"), `${safeSegment(agentId, "agent")}.json`);
}

async function readNotebook(worldFingerprint, agentId) {
  const file = notebookPath(worldFingerprint, agentId);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    const now = Date.now();
    return { schema: 1, worldFingerprint, agentId, enabled: parsed.enabled !== false, pins: Array.isArray(parsed.pins) ? parsed.pins.filter((pin) => !Number.isFinite(pin?.expiresAt) || pin.expiresAt > now).slice(-256) : [] };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { schema: 1, worldFingerprint, agentId, enabled: true, pins: [] };
  }
}

async function writeNotebook(notebook) {
  const file = notebookPath(notebook.worldFingerprint, notebook.agentId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(notebook, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, file);
  return file;
}

function validatePin(pin) {
  if (!pin || typeof pin !== "object" || Array.isArray(pin)) throw new Error("pin must be an object");
  for (const key of Object.keys(pin)) if (FORBIDDEN_PIN_FIELD.test(key)) throw new Error(`forbidden notebook field: ${key}`);
  if (!String(pin.text ?? "").trim() || String(pin.text).length > 640) throw new Error("pin text must be 1-640 characters");
  if (/(?:api[_ -]?key|authorization|bearer|password|invite code|BEGIN [A-Z ]+ KEY)/iu.test(String(pin.text))) throw new Error("pin text appears to contain a secret or invite credential");
  if (!['player', 'agent', 'system'].includes(pin.source)) throw new Error("pin source must be player, agent, or system");
  if (!Number.isFinite(pin.confidence) || pin.confidence < 0 || pin.confidence > 1) throw new Error("pin confidence must be between 0 and 1");
  if (pin.position && (![pin.position.x, pin.position.y, pin.position.z].every(Number.isFinite)
    || Math.abs(pin.position.x) > 30_000_000 || Math.abs(pin.position.y) > 4_096 || Math.abs(pin.position.z) > 30_000_000)) throw new Error("pin position is outside world bounds");
}

async function connectPage(cdpUrl) {
  if (!cdpUrl) throw new Error("--cdp is required for browser operations");
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { throw new Error("Playwright is unavailable. Install project dependencies before using the runner."); }
  const browser = await chromium.connectOverCDP(String(cdpUrl));
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => /\/agent(?:[/?#]|$)/u.test(candidate.url())) ?? pages.at(-1);
  if (!page) throw new Error("No /agent page is attached to the CDP browser");
  return { browser, page };
}

async function bridgeCall(cdpUrl, method, payload) {
  const { browser, page } = await connectPage(cdpUrl);
  try {
    return await page.evaluate(async ({ method: methodName, payload: value }) => {
      const bridge = window.blockwildAgent;
      if (!bridge || typeof bridge[methodName] !== "function") throw new Error("Blockwild agent bridge is unavailable");
      return await bridge[methodName](...(Array.isArray(value) ? value : [value]));
    }, { method, payload });
  } finally {
    await browser.close();
  }
}

async function elevenLabsSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ElevenLabs is not configured; text chat remains available");
  if (!text || text.length > 480 || /(?:https?:\/\/|BEGIN [A-Z ]+ KEY|authorization:|api[_ -]?key)/iu.test(text)) throw new Error("speech text is empty, too long, or contains disallowed secret/URL-like content");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.55, similarity_boost: 0.72 } }),
  });
  if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) throw new Error("generated speech exceeds the 4 MiB runner limit");
  return { mimeType: "audio/mpeg", dataBase64: bytes.toString("base64"), text, textHash: crypto.createHash("sha256").update(text).digest("hex") };
}

async function main() {
  const options = args(process.argv.slice(2));
  const action = options._[0] || "help";
  if (action === "help") {
    process.stdout.write("agent-session.mjs status|observe|command|host|world-list|world-create|world-load|world-export|world-import|world-delete|test-pause|test-resume|test-advance|diagnostics-start|diagnostics-export|diagnostics-stop|speak|notebook-list|notebook-pin|notebook-correct|notebook-remove|notebook-export|notebook-disable [options]\n");
    return;
  }
  if (action === "status") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "status", []), null, 2)}\n`);
    return;
  }
  if (action === "observe") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "observe", [{}]), null, 2)}\n`);
    return;
  }
  if (action === "command") {
    const payload = JSON.parse(await fs.readFile(path.resolve(String(options.file)), "utf8"));
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "command", [payload]), null, 2)}\n`);
    return;
  }
  if (action === "host") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "host", [{ roomCode: options.room, name: options.name }]), null, 2)}\n`);
    return;
  }
  if (action === "world-list") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "worldList", []), null, 2)}\n`);
    return;
  }
  if (action === "world-create") {
    const payload = { seed: String(options.seed || "AGENT-TEST"), name: String(options.name || "Agent Test World"), mode: options.mode === "survival" ? "survival" : "builder", ...(options.fixture ? { fixture: String(options.fixture) } : {}) };
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "worldCreate", [payload]), null, 2)}\n`);
    return;
  }
  if (action === "world-load" || action === "world-export") {
    const method = action === "world-load" ? "worldLoad" : "worldExport";
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, method, [String(options.world || "")]), null, 2)}\n`);
    return;
  }
  if (action === "world-import") {
    const json = await fs.readFile(path.resolve(String(options.file || "")), "utf8");
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "worldImport", [json]), null, 2)}\n`);
    return;
  }
  if (action === "world-delete") {
    if (options.confirm !== "DELETE") throw new Error("world-delete requires --confirm DELETE");
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "worldDelete", [{ worldId: String(options.world || ""), confirm: true }]), null, 2)}\n`);
    return;
  }
  if (action === "diagnostics-start") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "diagnosticsStart", [{ model: options.model, reasoning: options.reasoning }]), null, 2)}\n`);
    return;
  }
  if (action === "test-pause" || action === "test-resume") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "testPause", [action === "test-pause"]), null, 2)}\n`);
    return;
  }
  if (action === "test-advance") {
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "testAdvance", [Number(options.milliseconds || 0)]), null, 2)}\n`);
    return;
  }
  if (action === "diagnostics-export" || action === "diagnostics-stop") {
    const method = action === "diagnostics-export" ? "diagnosticsExport" : "diagnosticsStop";
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, method, []), null, 2)}\n`);
    return;
  }
  if (action === "speak") {
    const text = String(options.text || "").trim();
    const audio = await elevenLabsSpeech(text);
    process.stdout.write(`${JSON.stringify(await bridgeCall(options.cdp, "publishVoice", [{ ...audio, channel: options.channel || "local" }]), null, 2)}\n`);
    return;
  }
  const world = String(options.world || "");
  const agent = String(options.agent || "");
  if (!world || !agent) throw new Error("--world and --agent are required for notebook operations");
  const notebook = await readNotebook(world, agent);
  if (action === "notebook-list") {
    const taskId = options.task ? safeSegment(options.task, "") : "";
    const selected = taskId ? { ...notebook, pins: notebook.pins.filter((pin) => pin.taskId === taskId) } : notebook;
    process.stdout.write(`${JSON.stringify(selected, null, 2)}\n`);
    return;
  }
  if (action === "notebook-pin") {
    if (!notebook.enabled) throw new Error("this world notebook is disabled");
    const now = Date.now();
    const pin = {
      id: safeSegment(options.id, `pin-${now.toString(36)}`),
      text: String(options.text || "").trim(),
      source: options.source || "agent",
      confidence: Number(options.confidence ?? 0.8),
      createdAt: now,
      verifiedAt: now,
      ...(options.expires ? { expiresAt: Number(options.expires) } : {}),
      ...(options.task ? { taskId: safeSegment(options.task, "task") } : {}),
      ...(options.x !== undefined && options.y !== undefined && options.z !== undefined ? { position: { x: Number(options.x), y: Number(options.y), z: Number(options.z) } } : {}),
    };
    validatePin(pin);
    notebook.pins = [...notebook.pins.filter((entry) => entry.id !== pin.id), pin].slice(-256);
    await writeNotebook(notebook);
    process.stdout.write(`${JSON.stringify(pin)}\n`);
    return;
  }
  if (action === "notebook-correct") {
    if (!notebook.enabled) throw new Error("this world notebook is disabled");
    const id = safeSegment(options.id, "");
    const existing = notebook.pins.find((pin) => pin.id === id);
    if (!existing) throw new Error("notebook pin not found");
    const corrected = { ...existing, text: String(options.text || existing.text).trim(), source: options.source || "player", confidence: Number(options.confidence ?? existing.confidence), verifiedAt: Date.now() };
    validatePin(corrected);
    notebook.pins = notebook.pins.map((pin) => pin.id === id ? corrected : pin);
    await writeNotebook(notebook);
    process.stdout.write(`${JSON.stringify(corrected)}\n`);
    return;
  }
  if (action === "notebook-remove") {
    const id = safeSegment(options.id, "");
    const before = notebook.pins.length;
    notebook.pins = notebook.pins.filter((pin) => pin.id !== id);
    await writeNotebook(notebook);
    process.stdout.write(`${JSON.stringify({ removed: before !== notebook.pins.length, id })}\n`);
    return;
  }
  if (action === "notebook-export") {
    process.stdout.write(`${JSON.stringify(notebook, null, 2)}\n`);
    return;
  }
  if (action === "notebook-disable") {
    notebook.enabled = options.enable === true || options.enable === "true";
    if (!notebook.enabled && options.clear === "YES") notebook.pins = [];
    await writeNotebook(notebook);
    process.stdout.write(`${JSON.stringify({ enabled: notebook.enabled, pins: notebook.pins.length })}\n`);
    return;
  }
  throw new Error(`Unknown action: ${action}`);
}

try { await main(); }
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
