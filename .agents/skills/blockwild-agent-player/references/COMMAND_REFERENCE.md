# Blockwild Agent Command Reference

All commands use schema 1, a unique idempotent `commandId`, the stable `agentId`, the latest `expectedWorldRevision`, timestamps, a bounded `arguments` object, and optional human-readable `clientIntent`.

```json
{
  "schema": 1,
  "commandId": "cmd_example_001",
  "agentId": "agent_fieldhand",
  "kind": "move_to",
  "expectedWorldRevision": 42,
  "issuedAt": 1784680000000,
  "expiresAt": 1784680030000,
  "arguments": { "target": { "x": 12, "y": 31, "z": -8 } },
  "clientIntent": "Walk to the western chest"
}
```

## Commands

| Domain | Kinds | Important arguments |
| --- | --- | --- |
| Session | `session.status`, `session.pause`, `session.resume`, `session.stop`, `capabilities.list` | none or reason |
| Observe | `observe`, `inspect_area`, `inspect_target`, `wiki_lookup`, `bestiary_lookup`, `recipe_lookup` | center/radius, target, query/id |
| Movement | `move_to`, `move_relative`, `follow_player`, `face`, `wait`, `stop` | target/delta, playerId + distance band, milliseconds |
| Social | `chat_read`, `chat_send`, `speak`, `emote` | afterSequence, text, channel |
| Inventory | `inventory_get`, `inventory_move`, `inventory_drop`, `agent_inventory_open_for_host` | slots, count, expected revision |
| Interaction | `interact`, `open_container`, `container_get`, `container_transfer`, `use_workstation` | target/coordinates, slots/count/revisions |
| Work | `harvest_area`, `gather_resource`, `build_plan`, `build_commit`, `build_cancel` | bounded region/filter; placements/removals; previewId |
| Public task | `task_pin`, `task_update`, `waypoint_pin` | title/status/note; name/position |
| Runner memory | `memory_pin`, `memory_list`, `memory_remove` | intercepted by trusted runner notebook; never sent to host |
| Test admin | `world_list`, `world_create`, `world_load`, `world_export`, `world_delete`, `diagnostics_start`, `diagnostics_stop`, `diagnostics_export` | local test-admin only; delete requires `confirm:true` |

## Build example

```json
{
  "schema": 1,
  "commandId": "cmd_bridge_plan",
  "agentId": "agent_fieldhand",
  "kind": "build_plan",
  "expectedWorldRevision": 42,
  "issuedAt": 1784680000000,
  "expiresAt": 1784680060000,
  "arguments": {
    "placements": [
      { "x": 12, "y": 30, "z": -8, "block": 5 },
      { "x": 13, "y": 30, "z": -8, "block": 5 }
    ],
    "removals": [],
    "allowedSubstitutions": {}
  },
  "clientIntent": "Preview a two-block bridge"
}
```

If blocked for materials, the result includes `materials: [{block,name,have,need,missing}]` and `choices: ["modify_plan","stop","get_more_resources"]`.

## Result rules

- `accepted` and `running` are nonterminal.
- `blocked`, `completed`, `cancelled`, and `failed` are terminal.
- Every accepted command must eventually receive a typed terminal result.
- Verify success from returned inventory/world deltas and a fresh observation, not from chat or model narration.

