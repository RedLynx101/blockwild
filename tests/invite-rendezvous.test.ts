import assert from "node:assert/strict";
import test from "node:test";
import {
  RENDEZVOUS_RELAY_URLS,
  createRoomCode,
  hostByRoomCode,
  joinByRoomCode,
  normalizeRoomCode,
  type RendezvousRequest,
  type RendezvousRole,
  type RendezvousRoom,
  type RendezvousRoomFactory,
} from "../app/game/invite-rendezvous.ts";

test("invite rendezvous avoids the retired Halifax relay while retaining redundant paths", () => {
  assert.ok(RENDEZVOUS_RELAY_URLS.length >= 3);
  assert.equal(RENDEZVOUS_RELAY_URLS.some((url) => url.includes("halifax")), false);
  assert.equal(new Set(RENDEZVOUS_RELAY_URLS).size, RENDEZVOUS_RELAY_URLS.length);
});

test("invite room codes are readable, normalized, and validated", () => {
  assert.equal(createRoomCode((target) => {
    target.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    return target;
  }), "23456-789AB");
  assert.equal(normalizeRoomCode("  moon berry grove  "), "MOON-BERRY-GROVE");
  assert.throws(() => normalizeRoomCode("tiny"), /at least six/i);
});

type Handler = (data: Record<string, string | number | boolean | null>, context: { peerId: string }) => Record<string, string | number | boolean | null> | Promise<Record<string, string | number | boolean | null>>;

function pairedRoomFactory(options: { failInviteResponseOnce?: boolean; leaveErrorRole?: RendezvousRole } = {}) {
  const rooms = new Map<RendezvousRole, FakeRoom>();
  const handlers = new Map<string, Handler>();
  let failedInviteResponse = false;

  class FakeRoom implements RendezvousRoom {
    onPeerJoin: ((peerId: string) => void) | null = null;
    closed = false;
    constructor(readonly role: RendezvousRole) {}
    getPeers() {
      const remote = this.role === "host" ? rooms.get("guest") : rooms.get("host");
      return remote ? { [`${remote.role}-peer`]: {} } : {};
    }
    makeAction<T extends Record<string, string | number | boolean | null>, R extends Record<string, string | number | boolean | null>>(
      namespace: string,
      config: { kind: "request"; onRequest?: (data: T, context: { peerId: string }) => R | Promise<R> },
    ): RendezvousRequest<T, R> {
      if (config.onRequest) handlers.set(`${this.role}:${namespace}`, config.onRequest as unknown as Handler);
      return {
        onRequest: config.onRequest ?? null,
        request: async (data) => {
          const remoteRole = this.role === "host" ? "guest" : "host";
          const handler = handlers.get(`${remoteRole}:${namespace}`);
          if (!handler) throw new Error(`Missing ${remoteRole} ${namespace} handler`);
          const response = await handler(data, { peerId: `${this.role}-peer` }) as R;
          if (namespace === "bwinvite" && options.failInviteResponseOnce && !failedInviteResponse) {
            failedInviteResponse = true;
            throw new Error("Request timed out after the host handled it");
          }
          return response;
        },
      };
    }
    async leave() {
      this.closed = true;
      if (options.leaveErrorRole === this.role) throw new Error("User-Initiated Abort/Close called");
    }
  }

  const factory: RendezvousRoomFactory = async (role) => {
    const room = new FakeRoom(role);
    rooms.set(role, room);
    const other = rooms.get(role === "host" ? "guest" : "host");
    if (other) queueMicrotask(() => {
      room.onPeerJoin?.(`${other.role}-peer`);
      other.onPeerJoin?.(`${room.role}-peer`);
    });
    return room;
  };
  return { factory, rooms };
}

test("one room code exchanges the WebRTC offer and answer automatically", async () => {
  const { factory } = pairedRoomFactory();
  const accepted: string[] = [];
  const host = await hostByRoomCode({
    code: "GROVE-7429",
    hostName: "Host",
    createInvite: async () => ({ inviteCode: "encoded-offer" }),
    acceptAnswer: async (answerCode) => { accepted.push(answerCode); },
    roomFactory: factory,
  });
  const joined = await joinByRoomCode({
    code: "grove 7429",
    guestName: "Guest",
    createAnswer: async (inviteCode) => {
      assert.equal(inviteCode, "encoded-offer");
      return { answerCode: "encoded-answer" };
    },
    roomFactory: factory,
  });
  assert.deepEqual(joined, { code: "GROVE-7429", hostName: "Host" });
  assert.deepEqual(accepted, ["encoded-answer"]);
  await host.close();
});

test("a guest can begin first and waits for the host room to finish opening", async () => {
  const { factory } = pairedRoomFactory();
  const joinedPromise = joinByRoomCode({
    code: "TRAIL-9021",
    guestName: "Early Guest",
    createAnswer: async () => ({ answerCode: "early-answer" }),
    roomFactory: factory,
    timeoutMs: 700,
    retryDelayMs: 1,
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  const host = await hostByRoomCode({
    code: "TRAIL-9021",
    hostName: "Late Host",
    createInvite: async () => ({ inviteCode: "late-offer" }),
    acceptAnswer: async () => undefined,
    roomFactory: factory,
  });

  assert.deepEqual(await joinedPromise, { code: "TRAIL-9021", hostName: "Late Host" });
  await host.close();
});

test("lost responses retry one host offer and cleanup aborts cannot replace success", async () => {
  const { factory } = pairedRoomFactory({ failInviteResponseOnce: true, leaveErrorRole: "guest" });
  let inviteCalls = 0;
  const statuses: string[] = [];
  const host = await hostByRoomCode({
    code: "EMBER-4432",
    hostName: "Host",
    createInvite: async () => {
      inviteCalls += 1;
      return { inviteCode: "stable-offer" };
    },
    acceptAnswer: async () => undefined,
    roomFactory: factory,
  });
  const joined = await joinByRoomCode({
    code: "EMBER-4432",
    guestName: "Guest",
    createAnswer: async () => ({ answerCode: "stable-answer" }),
    roomFactory: factory,
    timeoutMs: 700,
    retryDelayMs: 1,
    onStatus: (status) => statuses.push(status),
  });

  assert.equal(joined.hostName, "Host");
  assert.equal(inviteCalls, 1, "a response retry must share the per-peer host offer flight");
  assert.ok(statuses.includes("retrying"));
  await host.close();
});
