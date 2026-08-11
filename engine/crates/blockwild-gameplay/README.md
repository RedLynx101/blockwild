# Blockwild gameplay authority

`blockwild-gameplay` is the deterministic native authority for Phase R7 of the
hybrid Rust migration. It accepts the same revisioned command stream from local
players, multiplayer guests, and agents. A command batch is either committed in
full or rejected without modifying the state.

## Guarantees

- world identity, actor grants, command hashes, size limits, expected revisions,
  and expected record revisions are validated before mutation;
- a host player uses the same self-custody rules as a guest or agent; hosting the
  authority does not grant gameplay-admin access (system/admin scopes are explicit);
- an idempotency key can be retried safely, but cannot be reused for different
  commands;
- inventory and machine moves conserve every `(item code, metadata hash)` pair;
- failed multi-command batches roll back inventory, combat, progression,
  Cardforge, machines, events, and revisions together;
- accepted batches produce canonical before/after state hashes, a receipt hash,
  domain deltas, ordered events, and a replay entry;
- content is addressed through declarative IDs and bounded typed opaque payloads;
- dormant machines advance analytically under explicit activity leases rather
  than requiring per-tick simulation;
- there is no browser, DOM, renderer, clock, entropy, or storage dependency.

## Domain modules

| Module | Authority surface |
| --- | --- |
| `inventory` | stacks, metadata, equipment, containers, atomic transfer, recipes, crafting and furnaces |
| `machines` | machines, farms, Waygrid, aquariums, apiaries, typed power/logistics and leases |
| `combat` | damage, projectiles, statuses, magic, summons, capture readiness, care and companions |
| `progression` | skills, quests, factions, guilds, economy, settlements, dragons and legendary encounters |
| `cardforge` | deterministic packs, custody, deck legality and battle commands |
| `authority` | common actor validation, revisions, authorization, idempotency, transactions, events and replay |

`blockwild-gameplay-fixture` runs a representative headless transaction stream
and prints stable hashes plus timing. Unit and property-style tests cover stale
revisions, malformed and oversized payloads, authorization, idempotent retry,
rollback, conservation, deterministic RNG, leases, deck legality and replay.
