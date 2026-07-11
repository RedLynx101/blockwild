type JsonRecord = Record<string, string | number | boolean | null>;

export type RendezvousStatus = "opening" | "waiting" | "exchanging" | "connected" | "closed" | "error";

type RequestContext = { peerId: string };
type RequestOptions = { target: string; timeoutMs?: number };

export type RendezvousRequest<T extends JsonRecord, R extends JsonRecord> = {
  request(data: T, options: RequestOptions): Promise<R>;
  onRequest: ((data: T, context: RequestContext) => R | Promise<R>) | null;
};

export type RendezvousRoom = {
  makeAction<T extends JsonRecord, R extends JsonRecord>(
    namespace: string,
    config: { kind: "request"; onRequest?: (data: T, context: RequestContext) => R | Promise<R> },
  ): RendezvousRequest<T, R>;
  getPeers(): Record<string, unknown>;
  leave(): Promise<void>;
  onPeerJoin: ((peerId: string) => void) | null;
};

export type RendezvousRole = "host" | "guest";
export type RendezvousRoomFactory = (role: RendezvousRole, code: string) => Promise<RendezvousRoom>;

type InviteRequest = { guestName: string };
type InviteResponse = { inviteCode: string; hostName: string };
type AnswerRequest = { answerCode: string };
type AnswerResponse = { accepted: boolean };

const APP_ID = "blockwild-multiplayer-v1";
const INVITE_ACTION = "bwinvite";
const ANSWER_ACTION = "bwanswer";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeRoomCode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  if (clean.replace(/-/g, "").length < 6) throw new Error("Invite codes need at least six letters or numbers.");
  return clean;
}

export function createRoomCode(randomValues: (target: Uint8Array) => Uint8Array = (target) => crypto.getRandomValues(target)) {
  const bytes = randomValues(new Uint8Array(10));
  const symbols = [...bytes].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]);
  return `${symbols.slice(0, 5).join("")}-${symbols.slice(5).join("")}`;
}

function roleHandshake(role: RendezvousRole) {
  return async (_peerId: string, send: (data: JsonRecord) => Promise<void>, receive: () => Promise<{ data: unknown }>) => {
    await send({ role });
    const remote = await receive();
    const expected = role === "host" ? "guest" : "host";
    if (!remote.data || typeof remote.data !== "object" || (remote.data as { role?: unknown }).role !== expected) {
      throw new Error(`Expected a ${expected} rendezvous peer.`);
    }
  };
}

export async function defaultRendezvousRoomFactory(role: RendezvousRole, code: string): Promise<RendezvousRoom> {
  if (typeof window === "undefined") throw new Error("Invite-code rendezvous is only available in a browser.");
  const { joinRoom } = await import("trystero");
  return joinRoom({
    appId: APP_ID,
    password: code,
    trickleIce: true,
  }, code, {
    handshakeTimeoutMs: 12_000,
    onPeerHandshake: roleHandshake(role),
  }) as unknown as RendezvousRoom;
}

function waitForPeer(room: RendezvousRoom, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (peerId: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(peerId);
    };
    const previous = room.onPeerJoin;
    room.onPeerJoin = (peerId) => {
      previous?.(peerId);
      finish(peerId);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("No host answered that invite code. Check the code and that the host is still waiting."));
    }, timeoutMs);
    const existing = Object.keys(room.getPeers())[0];
    if (existing) finish(existing);
  });
}

export type HostRendezvous = {
  code: string;
  close(): Promise<void>;
};

export async function hostByRoomCode(options: {
  code: string;
  hostName: string;
  createInvite(): Promise<{ inviteCode: string }>;
  acceptAnswer(answerCode: string): Promise<void>;
  roomFactory?: RendezvousRoomFactory;
  onStatus?: (status: RendezvousStatus) => void;
}): Promise<HostRendezvous> {
  const code = normalizeRoomCode(options.code);
  options.onStatus?.("opening");
  const room = await (options.roomFactory ?? defaultRendezvousRoomFactory)("host", code);
  const invite = room.makeAction<InviteRequest, InviteResponse>(INVITE_ACTION, {
    kind: "request",
    onRequest: async () => {
      options.onStatus?.("exchanging");
      const created = await options.createInvite();
      return { inviteCode: created.inviteCode, hostName: options.hostName };
    },
  });
  const answer = room.makeAction<AnswerRequest, AnswerResponse>(ANSWER_ACTION, {
    kind: "request",
    onRequest: async ({ answerCode }) => {
      await options.acceptAnswer(answerCode);
      options.onStatus?.("connected");
      return { accepted: true };
    },
  });
  // Hold strong references to the request actions for the life of the room.
  void invite;
  void answer;
  options.onStatus?.("waiting");
  return {
    code,
    async close() {
      await room.leave();
      options.onStatus?.("closed");
    },
  };
}

export async function joinByRoomCode(options: {
  code: string;
  guestName: string;
  createAnswer(inviteCode: string): Promise<{ answerCode: string }>;
  roomFactory?: RendezvousRoomFactory;
  timeoutMs?: number;
  onStatus?: (status: RendezvousStatus) => void;
}) {
  const code = normalizeRoomCode(options.code);
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 35_000);
  options.onStatus?.("opening");
  const room = await (options.roomFactory ?? defaultRendezvousRoomFactory)("guest", code);
  try {
    options.onStatus?.("waiting");
    const hostPeerId = await waitForPeer(room, timeoutMs);
    options.onStatus?.("exchanging");
    const invite = room.makeAction<InviteRequest, InviteResponse>(INVITE_ACTION, { kind: "request" });
    const answer = room.makeAction<AnswerRequest, AnswerResponse>(ANSWER_ACTION, { kind: "request" });
    const offered = await invite.request({ guestName: options.guestName }, { target: hostPeerId, timeoutMs });
    const created = await options.createAnswer(offered.inviteCode);
    const accepted = await answer.request({ answerCode: created.answerCode }, { target: hostPeerId, timeoutMs });
    if (!accepted.accepted) throw new Error("The host declined the multiplayer answer.");
    options.onStatus?.("connected");
    return { code, hostName: offered.hostName };
  } catch (error) {
    options.onStatus?.("error");
    throw error;
  } finally {
    await room.leave();
  }
}
