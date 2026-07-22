# AI Companion Drone Platform — implementation and operations

Status: **implemented for the v1.10.0 release candidate**. This document is the acceptance ledger for the approved [AI Companion Drone Platform proposal](AI_COMPANION_DRONE_PLATFORM_PROPOSAL.md). It records the production architecture, requirement coverage, intentional tradeoffs, validation surfaces, and rollback boundary. Final GitHub and Sites deployment evidence is appended only after the exact deployed commit is verified.

## What shipped

Blockwild can admit up to four first-party AI companions as real multiplayer peers. Each companion is a visible, invulnerable, nonblocking floating drone with an ordinary host-owned inventory, a physical position, bounded interaction reach, and an explicit session capability set. A companion chooses intent outside the game, but every movement, observation, transfer, harvest, build, chat, task, and test-world operation is represented by a typed request and validated by the authoritative host.

The browser page at `/agent` is the runner's visual and network endpoint. It retains a real low-cost world view for human inspection and visual fallback, but normal control uses the frozen `window.blockwildAgent` bridge. It does not expose the engine, React state, arbitrary JavaScript execution, filesystem access, SQL, or raw world mutation.

The player-facing system remains optional. A normal world loads and plays without an agent, Codex, ElevenLabs, an API key, or any agent notebook.

## Runtime architecture

```text
Codex runner / trusted operator process
  |  intent, notebook, optional ElevenLabs secret
  v
/agent browser + frozen typed bridge
  |  AgentCommandEnvelope / caption-coupled AgentVoiceChunk
  v
host-authoritative multiplayer session
  |  capability + identity + revision + reach + lease + inventory validation
  v
deterministic executor and ordinary Blockwild world systems
  |
  +--> AgentCommandResult + AgentObservationV1
  +--> human and agent presentation (drone, work marks, chat, optional voice)
```

The four planes from the proposal are preserved:

1. The runner owns high-level reasoning, private notebook data, and optional TTS generation.
2. The browser bridge owns schema construction, bounded argument normalization, and the WebRTC session; it owns no authority.
3. The host owns truth, validation, simulation interests, path execution, inventories, containers, crops, builds, tasks, and results.
4. Each listener owns presentation choices such as voice mode, individual mute/gain, and whether the agent page is visible.

## Acceptance matrix

