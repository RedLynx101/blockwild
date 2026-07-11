import assert from "node:assert/strict";
import test from "node:test";
import {
  createRoomCode,
  hostByRoomCode,
  joinByRoomCode,
  normalizeRoomCode,
  type RendezvousRequest,
  type RendezvousRole,
  type RendezvousRoom,
  type RendezvousRoomFactory,
} from "../app/game/invite-rendezvous.ts";

test("invite room codes are readable, normalized, and validated", () => {
  assert.equal(createRoomCode((target) => {
    target.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    return target;
  }), "23456-789AB");
  assert.equal(normalizeRoomCode("  moon berry grove  "), "MOON-BERRY-GROVE");
  assert.throws(() => normalizeRoomCode("tiny"), /at least six/i);
});

type Handler = (data: Record<string, string | number | boolean | null>, context: { peerId: string }) => Record<string, string | number | boolean | null> | Promise<Record<string, string | number | boolean | null>>;

function pairedRoomFactory() {
  const rooms = new Map<RendezvousRole, FakeRoom>();
  const handlers = new Map<string, Handler>();

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
          return await handler(data, { peerId: `${this.role}-peer` }) as R;
        },
      };
    }
    async leave() { this.closed = true; }
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
