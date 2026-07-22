import {
  AGENT_MAX_VOICE_CHUNK_BYTES,
  AGENT_MAX_VOICE_CHUNKS,
  type AgentVoiceChunk,
} from "./agent-platform";

export const AGENT_VOICE_STREAM_MAX_BYTES = 4 * 1024 * 1024;
export const AGENT_VOICE_OUTBOUND_CHUNK_BYTES = 32 * 1024;
export const AGENT_VOICE_STREAM_TTL_MS = 15_000;
export const AGENT_VOICE_MAX_ACTIVE_STREAMS = 8;
export const AGENT_VOICE_MAX_ACTIVE_PER_AGENT = 2;
export const AGENT_VOICE_RATE_WINDOW_MS = 20_000;
export const AGENT_VOICE_RATE_MAX_STREAMS = 3;

type VoiceStream = {
  first: AgentVoiceChunk;
  chunks: Array<Uint8Array | null>;
  byteLength: number;
  receivedAt: number;
  expiresAt: number;
};

export type AgentVoiceAcceptResult =
  | Readonly<{ status: "accepted" | "duplicate" }>
  | Readonly<{ status: "dropped"; reason: string }>
  | Readonly<{ status: "complete"; chunk: AgentVoiceChunk; bytes: Uint8Array }>;

function decodeBase64(value: string) {
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  const slice = 8 * 1024;
  for (let start = 0; start < bytes.length; start += slice) {
    binary += String.fromCharCode(...bytes.subarray(start, start + slice));
  }
  return globalThis.btoa(binary);
}

function sameMetadata(left: AgentVoiceChunk, right: AgentVoiceChunk) {
  return left.agentId === right.agentId
    && left.messageId === right.messageId
    && left.mimeType === right.mimeType
    && left.textHash === right.textHash
    && left.text === right.text
    && left.chunkCount === right.chunkCount
    && left.durationMs === right.durationMs
    && left.position.x === right.position.x
    && left.position.y === right.position.y
    && left.position.z === right.position.z;
}

/** Split one runner-produced audio buffer into packets that stay below the RTC envelope ceiling. */
export function chunkAgentVoiceData(dataBase64: string, chunkBytes = AGENT_VOICE_OUTBOUND_CHUNK_BYTES) {
  const decoded = decodeBase64(dataBase64);
  if (!decoded || !decoded.length || decoded.length > AGENT_VOICE_STREAM_MAX_BYTES) return null;
  const bounded = Math.max(1, Math.min(AGENT_MAX_VOICE_CHUNK_BYTES, Math.trunc(chunkBytes)));
  const chunkCount = Math.ceil(decoded.length / bounded);
  if (chunkCount > AGENT_MAX_VOICE_CHUNKS) return null;
  return Array.from({ length: chunkCount }, (_, index) => encodeBase64(decoded.subarray(index * bounded, (index + 1) * bounded)));
}

/**
 * Reassembles the dedicated voice lane without trusting ordering, packet
 * uniqueness, claimed total size, or a runner's rate. Caption authorization is
 * intentionally checked by the engine after assembly because chat is host-owned.
 */
export class AgentVoiceAssembler {
  private readonly streams = new Map<string, VoiceStream>();
  private readonly startsByAgent = new Map<string, number[]>();

  accept(chunk: AgentVoiceChunk, now = Date.now()): AgentVoiceAcceptResult {
    this.prune(now);
    let stream = this.streams.get(chunk.streamId);
    if (!stream) {
      const agentActive = [...this.streams.values()].filter((entry) => entry.first.agentId === chunk.agentId).length;
      if (this.streams.size >= AGENT_VOICE_MAX_ACTIVE_STREAMS) return { status: "dropped", reason: "active_stream_limit" };
      if (agentActive >= AGENT_VOICE_MAX_ACTIVE_PER_AGENT) return { status: "dropped", reason: "agent_stream_limit" };
      const recent = (this.startsByAgent.get(chunk.agentId) ?? []).filter((startedAt) => now - startedAt < AGENT_VOICE_RATE_WINDOW_MS);
      if (recent.length >= AGENT_VOICE_RATE_MAX_STREAMS) return { status: "dropped", reason: "rate_limited" };
      recent.push(now);
      this.startsByAgent.set(chunk.agentId, recent);
      stream = {
        first: chunk,
        chunks: Array.from({ length: chunk.chunkCount }, () => null),
        byteLength: 0,
        receivedAt: now,
        expiresAt: now + AGENT_VOICE_STREAM_TTL_MS,
      };
      this.streams.set(chunk.streamId, stream);
    } else if (!sameMetadata(stream.first, chunk)) {
      this.streams.delete(chunk.streamId);
      return { status: "dropped", reason: "stream_metadata_conflict" };
    }

    const bytes = decodeBase64(chunk.data);
    if (!bytes || !bytes.length || bytes.length > AGENT_MAX_VOICE_CHUNK_BYTES) {
      this.streams.delete(chunk.streamId);
      return { status: "dropped", reason: "invalid_chunk_data" };
    }
    const existing = stream.chunks[chunk.chunkIndex];
    if (existing) {
      if (existing.length !== bytes.length || existing.some((value, index) => value !== bytes[index])) {
        this.streams.delete(chunk.streamId);
        return { status: "dropped", reason: "chunk_conflict" };
      }
      return { status: "duplicate" };
    }
    if (stream.byteLength + bytes.length > AGENT_VOICE_STREAM_MAX_BYTES) {
      this.streams.delete(chunk.streamId);
      return { status: "dropped", reason: "stream_too_large" };
    }
    stream.chunks[chunk.chunkIndex] = bytes;
    stream.byteLength += bytes.length;
    stream.expiresAt = now + AGENT_VOICE_STREAM_TTL_MS;
    if (stream.chunks.some((entry) => entry === null)) return { status: "accepted" };

    const joined = new Uint8Array(stream.byteLength);
    let offset = 0;
    for (const entry of stream.chunks) {
      joined.set(entry!, offset);
      offset += entry!.length;
    }
    this.streams.delete(chunk.streamId);
    return { status: "complete", chunk: stream.first, bytes: joined };
  }

  prune(now = Date.now()) {
    let expired = 0;
    for (const [streamId, stream] of this.streams) if (stream.expiresAt <= now) {
      this.streams.delete(streamId);
      expired += 1;
    }
    for (const [agentId, starts] of this.startsByAgent) {
      const recent = starts.filter((startedAt) => now - startedAt < AGENT_VOICE_RATE_WINDOW_MS);
      if (recent.length) this.startsByAgent.set(agentId, recent);
      else this.startsByAgent.delete(agentId);
    }
    return expired;
  }

  dropAgent(agentId: string) {
    let dropped = 0;
    for (const [streamId, stream] of this.streams) if (stream.first.agentId === agentId) {
      this.streams.delete(streamId);
      dropped += 1;
    }
    this.startsByAgent.delete(agentId);
    return dropped;
  }

  clear() {
    this.streams.clear();
    this.startsByAgent.clear();
  }

  get activeStreamCount() { return this.streams.size; }
}