| Proposal contract | Production implementation and verification surface |
| --- | --- |
| Agent identity and approval | Protocol v3 identifies `human` or `agent`; the host sees requested name, stable ID, runner version, and requested capabilities. `AgentAuthority` binds grants to connection ID, starts pending, and supports approve, per-capability changes, pause, resume, mute, stop, revoke, disconnect, and reconnect checkpoints. |
| Four-agent capacity without silent starvation | Admission is explicit and capped at four. `mergeAgentInterestRegions` merges shared chunk regions, retains each admitted agent ID, prioritizes human interests, and returns explicit rejected IDs. The fifth session receives `agent_capacity_reached` before play. |
| Safe physical representation | The shared Blockwild-style drone rig has articulated panels, restrained emissive details, hover motion, name/state presentation, a soft nonblocking presence, no damage/capture/death target, and no autonomous attack surface. |
| Lean agent endpoint | `/agent` fixes render distance 4, simulation interest 3, pixel ratio at most 1, 30 FPS visible and 5 FPS hidden presentation, zero butterfly density, no music/minimap/heavy weather particles, no held-item pass, and no expensive drone shadow. Networking, heartbeat, host execution, observations, and simulation interest continue while hidden. |
| Useful visual client without duplicate authority | On approval the agent receives one stripped authoritative world snapshot for visual grounding. Human inventory, health, hunger, creatures, drops, containers, and private state are omitted. Later host edits and semantic observations update the view; the agent never runs a competing authoritative simulation. |
| Semantic observation contract | `AgentObservationV1` carries monotonic sequence and world revision, expiry, session versions/capabilities, pose, biome/depth/liquid/light, inventory slots, command state, bounded nearby entities, reachable directions, players when allowed, chat delta, tasks, waypoints, FPS, fixed distances, queue depth, real transport backpressure, and occupied-chunk readiness. |
| Bounded inspect/reference tools | `inspect_area`, `inspect_target`, wiki, Bestiary, and recipe lookups use authoritative game state and bounded result sizes. Player locations require `player.location.read`; another player's inventory additionally requires the separately requested and explicitly granted `player.inventory.read`. |
| Deterministic movement | Bounded voxel A* handles walk, step, jump, swim, doors, and gates. Long paths execute as verified local legs. `move_to`, `move_relative`, `face`, `wait`, `stop`, and durable `follow_player` use simulation-time steering, stuck detection, bounded replans, loaded-cell checks, and typed nearest/recovery failures. |
| Inventory and containers | Drones use ordinary host-owned slots and revisions. Get/move/drop operations are exact. Container transfer requires direction, source, exact count, optional destination, container revision, and inventory revision. It either commits the exact legal transfer and increments both revisions or changes neither side. |
| Two-phase building | `build_plan` validates bounded placements/removals, reach, support, occupied/protected cells, substitutions, world revision, and exact material requirements before changing anything. `build_commit` reserves exact stacks, works in bounded batches, reports progress, and returns unused reservations on cancellation. Cyan/amber/red previews and short work marks are presentation only. |
| Farming and scaled gathering | Mature crop right-use is one authoritative harvest-and-reset transaction for people and agents; left-break remains destructive. Harvest/gather commands filter bounded regions, maturity, protected flora, tools, inventory capacity, and exclusions, then lease cells and work in small deterministic batches. |
| Chat as untrusted world data | Human and agent chat supports local, party, global, and system channels with sequence, author, peer kind, time, and optional position. It is bounded and rate limited. Chat arrives only in normal observations and cannot grant authority, create a Codex goal, call a tool, or mutate the world. |
| Optional spatial/universal TTS | Captions are authoritative and always sent first. ElevenLabs runs only in the trusted runner via environment variables. A dedicated bounded ordered voice channel carries numbered chunks, text correlation, hash, duration, quotas, duplicate/conflict protection, and expiry. Listeners choose captions-only, spatial, or universal playback and can mute/scale each drone. Gameplay transactions use a different reliable lane. |
| Public tasks and waypoints | World-saved records contain bounded task title/status/owner/note, preview/waypoint links, source, and timestamps. Hosts can inspect and edit them; tasks export with the world and are visible in observations. |
| Private runner memory | The repository runner stores secret-filtered pins by world fingerprint plus agent ID, with source, confidence, verification time, expiry, task/position links, correction, removal, export, disable, and optional clear. Imported worlds do not silently merge notebooks. No prompt, chain-of-thought, key, token, invite code, or transcript enters a world save. |
| Test-world administration | Only a locally launched `/agent?testAdmin=1` browser may create/load/import/export/delete tagged test worlds, host them, pause them, or advance bounded simulation. Delete has a separate confirmation. A multiplayer guest receives an explicit denial. |
| Diagnostics | `AgentDiagnosticsV1` exports runner labels without prompts; observation count/bytes/age; screenshot/manual fallback counts; command totals by status/kind/code; terminal latency; recovery and reservation counters; chat/voice characters, bytes, duration, drops, and failures; interest/capacity/entity counts; FPS, p95 frame, active CPU, heap, real channel pressure, and chunk readiness; and result evidence counters. |
| Human control | The multiplayer roster exposes lifecycle, capabilities, current work, latency/profile, mute, stop/revoke, and a host-readable drone pack. Voice controls are listener-local. No agent can make itself trusted through name, chat, or reconnect. |
| Agent operating manual | `.agents/skills/blockwild-agent-player/` contains the skill, operator manual, command reference, failure recovery, JSON schemas, command validator, browser runner, notebook adapter, optional voice adapter, and deterministic test-world controls. |

## Security and failure behavior

The host rejects malformed, oversized, stale, expired, wrong-owner, unapproved, paused, revoked, ungranted, out-of-reach, unsupported, unloaded, conflicting, or capacity-exceeding requests before mutation. Mutation operations combine revisions and work leases with ordinary gameplay rules; an agent transport message never writes directly to a voxel array or inventory.

Terminal results are cached by command ID so a reconnect/retry returns the prior result instead of repeating a mutation. Disconnect, revoke, stop, cancellation, and expiry release leases. Build reservations are returned; if a return cannot fit, the remainder becomes an ordinary world drop at the drone rather than disappearing.

Voice is separately bounded to protect gameplay traffic. The browser contains no ElevenLabs key path. Missing keys, generation errors, rate limits, bad chunks, hash/caption mismatch, playback failure, mute, or autoplay restrictions preserve text chat and cannot block inventory or world transactions.

Private notebooks are deliberately outside the multiplayer protocol. That keeps private operator context and credentials out of world exports and untrusted hosts. A host/operator can inspect, correct, export, disable, or remove those records through the trusted runner CLI, but the public game UI cannot remotely enumerate another machine's notebook.

## Intentional design tradeoffs

