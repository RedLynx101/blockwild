import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentBrowserBridge } from "../app/game/agent-bridge";
import type { AgentCommandEnvelope, AgentObservationV1 } from "../app/game/agent-platform";

const observation: AgentObservationV1 = {
  schema: 1, observationSequence: 7, observedAt: 10, expiresAt: 2_000, worldRevision: 42,
  coordinateSystem: "+x east, +y up, +z south",
  session: { worldId: "world_1", worldFingerprint: "worldfp_1", gameVersion: "1.9.1", generatorVersion: 18, multiplayerProtocolVersion: 3, agentProtocolVersion: 1, role: "guest", connected: true, capabilities: ["observe.world"] },
  self: { agentId: "agent_1", name: "Mica", position: { x: 0, y: 2, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, biome: "Wildwood", depth: "Surface", liquid: null, light: 15, inventory: { used: 0, capacity: 36 }, command: null },
  world: { day: 1, time: 0.25, weather: "clear", occupiedChunkReady: true, players: [], nearby: [], reachable: ["north"] },
  chat: { newestSequence: 0, newChatCount: 0, messages: [] }, tasks: [], waypoints: [],
  performance: { fps: 30, renderDistance: 4, simulationDistance: 3, basicRenderDistance: 4, commandQueue: 0, channelBackpressure: 0 },
};

test("typed agent bridge constructs fresh host-authorized commands without exposing an engine", async () => {
  const sent: AgentCommandEnvelope[] = [];
  const voices: unknown[] = [];
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: true, role: "guest", roomCode: "WILD-TEST", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }),
    observe: () => observation,
    latestResult: () => null,
    sendCommand: (command) => (sent.push(command), { accepted: true, code: "accepted" }),
    sendChat: () => true,
    publishVoice: (input) => (voices.push(input), { ok: true }),
    disconnect: () => undefined,
  });
  assert.deepEqual(await bridge.connect({ roomCode: "wild test", name: " Mica " }), { connected: true, hostName: "Noah", roomCode: "WILDTEST" });
  const issued = await bridge.command({ kind: "observe", clientIntent: "Check the nearby path" });
  assert.equal(issued.accepted, true);
  assert.equal(sent[0]?.agentId, "agent_1");
  assert.equal(sent[0]?.expectedWorldRevision, 42);
  assert.equal(bridge.status().lastObservationSequence, 7);
  assert.equal(bridge.status().testAdmin, false);
  assert.equal("engine" in bridge, false);
  assert.equal("executeJavaScript" in bridge, false);
  assert.equal(Object.isFrozen(bridge), true);
  assert.deepEqual(bridge.publishVoice({ mimeType: "audio/mpeg", dataBase64: "AQI=", text: "Ready.", textHash: "hash" }), { ok: true });
  assert.deepEqual(voices, [{ mimeType: "audio/mpeg", dataBase64: "AQI=", text: "Ready.", textHash: "hash", durationMs: 330, channel: "local" }]);
  assert.deepEqual(bridge.publishVoice({ mimeType: "audio/mpeg", dataBase64: "", text: "No audio", textHash: "hash" }), { ok: false, code: "invalid_voice_payload" });
});

test("typed agent bridge refuses mutation before an authoritative observation", async () => {
  let sends = 0;
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: false, role: null, roomCode: "", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }), observe: () => null, latestResult: () => null,
    sendCommand: () => (sends += 1, true), sendChat: () => false, disconnect: () => undefined,
  });
  assert.deepEqual(await bridge.command({ kind: "move_to", arguments: { target: { x: 1, y: 2, z: 3 } } }), { accepted: false, commandId: "", error: "no_observation" });
  assert.equal(sends, 0);
});

test("local test-admin bridge is explicit and keeps destructive confirmation separate", async () => {
  const calls: string[] = [];
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: false, role: null, roomCode: "", agentName: "Mica", testAdmin: true }),
    connect: async () => ({ hostName: "Noah" }),
    host: async (roomCode) => { calls.push(`host:${roomCode}`); },
    observe: () => observation,
    latestResult: () => null,
    sendCommand: () => false,
    sendChat: () => false,
    worldList: () => [{ id: "world_test" }],
    worldCreate: (input) => ({ ok: true, seed: input.seed }),
    worldLoad: (worldId) => ({ ok: true, worldId }),
    worldExport: (worldId) => ({ ok: true, worldId, json: "{}" }),
    worldDelete: (worldId, confirm) => ({ ok: confirm, worldId }),
    diagnosticsStart: () => ({ ok: true }),
    diagnosticsExport: () => ({ schema: 1 }),
    diagnosticsStop: () => ({ schema: 1 }),
    diagnosticsNoteScreenshot: () => ({ ok: true, screenshots: 1 }),
    diagnosticsNoteFallback: (reason) => ({ ok: true, reason }),
    disconnect: () => undefined,
  });
  assert.equal(bridge.status().testAdmin, true);
  assert.deepEqual(bridge.worldList(), [{ id: "world_test" }]);
  assert.deepEqual(bridge.worldDelete({ worldId: "world_test", confirm: false }), { ok: false, worldId: "world_test" });
  assert.deepEqual(bridge.worldDelete({ worldId: "world_test", confirm: true }), { ok: true, worldId: "world_test" });
  assert.deepEqual(bridge.diagnosticsNoteScreenshot(), { ok: true, screenshots: 1 });
  assert.deepEqual(bridge.diagnosticsNoteFallback("door UI"), { ok: true, reason: "door UI" });
  await bridge.host({ roomCode: "test room", name: "Mica" });
  assert.deepEqual(calls, ["host:TESTROOM"]);
});

test("browser bridge waits for an authority receipt and invalidates pending work on disconnect", async () => {
  let resolveReceipt!: (value: { accepted: boolean; code?: string }) => void;
  const receipt = new Promise<{ accepted: boolean; code?: string }>((resolve) => { resolveReceipt = resolve; });
  let disconnected = false;
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: !disconnected, role: "guest", roomCode: "WILD-TEST", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }),
    observe: () => observation,
    latestResult: () => null,
    sendCommand: () => receipt,
    sendChat: () => false,
    disconnect: async () => { disconnected = true; },
  });
  const pending = bridge.command({ kind: "observe", commandId: "command_pending_001" });
  assert.deepEqual(await bridge.command({ kind: "observe", commandId: "command_pending_001" }), {
    accepted: false, commandId: "command_pending_001", error: "command_pending",
  });
  await bridge.disconnect();
  resolveReceipt({ accepted: true });
  assert.deepEqual(await pending, { accepted: false, commandId: "command_pending_001", error: "disconnected" });
  assert.equal(bridge.status().lastCommandId, null, "a late receipt cannot revive a disconnected command");
});

test("browser bridge does not promote a legacy synchronous boolean into a Rust receipt", async () => {
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: true, role: "guest", roomCode: "WILD-TEST", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }), observe: () => observation, latestResult: () => null,
    sendCommand: () => true, sendChat: () => false, disconnect: () => undefined,
  });
  assert.deepEqual(await bridge.command({ kind: "observe", commandId: "command_boolean_001" }), {
    accepted: false, commandId: "command_boolean_001", error: "rust_receipt_required",
  });
});
