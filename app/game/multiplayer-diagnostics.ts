export type MultiplayerDiagnosticPhase = "sent" | "received" | "committed" | "rejected" | "response" | "retry" | "replayed";

export type MultiplayerDiagnosticEntry = {
  at: number;
  requestId: string;
  kind: string;
  phase: MultiplayerDiagnosticPhase;
  peerSuffix: string;
  expectedPlayerRevision?: number;
  actualPlayerRevision?: number;
  expectedContainerRevision?: number;
  actualContainerRevision?: number;
  rejectionCategory?: string;
  interestDistance?: number;
  serverPickupDistance?: number;
  claimedPickupDistance?: number;
  responseLatencyMs?: number;
};

export type MultiplayerDiagnosticExport = {
  schema: 1;
  generatedAt: string;
  protocol: string;
  role: "host" | "guest" | null;
  sessionState: string;
  entryCount: number;
  entries: MultiplayerDiagnosticEntry[];
};

function rounded(value: number | undefined, digits = 3) {
  return value === undefined || !Number.isFinite(value) ? undefined : Number(value.toFixed(digits));
}

export function multiplayerPeerSuffix(peerId: string | null | undefined) {
  return peerId ? peerId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(-8) : "unknown";
}

export function multiplayerRejectionCategory(reason: string | undefined) {
  if (!reason) return undefined;
  const normalized = reason.toLowerCase();
  if (normalized.includes("revision") || normalized.includes("changed")) return "stale-revision";
  if (normalized.includes("range") || normalized.includes("reach") || normalized.includes("far")) return "out-of-range";
  if (normalized.includes("full") || normalized.includes("room")) return "capacity";
  if (normalized.includes("conserve") || normalized.includes("exact")) return "conservation";
  if (normalized.includes("unavailable") || normalized.includes("open")) return "unavailable";
  if (normalized.includes("slot") || normalized.includes("accept")) return "slot-policy";
  return "precondition";
}

export class MultiplayerDiagnosticsRing {
  private readonly entries: MultiplayerDiagnosticEntry[] = [];
  private readonly sentAt = new Map<string, number>();

  constructor(private readonly capacity = 512) {}

  record(entry: Omit<MultiplayerDiagnosticEntry, "at" | "peerSuffix"> & { at?: number; peerId?: string | null }) {
    const at = entry.at ?? Date.now();
    if (entry.phase === "sent") this.sentAt.set(entry.requestId, at);
    const sentAt = this.sentAt.get(entry.requestId);
    const normalized: MultiplayerDiagnosticEntry = {
      at,
      requestId: entry.requestId.slice(0, 128),
      kind: entry.kind.slice(0, 96),
      phase: entry.phase,
      peerSuffix: multiplayerPeerSuffix(entry.peerId),
      expectedPlayerRevision: entry.expectedPlayerRevision,
      actualPlayerRevision: entry.actualPlayerRevision,
      expectedContainerRevision: entry.expectedContainerRevision,
      actualContainerRevision: entry.actualContainerRevision,
      rejectionCategory: entry.rejectionCategory?.slice(0, 64),
      interestDistance: rounded(entry.interestDistance),
      serverPickupDistance: rounded(entry.serverPickupDistance),
      claimedPickupDistance: rounded(entry.claimedPickupDistance),
      responseLatencyMs: rounded(entry.responseLatencyMs ?? (entry.phase === "response" && sentAt !== undefined ? at - sentAt : undefined), 1),
    };
    this.entries.push(normalized);
    if (entry.phase === "response" || entry.phase === "committed" || entry.phase === "rejected") this.sentAt.delete(entry.requestId);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    if (this.sentAt.size > this.capacity) {
      const oldest = this.sentAt.keys().next().value as string | undefined;
      if (oldest) this.sentAt.delete(oldest);
    }
  }

  clear() {
    this.entries.length = 0;
    this.sentAt.clear();
  }

  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  export(role: MultiplayerDiagnosticExport["role"], sessionState: string, protocol: string): MultiplayerDiagnosticExport {
    return {
      schema: 1,
      generatedAt: new Date().toISOString(),
      protocol,
      role,
      sessionState,
      entryCount: this.entries.length,
      entries: this.snapshot(),
    };
  }
}