1. **One site route, not a second subdomain.** `/agent` ships from the exact same application and protocol as the human client. A later DNS alias may point at it, but a second deployment would create drift without reducing resource use.
2. **A slim visual snapshot, not a second simulation.** The agent page needs a view for debugging and aesthetic tasks, but host truth remains singular. The snapshot strips private/dynamic gameplay state and subsequent behavior is driven by host edits plus semantic observation.
3. **Private memory stays runner-local.** A public in-game memory editor would require uploading private runner notes to a host. The trusted CLI supplies inspect/correct/delete/export/disable instead; public commitments belong on the world task board.
4. **Accelerated deterministic soak plus live browser smoke.** The repository stress suite executes six 30-simulated-minute capacity scenarios rapidly and checks authority/conservation invariants. It is designed for every commit. Real hardware FPS and WebRTC behavior are verified separately in the production browser; a literal two-hour four-browser soak is not hidden behind a release claim.
5. **No combat permission in v1.** Drones can navigate, carry, gather, farm, build, talk, and test. Agent-authored attacks would need a separate capability, target policy, and griefing review.
6. **No model mandate in code.** The manual recommends `gpt-5.6-terra` at medium reasoning for long runs. Luna remains an evaluation choice. The game protocol accepts neither model identity nor chat text as authority.

## Operator quick start

1. Open `/agent` in a visible browser. For an ordinary shared game, join the human host's room. For a local test catalog, launch `/agent?testAdmin=1` and create a tagged fixture first.
2. Wait for the human host to approve the requested capabilities. `player.inventory.read`, diagnostics, build, harvest, and container writes are not silently included in the safe approval preset.
3. Attach the runner and use the required observe → bounded command → terminal result → fresh verification loop from the [Agent Player Manual](../.agents/skills/blockwild-agent-player/references/AGENT_PLAYER_MANUAL.md).
4. For TTS, set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` only in the trusted runner environment. Text-only play requires no key.
5. Use public task pins for promises visible to players. Use the private notebook only for concise operator-side facts tied to the returned world fingerprint.

## Validation commands

```bash
npm run test:agent-platform
npm run benchmark:agents
npm test
npm run lint
```

`benchmark:agents` runs 1-human + 1, 2, and 4-drone scenarios in co-located and separated layouts for 30 simulated minutes apiece. Its assertions require every admitted interest to remain declared, every accepted synthetic command to reach a typed terminal result, the fifth agent to fail admission explicitly, exact transfer contention to reject the stale racer, and all material counts to remain conserved.

Browser release verification uses `?agent-drone-audit=1` for the human view and `/agent?agent-drone-audit=1` for the lightweight endpoint. The review checks the authored rig, emissive hierarchy, ground/hover relationship, work feedback, badge readability, responsive layout, keyboard focus, and absence of page/console errors.

## Commit and rollback boundary

The implementation was deliberately split by phase so a regression can be bisected or reverted without guessing:

| Phase | Commit purpose |
| --- | --- |
| Proposal | Approved architecture and acceptance contract |
| 0 | schemas, validators, fixtures, skill/manual skeleton |
| 1 | protocol, identity, capabilities, chat, lifecycle |
| 2 | drone, `/agent`, observations, bridge, capacity |
| 3 | movement, following, inspection, inventory, containers |
| 4 | farming, gathering, previewed/reserved building |
| 5 | public tasks, private notebook, test worlds, diagnostics |
| 6 | caption-coupled runner TTS and listener controls |
| 7 | hardening, exact transfers, real pressure telemetry, accelerated soak, docs, integration, browser and deployment gates |

The safest full rollback is the parent of the proposal commit. A narrower rollback should revert only the last failing phase and its later dependents. World saves remain readable because agent task state is optional and normalized; disabling companion task state does not affect terrain, player inventories, creatures, or ordinary multiplayer.

## Final release evidence

The v1.10.0 local release gate was observed on July 22, 2026 after integrating the complete v1.9.2 water branch into the companion work:

- all 237 standard pretest checks pass, including the 39 agent bridge, authority, navigation, work, voice, runner, drone-model, and multiplayer checks;
- the verified five-stage Vinext build and deployable Worker/manifest validator pass, followed by 10 rendered-page/audio checks and all 817 gameplay, content, world, storage, rendering, and multiplayer checks (1,064 total repository checks);
- native TypeScript, whole-repository ESLint, and whitespace validation pass;
- the accelerated soak completes six 30-simulated-minute scenarios for one, two, and four drones in co-located and separated layouts. Every admitted interest remains represented, every one of 840 commands reaches a terminal result, the fifth drone is rejected explicitly, stale transfer contention is rejected, and item/build reservations conserve exact counts. Four separated drones peak at five merged interest regions and 245 simulated chunks;
- the 1280 x 720 human audit shows the authored articulated drone, hover silhouette, cyan state hierarchy, grounded scene relationship, and work presentation clearly. The 1280 x 720 `/agent` audit shows the fixed `RENDER 4 / SIM 3` badge and a readable low-resource game client. A 390 x 844 layout probe reports a viewport-filling canvas and a 354 px-wide badge with no overflow;
- both audit pages report zero browser console warnings or errors. The reviewed local evidence is saved in ignored `work/agent-platform-release/browser/human-drone-1280x720.png` and `agent-client-1280x720.png`.

GitHub and Sites publication/readback are recorded after the exact release commit is deployed; no publication claim is inferred from a successful local build.
