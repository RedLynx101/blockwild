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
  performance: { fps: 30, renderDistance: 4, simulationDistance: 3, commandQueue: 0, channelBackpressure: 0 },
};

test("typed agent bridge constructs fresh host-authorized commands without exposing an engine", async () => {
  const sent: AgentCommandEnvelope[] = [];
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: true, role: "guest", roomCode: "WILD-TEST", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }),
    observe: () => observation,
    latestResult: () => null,
    sendCommand: (command) => (sent.push(command), true),
    sendChat: () => true,
    disconnect: () => undefined,
  });
  assert.deepEqual(await bridge.connect({ roomCode: "wild test", name: " Mica " }), { connected: true, hostName: "Noah", roomCode: "WILDTEST" });
  const issued = bridge.command({ kind: "observe", clientIntent: "Check the nearby path" });
  assert.equal(issued.accepted, true);
  assert.equal(sent[0]?.agentId, "agent_1");
  assert.equal(sent[0]?.expectedWorldRevision, 42);
  assert.equal(bridge.status().lastObservationSequence, 7);
  assert.equal("engine" in bridge, false);
  assert.equal("executeJavaScript" in bridge, false);
  assert.equal(Object.isFrozen(bridge), true);
});

test("typed agent bridge refuses mutation before an authoritative observation", () => {
  let sends = 0;
  const bridge = createAgentBrowserBridge({
    getStatus: () => ({ connected: false, role: null, roomCode: "", agentName: "Mica" }),
    connect: async () => ({ hostName: "Noah" }), observe: () => null, latestResult: () => null,
    sendCommand: () => (sends += 1, true), sendChat: () => false, disconnect: () => undefined,
  });
  assert.deepEqual(bridge.command({ kind: "move_to", arguments: { target: { x: 1, y: 2, z: 3 } } }), { accepted: false, commandId: "", error: "no_observation" });
  assert.equal(sends, 0);
});
