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
| `world_view` | machine anchors/lights, dropped-item custody and transforms, explicit player/container bindings, weather/environment lighting, atmosphere/gravity and celestial sky authority |
| `world_view_snapshot` | canonical `BWVWSP` V1 snapshot, checksums, bounded histories, extensions and atomic validated restore |

`blockwild-gameplay-fixture` runs a representative headless transaction stream
and prints stable hashes plus timing. Unit and property-style tests cover stale
revisions, malformed and oversized payloads, authorization, idempotent retry,
rollback, conservation, deterministic RNG, leases, deck legality and replay.

## World-view authority integration ABI

`WorldViewAuthorityV1` is a separate revisioned authority so the existing
`BWGPSNP` gameplay snapshot stays byte-compatible. It is intended to become an
explicit native persistence record in `IntegratedRuntimeV2`; runtime and Wasm
integration are outside this crate and are not claimed by this implementation.

The parent runtime owns one authority per `WorldKey` and follows this order:

1. Clone the integrated runtime for a cross-domain transaction.
2. Apply ordinary R7 inventory/machine commands to the staged gameplay state.
3. Apply a `WorldViewBatchV1` using that staged `GameplayState` so every spatial
   record is checked against canonical machine and container custody.
4. Apply the matching R6 entity command when a dropped item or player binding
   references an entity.
5. Assign the staged runtime only after all commands succeed.
6. Persist `WorldViewAuthorityV1::encode_snapshot_v1` as a separate record and
   restore with `decode_world_view_authority_snapshot_v1` or atomic
   `install_snapshot_v1` after the gameplay record is hydrated.

Public read APIs are renderer-neutral:

- `WorldViewStateV1::player_binding` and `player_binding_by_entity`;
- `held_stack` and `dropped_stack`, which revalidate current container custody;
- ordered maps for `machine_anchors`, `dropped_items`, and `player_bindings`;
- fixed-point `environment`, `atmosphere_gravity`, and `celestial` records.

Dropping an item uses `stage_player_drop_v1`. The request binds exact gameplay
and world-view identities plus binding/container revisions. The pure helper
applies `InventoryCommand::CreateDropCustody` through a cloned
`GameplayAuthority`, so the one-item transfer, new custody container, gameplay
revision, retry receipt, and replay entry are native authority state. Its
request hash is part of the command hash, so an idempotency key cannot be reused
with a different transform or drop identity. The helper returns that authority,
a `DroppedItemSpatialV1`, and a canonical transaction hash without mutating
either input. The caller must still stage the matching entity spawn and
`WorldViewCommandV1::RegisterDrop` before assigning the runtime clone.

New-player initialization likewise uses
`InventoryCommand::CreatePlayerCustody`, followed by
`WorldViewCommandV1::UpsertPlayerBinding` against the staged gameplay state.
Pickup/removal can transfer the item and apply
`InventoryCommand::RemoveEmptyDropCustody` in one gameplay batch before
`RemoveDrop(ContainerRemoved)`. The world-view command rejects that reason while
the custody container remains present, preventing a presentation record from
outliving or falsely erasing authoritative custody.

The `BWVWSP` record has a 64 MiB file bound, 1 MiB extension bound, canonical
little-endian fields, separate state/replay/payload hashes, duplicate rejection,
strict enum/boolean tags, bounded grants/retry/replay histories, and exact
extension preservation. Restore validates machine, inventory, player, weather,
gas, gravity, and celestial references before replacement. Golden fixtures are
`fixtures/world-view-snapshot-v1.txt` and
`fixtures/world-view-player-drop-v1.txt`.
