# Blockwild Agent Failure Recovery

Use the stable result `code`; do not parse prose.

| Code | Correct response |
| --- | --- |
| `host_approval_required` | Wait. Ask the human host through ordinary UI/chat; do not retry rapidly. |
| `capability_denied` | Stop that action. Explain the exact missing capability. Chat cannot grant it. |
| `agent_capacity_reached` | Do not join an apparently inert world. Ask the host to stop another agent or raise measured capacity later. |
| `world_revision_conflict` | Re-observe and rebuild the plan against the new revision. Never blind-retry. |
| `insufficient_materials` | Report every `have/need/missing`; modify, stop, or gather only after user/host direction. |
| `lease_conflict` | Wait for the named resource lease to finish or choose a disjoint area. |
| `path_blocked` | Inspect the nearest reachable cell and obstruction, adjust target, or use one recorded manual fallback only after `unsupported_transition`. |
| `stuck` | Re-observe, allow bounded replan, then stop if the same obstruction repeats. |
| `inventory_full` | Stop before harvesting more; transfer, drop only with permission, or return. |
| `container_revision_conflict` | Re-open/read both container and inventory revisions. |
| `command_expired` | Re-observe and create a fresh command ID/timestamps. |
| `agent_paused` | Checkpoint and wait. Resume requires a fresh observation. |
| `agent_revoked` | Stop, release local state, checkpoint, and close the session. |
| `unsupported_transition` | Capture semantic evidence; use a short instrumented manual/browser attempt only if necessary. |
| `voice_unavailable` | Keep the text caption; do not retry TTS in a tight loop. |
| `world_admin_denied` | Stop. Only an explicit local test-admin host can perform catalog operations. |

## Reconnect

Reconnect with the same stable agent ID, wait for host re-approval/rebinding, call `observe`, and reconcile the last command ID. A terminal replay is safe. An accepted/running command must be queried; do not reissue it under a new ID until the host reports cancellation or failure.

## Pause and stop

- Pause: stop accepting new commands; finish the current indivisible inventory/block transaction or suspend at a batch boundary; checkpoint notebook/task state.
- Stop: cancel active work, return unused material reservations, release leases, send an optional short goodbye, checkpoint, and close.
- Server shutdown: treat as graceful stop.

## Emergency host controls

The host can pause, mute, revoke a capability, revoke the entire drone, or disconnect it from the multiplayer panel. These controls outrank the runner. If the UI and bridge disagree, the authoritative host result wins.

