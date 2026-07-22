import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_VOICE_RATE_MAX_STREAMS,
  AGENT_VOICE_RATE_WINDOW_MS,
  AGENT_VOICE_STREAM_MAX_BYTES,
  AgentVoiceAssembler,
  chunkAgentVoiceData,
} from "../app/game/agent-voice";
import type { AgentVoiceChunk } from "../app/game/agent-platform";

const encoded = (values: readonly number[]) => Buffer.from(values).toString("base64");
const chunk = (input: Partial<AgentVoiceChunk> = {}): AgentVoiceChunk => ({
  schema: 1,
  streamId: "voice_agent_1_stream",
  agentId: "agent_1",
  messageId: "chat_local_1",
  mimeType: "audio/mpeg",
  textHash: "abc123",
  text: "The north field is ready.",
  sequence: 1,
  chunkIndex: 0,
  chunkCount: 2,
  durationMs: 1_200,
  data: encoded([1, 2, 3]),
  position: { x: 1, y: 2, z: 3 },
  ...input,
});

test("voice assembler completes out-of-order audio and ignores identical duplicates", () => {
  const assembler = new AgentVoiceAssembler();
  assert.deepEqual(assembler.accept(chunk({ chunkIndex: 1, data: encoded([4, 5]) }), 100), { status: "accepted" });
  assert.deepEqual(assembler.accept(chunk({ chunkIndex: 1, data: encoded([4, 5]) }), 101), { status: "duplicate" });
  const result = assembler.accept(chunk(), 102);
  assert.equal(result.status, "complete");
  if (result.status === "complete") assert.deepEqual([...result.bytes], [1, 2, 3, 4, 5]);
  assert.equal(assembler.activeStreamCount, 0);
});

test("voice assembler fails closed on conflicting chunks or metadata", () => {
  const assembler = new AgentVoiceAssembler();
  assert.equal(assembler.accept(chunk(), 100).status, "accepted");
  assert.deepEqual(assembler.accept(chunk({ data: encoded([9]) }), 101), { status: "dropped", reason: "chunk_conflict" });
  assert.equal(assembler.activeStreamCount, 0);
  assert.equal(assembler.accept(chunk(), 102).status, "accepted");
  assert.deepEqual(assembler.accept(chunk({ chunkIndex: 1, text: "Different caption", data: encoded([4]) }), 103), { status: "dropped", reason: "stream_metadata_conflict" });
});

test("voice assembler rate-limits starts, expires partial streams, and can drop one agent", () => {
  const assembler = new AgentVoiceAssembler();
  for (let index = 0; index < AGENT_VOICE_RATE_MAX_STREAMS; index += 1) {
    assert.equal(assembler.accept(chunk({ streamId: `voice_${index}`, agentId: `agent_${index}` }), 100).status, "accepted");
  }
  const oneAgent = new AgentVoiceAssembler();
  for (let index = 0; index < AGENT_VOICE_RATE_MAX_STREAMS; index += 1) {
    const first = oneAgent.accept(chunk({ streamId: `voice_rate_${index}`, chunkCount: 1 }), 100 + index);
    assert.equal(first.status, "complete");
  }
  assert.deepEqual(oneAgent.accept(chunk({ streamId: "voice_rate_blocked", chunkCount: 1 }), 110), { status: "dropped", reason: "rate_limited" });
  oneAgent.dropAgent("agent_1");
  assert.equal(oneAgent.accept(chunk({ streamId: "voice_after_disconnect", chunkCount: 1 }), 111).status, "complete");
  assert.equal(oneAgent.activeStreamCount, 0);
  assert.equal(assembler.prune(100 + AGENT_VOICE_RATE_WINDOW_MS + 20_000), AGENT_VOICE_RATE_MAX_STREAMS);
});

test("voice chunking preserves bytes and rejects an oversized runner payload", () => {
  const source = Buffer.from(Array.from({ length: 80_000 }, (_, index) => index % 251));
  const packets = chunkAgentVoiceData(source.toString("base64"), 24_000);
  assert.ok(packets);
  assert.equal(packets.length, 4);
  assert.deepEqual(Buffer.concat(packets.map((packet) => Buffer.from(packet, "base64"))), source);
  assert.equal(chunkAgentVoiceData(Buffer.alloc(AGENT_VOICE_STREAM_MAX_BYTES + 1).toString("base64")), null);
});
