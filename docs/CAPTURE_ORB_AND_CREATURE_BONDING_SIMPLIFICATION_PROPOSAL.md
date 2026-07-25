# Capture Orb and Creature Bonding Simplification Proposal

**Status:** Implemented for Blockwild v1.11.0; this remains the design and acceptance contract
**Prepared:** July 24, 2026
**Target checkout:** `C:\Users\NoahH\Desktop\CMU\Random\blockwild` on `main`
**Scope:** creature capture, research, stored-creature usability, taming/conversion, related inventory and commerce records, multiplayer authority, and save migration

## Executive decision

Blockwild should have one player-facing capture tool and one understandable creature relationship lifecycle:

```text
ONE EMPTY CAPTURE ORB
        |
        v
ELIGIBLE CREATURE + ONE VISIBLE READINESS RULE
        |
        v
CAPTURED SPECIMEN
  custody only; original disposition preserved
        |
        +----------------------> RELEASE TO WILD
        |
        v
CREATURE CAMP: STABILIZE -> NOURISH -> CONNECT
        |
        v
EXPLICIT "FORM BOND" ACTION
        |
        v
FRIENDLY, OWNED, USABLE COMPANION
        |
        v
LONG-TERM BOND, LEVELS, MOVES, GEAR, RIDING, AND WORK
```

The normal **Capture Orb** becomes the only item a player needs to capture any ordinary capturable creature. Gentle, Gloam, Tide, and Resonance Lens Orbs are retired. Species-named orb item IDs become compatibility records or merchant templates, never distinct inventory objects. Nets, jars, Worker Bee capsules, and Queen Cells stop acting as alternative creature-custody systems; where their fantasy is worth keeping, they become optional habitat, display, apiary, or research objects downstream of an ordinary Capture Orb.

Capture remains deterministic. No hidden catch percentage is introduced. Ordinary creatures use one universal readiness model:

- a passive or neutral creature must be calm;
- an aggressive creature can always be visibly subdued at the standard health threshold, with two optional non-damage routes that reach the same capture-ready state;
- an aquatic creature and the keeper must be in water;
- a story, legendary, owned, faction-aligned, summoned, or otherwise exceptional creature reports one explicit lock reason.

Research never hides whether a creature can be captured or the broad action needed. The target card always gives the exact standard health threshold and, when available, names the two universal alternatives: outmaneuver it or set the displayed calming offering. Research instead reveals additional preferred offerings, authored ecology, care, rare forms, and efficient bonding routes. The existing authored capture sheets remain valuable writing and creature identity, but most stop being hard mechanical checklists.

Capture is explicitly not taming. An eligible captured creature can follow one clearly displayed conversion path at Creature Camp. The final bond is a deliberate, host-authoritative action. It establishes canonical friendliness and ownership, then updates the existing species-specific compatibility state so following, deployment, combat, work, mounting, breeding, and persistence agree.

## Why this change is needed

The current system contains good individual ideas but asks the player to understand too many overlapping abstractions:

- one canonical orb item;
- four craftable lens-orb items;
- nine species-prefilled orb item IDs;
- nine capture profiles;
- seventeen capture condition IDs;
- research-dependent condition visibility;
- Prime field-route gates;
- separate net, jar, apiary capsule, and Queen Cell capture paths;
- orb attunement;
- generic bond tiers;
- `tamed` and `ownerId`;
- several species-specific taming states;
- legendary resolutions, Worldpins, faction alignment, and constructed companions.

The result is not merely a large system. Several concepts that appear equivalent to a player are not equivalent in code:

- capturing records custody but does not establish ownership;
- attuning an orb can establish a deployment link without establishing taming;
- reaching a generic bond tier can make a deployed creature appear tamed while its species-specific controller still lacks its expected tame state;
- `tameable: true` does not guarantee that a species participates in a working runtime taming branch;
- research can conceal a required condition as `Unknown condition`;
- a merchant's “Capture Orb: Creature” can be a special item ID, a commerce template that creates a normal filled orb, or both;
- a butterfly, Lightning Bug, worker bee, and Hive Queen use capture paths unlike the creature currently shown by the Capture Orb HUD.

The redesign should preserve Blockwild's ecological care, creature individuality, exact specimen identity, non-random capture, and authored legendary encounters. It should remove inventory trivia, hidden gates, and ownership ambiguity.

## Repository findings

These are observations from the current code, not proposed behavior.

### 1. There is already a canonical orb beneath the variants

`app/game/capture-orbs.ts` defines one `CaptureOrb` record with:

- a stable `orbId`;
- `capturedAt`;
- an exact `CreatureMetadata` payload;
- an optional lens;
- optional attunement/deployment state.

Empty ordinary orbs collapse to a metadata-free, stackable `Item.CaptureOrb`. Filled orbs remain singleton records. Capture and release clone the exact creature metadata. Orb racks, Healing Stations, the Waygrid Creature Archive, aquariums, apiaries, merchant stock, the Chrysalis Loom, and golem production already depend on that exact identity behavior.

This is the correct foundation and should be retained.

### 2. The inventory layer still exposes many orb identities

`app/game/data.ts` currently exposes:

- the normal Waykeeper Capture Orb and a legacy orb ID;
- Gentle, Gloam, Tide, and Resonance Lens Orbs;
- Glimmerhart and Runeowl Orbs;
- Copper Scout, Stone Bulwark, Aetherforged Sentinel, Copper Mole, Deepgear Courser, Clockwork Hound, and Webspinner Orbs.

That is fifteen normal/legacy/lens/species item identities, even though many eventually normalize into the same exact orb record. The four lens recipes each consume a normal orb plus several materials. Commerce adapters also map creature offers through named orb stock keys.

### 3. Capture readiness is deterministic but fragmented

`app/game/creature-capture.ts` defines nine capturable profiles:

`open`, `gentle`, `pursuit`, `armored`, `territorial`, `aquatic`, `resonant`, `rescue`, and `legendary`.

It also defines seventeen conditions. Some profiles require a conjunction of multiple conditions, some accept alternatives, and aquatic/resonant routes require a particular lens. Research determines which condition labels the player can see; an unmet unrevealed group appears as `Unknown condition`.

The engine derives those states from awareness, fleeing, recent damage, current health, water occupancy, status effects, prior capture history, follow commands, bond state, legendary progress, and other runtime fields. Prime specimens add a separate three-step hard gate.

The system does not roll a hidden catch chance, which is good. Its problem is that the deterministic rule is not one learnable rule.

### 4. Research is both rich and indirectly confusing

The Living Bestiary is extensible and already tracks:

- seen, killed, captured, tamed, and bred counts;
- first/last observations and first capture;
- research nodes;
- forms and specimen IDs;
- summon origins and guild links;
- append-only creature-specific sections.

Research currently advances through mechanisms such as a thirty-second Kinmark disposition study and repeated Creature Camp observations. Capture knowledge is then inferred from whether the creature is seen, captured, has completed research nodes, or has a secret unlocked.

Research does not alter the underlying capture rules, but it alters whether the player is told those rules. A player can therefore possess the correct orb and perform an understandable interaction while still seeing an unknown requirement.

### 5. Exact custody is strong; relationship state is not canonical

`CreatureMetadata` preserves hostility, taming, ownership, name, faction provenance, settlement provenance, alignment, and an extensible custom payload. Creature progression independently preserves level, moves, bond points, bond tier, phenotype, rarity, aptitudes, and capture history.

Runtime friendliness and ownership can also live in:

- `creatureTamed` and `creatureOwnerId`;
- `courserBond`;
- `petState`;
- `dragonState`;
- `shadeState`;
- `reedstriderBond`;
- `leviathanGrowth`;
- `apiaryBee`;
- `hiredByPlayerId`, faction, and alignment fields.

Capture preserves these states, but it does not unify them.

### 6. The current conversion path is partial and implicit

Creature Camp can feed, groom, wash, play, train, rest, study, equip, and configure a stored specimen. Those actions can increase the generic bond score. Orb deployment treats a creature at `trusted`, `partnered`, or `kindred` as tamed.

However:

- the Camp presents tactics, moves, work, and gear even when the specimen is still wild;
- attunement can be applied to any conscious stored creature;
- only a fixed subset of creature kinds enters the reusable generic bond handler;
- several important kinds use bespoke taming branches;
- a generic bond tier does not necessarily create the species-specific state expected by commands, riding, breeding, or AI;
- an aggressive captured creature can therefore be safely stored but still have no obvious, reliable path to become a usable companion.

### 7. Insects and bees are parallel capture systems

The Butterfly Net currently:

- turns worker bees into apiary capsules;
- turns a weakened Hive Queen into a Queen Cell;
- bottles a Lightning Bug when the player also has a Glass Bottle;
- turns butterflies into species-specific jar or treat items.

Those paths update inventory and bestiary records outside the ordinary Capture Orb transaction. The jar and apiary fantasies are useful; requiring unrelated capture tools and custody payloads is not.

### 8. Multiplayer capture is already correctly host-authoritative

Guests send typed creature actions. The host validates:

- actor and selected inventory state;
- range;
- target existence;
- temporary summons;
- faction alignment;
- capture readiness;
- pack space for splitting a filled orb;
- release location;
- attunement ownership;
- habitat safety.

The host then updates the exact orb payload, mob state, player inventory revision, bestiary and encounter records, snapshots, and save state. Critical responses are retried by request ID. This authority boundary should be extended, not replaced.

### 9. Existing tests protect valuable invariants

Current tests cover, among other things:

- exact orb identity through storage and release;
- empty-orb stacking and filled-orb singleton safety;
- legacy cage migration;
- lenses and readiness profiles;
- authored capture/care sheets;
- orb racks, Healing Stations, archives, apiaries, aquariums, merchant transactions, and morphing;
- creature progression and capture history;
- multiplayer payload validation and host authority;
- bestiary records and Prime/legendary custody.

The simplification can be safely implemented if these exact-identity and authority invariants are retained while obsolete lens/profile assertions are deliberately replaced.

## Assumptions for review

The following are design assumptions, not findings:

1. “One normal Capture Orb type” means one way to take custody of any creature entity, including butterflies, bees, and Lightning Bugs—not merely removing the four lens recipes.
2. Jars, apiaries, exhibits, aquariums, Queen Cells, and similar objects may remain as optional display, habitat, breeding, light, or production objects after capture.
3. Creature Camp is the appropriate no-extra-simulation interface for rehabilitation and bonding.
4. Detailed authored ecology should remain in the game, but ordinary collection should not require memorizing it.
5. Capturable but non-companion creatures may continue to exist if their limitation is known before capture and their relocation, research, habitat, or release value is real.
6. Dragons, legendaries, temporary summons, sentient people, faction property, and built constructs should retain authored acquisition rules rather than being flattened into ordinary animal taming.

If assumption 1 is too broad, the narrow fallback is to remove only lens and species orb identities while leaving net/jar capture intact. That fallback is not recommended because the player would still face multiple custody systems.

## Target player experience

### First encounter

When the crosshair rests on a creature and the player holds an empty Capture Orb, the target card always shows one of:

- **READY — Calm**
- **READY — Subdued**
- **WEAKEN TO 8 / 24 HEALTH**
- **OUTMANEUVER 1 / 2 — EVADE WITHOUT STRIKING**
- **OFFER WARG FEED — SET IT DOWN AND STEP BACK**
- **LET IT CALM DOWN**
- **ENTER THE WATER**
- **STORY RESOLUTION REQUIRED**
- **ALIGNED TO A SETTLEMENT**
- **ALREADY OWNED**
- **TEMPORARY SUMMON**
- **RELOCATION ONLY**
- **CANNOT BE CAPTURED**

There is no `Unknown condition`. For an aggressive creature, **WEAKEN TO** remains the first and most prominent answer because it is the reliable default. The optional Outmaneuver and Calming Offering rows are visible beneath it when valid. Research may add flavor, additional valid offerings, and efficient context, but it never withholds the primary answer or the first usable offering.

### Capturing

The player uses the normal Capture Orb. The result is deterministic and immediate. If an orb comes from a stack, the host atomically splits one filled singleton as it does today.

The capture message states the relationship result:

> Captured Wild Redbanner Warg. It is safe in the orb, but it is not your companion. Open Creature Camp to rehabilitate it, or release it to the wild.

For a previously bonded creature:

> Recalled Bramble into its Capture Orb. Bond and equipment preserved.

### After capture

The orb tooltip and Creature Camp show two separate facts:

- **Custody:** Captured
- **Relationship:** Wild, Acclimating, Bond-ready, Companion, Covenant, Construct, or Relocation-only

An untamed aggressive creature cannot be accidentally deployed as a companion. The player can:

- begin its visible bonding path if eligible;
- assign it to a compatible habitat;
- study or care for it;
- release it to the wild with an aggression warning;
- keep it safely stored.

### Forming a bond

Eligible ordinary creatures use the same three visible stages:

1. **Stabilize** — conscious, at least 75% health, and free of incapacitating harmful statuses.
2. **Nourish** — accept one displayed preferred food. Research reveals additional favorite foods and a stronger first-care bonus.
3. **Connect** — complete a small deterministic number of accepted care sessions at Creature Camp:
   - Gentle: 1
   - Skittish: 2
   - Defensive: 2
   - Hostile: 3

One care session is one accepted, relevant interaction such as rest, groom, wash, play, or a species-appropriate non-combat training exercise. Repeating a zero-cost button in one frame must not count; each session consumes a valid daily care opportunity or an authored interaction. A compatible sanctuary habitat may count as one session, but is a convenience rather than a mandatory construction gate.

When all three stages are complete, the player chooses **Form Bond**. Nothing happens automatically on capture, feeding, or reaching a score.

That action:

- sets the canonical keeper;
- makes the creature friendly to that keeper and their permitted party rules;
- enables orb attunement and safe deployment;
- initializes the compatibility state expected by the species;
- records a tame in the Bestiary;
- begins long-term bond progression.

The initial companion bond tier remains `wary` or `familiar`. Long-term bond tiers continue to unlock stronger behavior, advanced moves, riding, breeding, field work, or legendary privileges. Forming a usable bond should not require grinding to the current `trusted` threshold first.

## One normal Capture Orb

### Canonical item

Only `Item.CaptureOrb` appears in:

- crafting;
- inventory and creative catalogs;
- ordinary loot;
- guild rewards;
- merchant stock;
- tooltips;
- the item guide;
- recipes;
- player instructions.

Keep current desirable behavior:

- empty orbs stack;
- filled orbs are exact singletons;
- releasing a normal, unattuned creature returns an empty stackable shell;
- racks, Healing Stations, archives, and habitats preserve exact metadata;
- a creature's stable specimen ID never changes because it moved between systems.

### Retire lens orbs

Remove the four lens-orb recipes and all player-facing references to:

- Gentle Lens;
- Gloam Lens;
- Tide Lens;
- Resonance Lens.

The ordinary orb works in every medium. Water remains a physical capture condition, not an inventory key. Resonance and gentle approaches remain optional researched interactions, not required hardware.

The `CaptureOrb.lens` decoder should remain temporarily tolerant for old saves. New saves should not emit a meaningful lens field.

### Retire species orb item identities

Merchant and forge outputs should create:

```text
Item.CaptureOrb
+ exact captured-creature metadata
```

They should not create a species-specific item enum. A tooltip may naturally read “Capture Orb · Glimmerhart,” but that name is derived from the payload, not the item ID.

Commerce stock needs a separate `creatureTemplateKind` or equivalent offer payload. Reverse commerce lookup must continue refusing to infer the value of a filled orb from `Item.CaptureOrb` alone.

### Bring small creatures into the same custody system

Recommended rule:

- butterflies are captured into ordinary orbs;
- Lightning Bugs are captured into ordinary orbs;
- worker bees and Hive Queens are captured into ordinary orbs;
- fish and sea slugs continue using ordinary orbs;
- all Bestiary capture counts use the same record path.

The existing objects can remain downstream:

- insert a captured butterfly into a conservatory or optional display jar;
- insert a captured Lightning Bug into a jar block to create living light;
- insert a captured bee or queen into an apiary;
- produce Queen Cells through apiary husbandry rather than by turning a netted queen into an item;
- use a normal filled orb to transfer inhabitants back out.

The Butterfly Net can be retired or repurposed as an optional insect observation tool. It must not remain a second required capture device.

## Universal capture readiness

### Ordinary rule

Every ordinary capturable creature evaluates the same rule groups in the same order:

1. **Legal/authorial eligibility**
2. **Reach and line of sight**
3. **Medium safety**
4. **Disposition readiness**
5. **Inventory capacity**

Suggested pure result:

```ts
type CaptureBlocker =
  | "out-of-range"
  | "no-line-of-sight"
  | "wrong-medium"
  | "still-alert"
  | "health-too-high"
  | "story-locked"
  | "faction-aligned"
  | "foreign-owned"
  | "temporary-summon"
  | "uncapturable"
  | "pack-full";

type AggressiveReadinessRoute =
  | "health-subdual"
  | "outmaneuver"
  | "calming-offering"
  | "authored-resolution";

type CaptureReadinessV2 = {
  eligible: boolean;
  ready: boolean;
  method: "calm" | "subdued" | "authored-resolution" | null;
  route: AggressiveReadinessRoute | null;
  settledUntilMs: number | null;
  blocker: CaptureBlocker | null;
  currentHealth: number;
  requiredHealth: number | null;
  alternatives: readonly {
    route: "outmaneuver" | "calming-offering";
    available: boolean;
    progressText: string;
  }[];
  companionOutcome: RelationshipMode;
  message: string;
};
```

Only one primary blocker is presented at a time, following the order above. Optional aggressive alternatives are not blockers and never obscure the health threshold; they appear as secondary actionable rows. The Bestiary may show the full explanation.

### Passive and neutral creatures

A non-hostile creature is ready when:

- it is not in an alarm/flee response;
- the player is within orb range and has line of sight;
- its medium is safe.

Feeding, Kinmark, stealth, rescuing, or resolving an ecological problem may calm it faster, but none requires a different orb.

### Aggressive and actively defensive creatures

The predominant, reliable route remains combat subdual. An aggressive creature is ready when its health is at or below a visible universal threshold. Recommended first tuning is **40% of maximum health**, rounded up and shown as an exact health value on the target card.

The current one-heart fallback should remain for creatures whose maximum health is too small for the percentage rule to produce a practical window.

Two universal non-damage alternatives add variety without weakening that default:

1. **Break Its Tempo** — skillfully evade two distinct committed actions without damaging the creature, then hold a short disengagement window.
2. **Set a Calming Offering** — place one explicitly named compatible offering on safe terrain, step outside the warning ring, and let the creature complete an uninterrupted interaction.

Both routes are optional. A player may ignore them and use the displayed 40% health route on every ordinary aggressive creature. Neither alternative changes the orb, introduces a catch roll, or adds an invisible species checklist.

All three routes converge on one host-authored **capture-ready state**:

- health subdual reports **READY — SUBDUED**;
- outmaneuvering or an accepted offering reports **READY — CALM**;
- health subdual remains ready while the creature remains at or below the threshold;
- non-damage calm readiness lasts for a recommended 10 seconds and shows a visible countdown;
- player or party damage during that window cancels non-damage calm readiness;
- using the normal Capture Orb during the window deterministically captures the creature.

There is no random breakout roll after any route is completed.

#### Optional route A: Break Its Tempo

This route turns readable creature combat into a humane capture skill test. Initial universal tuning:

1. the creature must be actively committed to attacking or pursuing the participating player;
2. the player cleanly evades **two distinct committed actions** without damaging it;
3. after the second clean evade, the player remains outside the attack envelope and does not re-engage for **three continuous seconds**;
4. the creature enters the shared 10-second capture-ready window.

A clean evade is not merely “the creature missed.” The host counts it only when a telegraphed action has a unique action token, commits while tracking the participating player, resolves without hitting that player, and completes its recovery while both remain within the encounter radius. For creatures whose pressure comes from a charge, leap, ranged cast, aerial pass, or aquatic rush, the authored animation differs but the rule does not: **evade two committed actions, do not strike back, then hold distance**.

Transparent feedback is always attached to the target:

```text
OPTIONAL: OUTMANEUVER 1 / 2
EVADE THE NEXT COMMITTED ATTACK · DO NOT STRIKE
```

After the second evade:

```text
TEMPO BROKEN · HOLD DISTANCE 2.4s
```

Anti-spam and anti-cheese constraints:

- only host-issued, previously uncounted action tokens advance progress;
- no more than one evade beat can count within a short universal cooldown;
- an action blocked by broken navigation, unloaded terrain, or another entity does not count;
- player or party damage resets the route;
- leaving the encounter radius cancels it rather than allowing safe progress from across the map;
- partial progress visibly decays after a recommended 12 seconds;
- only the creature's current pressure target can earn the evade.

The route must use existing combat telegraphs and recovery windows rather than adding per-frame global scans. Each involved creature holds only a small bounded encounter record, updated by attack-resolution and damage events.

#### Optional route B: Set a Calming Offering

This route lets preparation, habitat knowledge, and restraint replace combat. It uses ordinary creature-relevant items already represented by the relationship policy; it does not introduce lure or pacification currencies.

The target card reveals at least one valid item immediately:

```text
OPTIONAL: OFFER WARG FEED
SET IT ON SAFE GROUND · STEP OUTSIDE THE RING
```

The player targets the creature and uses the named item to place a visible offering anchor. The host validates that the anchor:

- uses an item listed in the creature's public calming-offering set;
- occupies the creature's valid medium and compatible ground;
- has a reachable approach and no immediate fire, lava, suffocation, or settlement-protection conflict;
- is close enough to the encounter but not inside the player's safety ring.

The item is reserved when the anchor is placed, consumed only when the creature accepts it, and returned if placement is invalid. The creature approaches, performs a clearly animated four-second inspect/feed/rest interaction, and becomes capture-ready if the player stays outside the warning ring and no participating player damages it.

Transparent feedback progresses through:

```text
OFFERING SET · STEP OUTSIDE THE RING
ACCEPTING 2.1s
READY — CALM · 10s
```

Anti-spam and multiplayer-safe constraints:

- at most one active offering anchor exists for a creature and at most one for a participating player;
- the host atomically reserves and consumes the exact item stack;
- failed or interrupted acceptance has a short visible retry cooldown;
- moving the item, crowding the warning ring, or player/party damage interrupts the attempt;
- environmental damage pauses the interaction but does not silently charge the player with sabotage;
- stale, duplicated, or competing placement requests resolve once against the encounter revision;
- no client can declare an offering safe, accepted, or consumed.

Every ordinary aggressive care-bond creature must expose at least one public calming offering through the same validated policy that already supplies preferred food. Relocation-only creatures may expose a thematically suitable ordinary item through that same field. If a species has no valid offering, the UI says **No calming offering known** and the health and outmaneuver routes remain available; it never displays `Unknown`.

#### Flavor without rule fragmentation

Creature identity changes presentation, not the learnable contract. A Redbanner Warg may lower its hackles after an evade and sniff Warg Feed. An Asterjaw may retract its crown and inspect a mineral offering. A flying predator may land after two failed passes. An aquatic hunter may circle a floating offering before accepting it. These may use different animations, sounds, particles, and species-language subtitles, while the parent UI always retains the same verbs:

- **WEAKEN TO [exact health]**;
- **OUTMANEUVER [0–2]**;
- **OFFER [named item]**.

Authored statuses such as stunned, surrendered, rescued, or story-resolved may still enter the same calm/subdued capture-ready window. They remain rare authored bonuses, not a fourth opaque ordinary requirement.

### Aquatic creatures

An aquatic creature requires:

- the creature to occupy valid water;
- the keeper to be swimming or submerged close enough to use the orb;
- a valid aquatic release/habitat position.

This protects release safety and feels physically consistent without a Tide Lens. The HUD says **Enter the water**, not **Missing Tide Lens**.

### Prime forms

Recommended change: Prime field routes become optional mastery routes rather than hard capture gates.

Completing the three authored ecological signs should:

- unlock the complete Prime Bestiary chapter;
- increase Waykeeper research/reputation rewards;
- reveal the form's care and habitat bonuses;
- record the capture method as `prime-field-route`;
- optionally count one Connect session during later bonding.

An unfinished route should not cause a rare specimen to become uncollectible after the player has already met the ordinary calm/subdued rule. If keeping the hard gate is important, the HUD must show all three steps from first sight; it must never present an unknown condition.

### Authored expansion capture sheets

Retain every authored micro-hook, care clue, enclosure clue, and release outcome. Reclassify most of them as:

- a researched humane capture alternative;
- a Bestiary field note;
- a guild objective;
- a care or habitat bonus;
- a distinctive release outcome;
- a Prime mastery route.

Do not delete their writing or flatten creature identity. Stop making the player complete an invisible bespoke checklist merely to store an ordinary creature.

## Capture and relationship policy

Every mob kind should resolve to one validated policy from one registry:

```ts
type ContainmentMode = "orb" | "owner-storage-only" | "authored-resolution" | "none";
type RelationshipMode =
  | "care-bond"
  | "lifecycle-bond"
  | "covenant"
  | "constructed"
  | "relocation-only"
  | "recruitment"
  | "none";

type CreatureRelationshipPolicy = {
  containment: ContainmentMode;
  relationship: RelationshipMode;
  readinessMode: "calm" | "aggressive-routes" | "story";
  preferredFoods: readonly ItemCode[];
  calmingOfferings: readonly ItemCode[];
  pacificationPresentation?: string;
  deployment: "companion-only" | "owner-only" | "wild-release-only" | "never";
  transfer: "keeper-consent" | "free" | "never";
  reason: string;
};
```

During migration, `calmingOfferings` should default to the creature's validated `preferredFoods`; content authors only need to override it when an ordinary non-food care item communicates the creature better. The first entry is public from Observed, so this field cannot become a research-gated checklist.

The engine, Bestiary, Creature Camp, merchant UI, capture HUD, and tests must read this same policy. `tameable`, `tameItems`, family heuristics, and bespoke runtime branches can seed the registry migration, but no longer independently decide player-facing truth.

Validation must fail if:

- a capturable species has no declared post-capture outcome;
- a care-bond species has no preferred food or compatibility adapter;
- an ordinary aggressive care-bond species has no public calming offering;
- a rideable species cannot become owned;
- a faction-aligned species lacks the appropriate ownership rule;
- a Bestiary claim disagrees with runtime policy.

## Relationship lifecycle and canonical state

### Proposed state

Add one canonical relationship record to exact creature metadata:

```ts
type CreatureRelationshipV1 = {
  schemaVersion: 1;
  status:
    | "wild"
    | "contained"
    | "acclimating"
    | "bond-ready"
    | "companion"
    | "covenant"
    | "constructed"
    | "relocation-only";
  mode: RelationshipMode;
  keeperId: string | null;
  originalHostile: boolean;
  capturedHostile: boolean;
  rehabilitation: {
    stabilized: boolean;
    nourished: boolean;
    connectionSessions: number;
    requiredConnectionSessions: number;
    completedAt: number | null;
  };
  formedAt: number | null;
  transferredAt: number | null;
};
```

This record answers “what is this creature to this player?” Creature progression continues answering “how experienced and deeply bonded is it?” Capture history continues answering “who captured or released it, and when?”

Do not infer ownership from captor ID. Do not infer taming from orb attunement. Do not infer a usable companion solely from bond points.

### State transitions

```text
WILD
  -> CONTAINED                    successful capture
  -> COMPANION / COVENANT         only if already validly owned before storage

CONTAINED
  -> ACCLIMATING                  first accepted rehabilitation action
  -> RELOCATION-ONLY              policy has no bond path
  -> WILD                         explicit release

ACCLIMATING
  -> BOND-READY                   stabilize + nourish + connect complete
  -> WILD                         explicit release

BOND-READY
  -> COMPANION                    explicit Form Bond, host validates
  -> WILD                         explicit release

COMPANION
  -> CONTAINED COMPANION          recall/storage; ownership preserved
  -> TRANSFERRED COMPANION        explicit keeper-to-keeper transfer
  -> WILD                         explicit release of ownership with warning
```

State changes must be monotonic within a transaction and recorded in append-only Bestiary/specimen history where appropriate.

### Compatibility adapters

Implementation should introduce one resolver that applies canonical relationship state to a spawned mob. During migration it also materializes the existing state expected by:

- generic/courser bonds;
- Peelop pet state;
- dragon state;
- Shadecrawler state;
- Reedstrider bond;
- leviathan growth;
- apiary bee state;
- generic `creatureTamed`/`creatureOwnerId`;
- faction and alignment behavior.

This adapter prevents a creature from being friendly in one subsystem but wild in another. Existing specialized growth, riding, breeding, and story logic can remain; it receives a consistent owner and relationship input.

Later refactoring may remove duplicate legacy fields, but that cleanup is not required for the first safe release.

### Attunement

Attunement becomes a companion deployment feature, not a taming action.

- Wild, contained, acclimating, bond-ready, and relocation-only specimens cannot be attuned.
- Companions, covenants, and eligible owned constructs can be attuned.
- Deploy/recall preserves exact identity and ownership.
- A fainted creature remains blocked until healed, as today.
- Releasing ownership and recalling to an orb are separate actions with different confirmations.

## Exceptions and alignment rules

### Sentient people

Sentient residents are not captured. They are recruited, hired, persuaded, allied, or opposed through dialogue, faction, and quest systems.

### Faction-aligned creatures

An animal, companion, mount, or construct aligned to a non-player settlement cannot be captured. The HUD identifies the faction or settlement when known.

An authored quest may explicitly make one instance unaligned or transfer it to the player. Capture never silently strips provenance.

### Foreign-owned companions

A companion owned by another player cannot be captured, attuned, renamed, bonded, or released by the current player. Multiplayer transfer requires a typed owner-consent transaction.

### Constructs

- a constructed or purchased player-owned golem may be stored and deployed in a normal orb;
- a newly forged golem arrives in a normal filled orb with `constructed` relationship state;
- an unaligned construct explicitly authored as bondable may use a repair/attunement path;
- faction and hostile wild constructs are not ordinary animal captures.

Named construct-orb item IDs are removed from player-facing inventory.

### Dragons and leviathans

Retain lifecycle rules:

- eggs and hatchlings establish the ordinary bond path;
- an already bonded dragon can be stored in a normal orb where its authored rules allow;
- a wild adult dragon does not become a rideable pet merely because it was subdued;
- authored adult covenants or legendary capture resolutions set the appropriate relationship state;
- growth, saddle, stage, and husbandry requirements remain separate from capture.

The Bestiary must say both **Capturable outcome** and **Companion path**.

### Legendary creatures

Legendary encounter resolution remains an explicit story lock. The same ordinary orb is used if capture is the chosen resolution. No legendary orb variant is introduced.

Other outcomes—covenant, release, defeat, world residency—remain valid. The encounter UI presents those outcomes before the final action.

### Temporary and grounded summons

Temporary manifestations and echoes remain uncapturable. A valid Worldpin grounding creates one persistent world identity. That grounded identity then follows its authored relationship policy; grounding alone does not silently tame it.

### Relocation-only creatures

A creature may be capturable but not a combat companion when there is a clear reason, such as an unsuitable anatomy, ecological role, mindless behavior, or dangerous containment rule.

Before capture, the target card and Bestiary say **Relocation only**. After capture, Creature Camp hides tactics, gear, and Form Bond, while showing valid habitat, study, release, or sanctuary actions.

This category must not become a dumping ground for unfinished mobs. Every `tameable: true` creature must have a complete relationship adapter or fail validation.

## Simplified research

### Research is information and mastery, not permission

Replace the current capture-reveal ladder with three understandable Bestiary states:

1. **Observed**
   - capture eligibility;
   - ordinary calm/subdue rule;
   - the exact standard health threshold, Outmaneuver rule, and at least one named calming offering for an ordinary aggressive creature;
   - companion outcome category;
   - habitat and broad temperament.
2. **Studied**
   - exact preferred foods;
   - additional valid calming offerings and useful habitat context;
   - authored humane alternatives and presentation clues;
   - care and enclosure clues;
   - known moves/types already supported by Kinmark and combat observation.
3. **Mastered**
   - full ecology and release outcome;
   - Prime/rare-form chapters;
   - advanced habitat/work interactions;
   - guild notes and append-only species chapters.

Capture, taming, breeding, legendary milestones, guild fieldwork, Kinmark, and Creature Camp can all contribute meaningful records. The extensible `research`, `forms`, `sections`, `specimenIds`, `summonOrigins`, and `guildLinks` structures should remain.

### Reduce observation friction

Recommended tuning:

- first sight immediately unlocks Observed;
- one completed Kinmark or one useful Camp observation unlocks Studied;
- Mastered is a collection of meaningful species milestones, not “complete any two opaque research nodes”;
- Camp behavior observation records once per specimen/day but needs only one completion for Studied;
- a first capture never makes the capture method retroactively discoverable—it records the method and moves directly to Studied;
- detailed research may improve reputation or bonding efficiency, but never changes an impossible capture to possible through hidden state.

### Preserve authored content

Move the existing species micro-hooks and care clues into stable Bestiary sections with explicit unlock sources. Keep append-only chapters for complex creatures such as dragons and legendaries.

The proposed simplification removes mechanical opacity, not lore depth.

## Economy and balance

### Orb supply

Keep the current four-orb crafting output for the first release. A universal orb is more useful, but it is also occupied while holding an exact specimen. Changing both usability and price in the same patch would obscure balance feedback.

After telemetry and playtesting, tune:

- orb crafting rate;
- common loot frequency;
- Waykeeper merchant stock;
- filled-orb storage pressure;
- release/reuse frequency.

Do not introduce tiered orb strength, elemental orbs, species orbs, capture ammunition, or random catch consumables.

### Lens migration compensation

Old lens-orb stock represents invested materials. Migration should:

- convert every empty lens orb to one normal empty Capture Orb;
- preserve any filled specimen exactly;
- remove the fitted lens from the canonical saved record;
- return a bounded portion of the distinctive lens ingredients;
- place overflow in a safe migration claim or recovery container;
- record a one-time migration receipt so reloading cannot duplicate refunds.

The exact refund table can be approved during implementation. At minimum it should return the rare identity ingredients rather than every common glass component.

### Merchant and forge stock

Creature offers remain valuable, but their item is always a metadata-bearing normal Capture Orb. Stock pricing is based on the offer/specimen record, not `Item.CaptureOrb`.

Forged golems remain expensive because of their blueprint and materials, not because they use a special orb item.

### Rehabilitation costs

Bonding consumes ordinary creature-relevant care:

- healing or rest;
- one preferred food;
- one to three bounded connection sessions.

It should not require a new capture currency, special bond orb, alignment token, or universal magic dust.

Aggressive creatures require more care sessions than gentle creatures, but the process remains deterministic and visible.

Optional non-damage readiness should be economically modest:

- Break Its Tempo costs no item but requires skill and exposure to danger;
- Set a Calming Offering consumes one ordinary named care item but is safer and more deliberate;
- health subdual remains the fastest, predominant, universally reliable route and carries the normal healing cost during later Stabilize.

Research can reveal additional or cheaper valid offerings. It must not be required to learn the first usable offering.

### Research rewards

Waykeeper and related guilds can reward:

- gold or ordinary materials;
- habitat and care blueprints;
- Bestiary chapters;
- reputation;
- optional humane-capture shortcuts;
- sanctuary capacity.

They should not gate basic orb function behind a lens reward.

## UI and feedback

### Target card

Replace profile names such as `Pursuit`, `Armored`, or `Resonant` with a shared capture strip:

```text
CAPTURE ORB
READY · CALM
Can become companion
```

or:

```text
CAPTURE ORB
WEAKEN TO 8 / 24 HEALTH
OPTIONAL · OUTMANEUVER 0 / 2
OPTIONAL · OFFER WARG FEED
Relocation only
```

Use one status color for ready, one for actionable waiting, and one for locked/illegal. Never require color alone.

When a non-damage route is active, replace only its optional row with a progress row. Do not hide or visually demote the standard health route. A short ring or bar attached to the creature shows evade beats, offering acceptance, and the final capture-ready countdown without requiring the player to keep a menu open.

### Orb tooltip

An empty orb says:

> Capture Orb · Empty · Captures any eligible creature

A filled orb says:

> Capture Orb · Redbanner Warg
> Relationship: Acclimating
> Stabilized ✓ · Nourished ✓ · Connection 1/3
> Not deployable as a companion

An owned orb says:

> Capture Orb · Bramble
> Companion · Familiar bond · Ready to deploy

### Creature Camp

Split the current screen into relationship-aware modes:

- **Wild/Acclimating:** show Stabilize, Nourish, Connect, research, habitat, and release. Hide or disable tactics, active moves, work, saddle, and attunement.
- **Bond-ready:** show the explicit Form Bond action and what it changes.
- **Companion:** show the current care, tactics, moves, equipment, work, comparison, and research tools.
- **Relocation-only:** show care, habitat assignment, research, release, and its reason.
- **Covenant/Construct/Lifecycle:** show the authored acquisition or growth contract.

The UI should not call an untamed stored creature a companion.

### Bestiary

Retain the caught indicator and add a compact relationship row:

- Seen
- Captured
- Bonded

Every discovered entry states:

- Can it be captured?
- What ordinary condition is required?
- Can it become a companion?
- If not, what can it be used for?
- What research is still unknown?

Research tabs preserve detailed ecology, variants, specimen IDs, history, guild links, and append-only chapters.

### Release safety

Releasing an untamed aggressive creature requires a confirmation:

> This creature is still hostile and may attack nearby players or wildlife. Release it here?

The host revalidates terrain, water, settlement protection, and player range. A release is not a deployment, and it clears custody without assigning ownership.

### Controls

Recommended interaction contract:

- empty orb + use on ready creature: capture;
- companion orb + use: deploy or recall;
- wild/relocation orb + use: open specimen actions rather than silently release;
- explicit Release to Wild button/command: release with confirmation;
- explicit Form Bond: convert when ready;
- attunement is visible in Companion controls, not hidden behind crouch-use.

Keyboard/controller shortcuts may remain, but every action must be discoverable in the tooltip or Creature Camp.

## Save migration and backward compatibility

### Migration goals

No existing specimen may lose:

- stable entity/specimen identity;
- name;
- health and age;
- baby/adult state;
- genetics and phenotype;
- rarity/shiny/Prime form;
- level, experience, moves, tactic, and bond points;
- equipment;
- care, husbandry, work, and habitat state;
- capture/release history;
- current owner or valid taming state;
- faction/settlement provenance;
- legendary, summon, or Prime custody;
- orb identity and attuned deployment link.

### Orb schema

Introduce a new encoded orb schema only if needed. The decoder must continue accepting:

- legacy cages;
- legacy orb ID 178;
- version-one orb JSON;
- `capturedCreature` payloads;
- lens-orb item IDs;
- species-orb item IDs;
- current attunement data.

New encoding should use `Item.CaptureOrb` and exact metadata. A legacy `lens` field is ignored after refund/migration. Unknown valid custom creature data remains round-tripped.

### Relationship derivation

For each existing creature, derive canonical relationship in this priority order:

1. valid owned/tamed specialized state -> `companion`;
2. valid legendary covenant -> `covenant`;
3. valid player-built/owned construct -> `constructed`;
4. untamed filled orb with bond/care progress -> `acclimating`;
5. untamed filled orb without progress -> `contained`;
6. policy without a bond path -> `relocation-only`;
7. deployed wild creature -> `wild`.

Existing tamed creatures remain tamed. Existing untamed captures do not become friendly for free. Their prior camp bond points and care actions should count toward the visible rehabilitation path where safely inferable.

### Specialized item IDs

Keep removed numeric IDs as decode-only compatibility aliases for at least one full save version. Normalize them at inventory, chest, merchant, station, archive, drop, and multiplayer import boundaries.

Do not leave deprecated items obtainable in creative mode, recipes, loot, guild rewards, or commerce.

### Active deployments

For an orb with an active entity:

- preserve the active link and owner if it was a valid companion before migration;
- recall invalid or ambiguous deployments safely into the orb during load;
- never leave both a world entity and a filled-orb duplicate;
- never convert a wild attuned creature into a companion merely because an old orb had attunement metadata.

### Migration observability

Write a bounded migration result to diagnostics and show one player-facing summary:

> Capture system updated: 7 orbs normalized, 2 lens kits refunded, and all 4 stored creatures preserved.

Do not spam one toast per slot.

## Multiplayer and host authority

### Authority model

The host remains the only authority for:

- capture readiness;
- target disposition and health;
- committed-action tokens, clean-evade progress, offering anchors, and capture-ready expiry;
- inventory splitting;
- relationship policy;
- rehabilitation progress;
- item consumption;
- Form Bond;
- ownership transfer;
- deployment/recall;
- release;
- Bestiary and guild records;
- world entity creation/removal.

Clients render previews and submit typed intent. They do not decide that a creature became friendly.

The host keeps one bounded pacification record per actively participating creature:

```ts
type PacificationEncounter = {
  revision: number;
  participantId: string;
  route: "outmaneuver" | "calming-offering" | null;
  cleanEvades: 0 | 1 | 2;
  lastCountedActionId: string | null;
  offeringAnchorId: string | null;
  progressUntilMs: number | null;
  settledUntilMs: number | null;
};
```

Only one optional route can advance on a creature at a time. The player who completes it receives a short, visible capture-priority reservation for the resulting calm window; after that reservation expires, normal world/party policy applies. The health-subdual fallback remains available to all eligible players and does not wait on an abandoned optional route.

### Typed actions

Extend the existing creature-action protocol with explicit intents such as:

```text
capture
begin-outmaneuver
place-calming-offering
cancel-pacification
begin-rehabilitation
care
form-bond
attune
deploy
recall
release-wild
transfer-offer
transfer-accept
habitat-insert
habitat-remove
```

Each mutation includes:

- stable request ID;
- actor ID;
- expected player inventory revision;
- orb ID and specimen ID where applicable;
- target or station reference;
- action-specific inputs.

The host returns one accepted/rejected terminal result with authoritative player, orb, relationship, and affected world state.

### Validation

The host revalidates:

- actor session and permissions;
- expected inventory revision;
- exact orb/specimen ownership;
- active deployment uniqueness;
- range and line of sight for world actions;
- creature policy;
- health/status/medium readiness;
- food and care costs;
- rehabilitation milestones;
- faction and foreign ownership;
- release safety;
- pack capacity;
- request idempotency.

Care and rehabilitation use the host's world day/time. A client clock cannot accelerate bonding.

### Concurrency

Two players attempting to capture the same creature, care for the same orb, form a bond, or accept a transfer must resolve through a single host transaction. The loser receives a specific stale/conflict result and a fresh authoritative state.

Repeated requests after reconnect return the previous terminal result; they do not consume food twice, increment a tame twice, or duplicate an orb.

### Privacy and party rules

Capturing a wild creature does not grant other players access to its Camp actions. Orb possession and host-validated custody govern who may care for it. Companion ownership governs commands and deployment.

Party-friendly behavior may be added separately. It must not weaken keeper ownership or permit silent transfer.

## Testing strategy

### Pure policy tests

- Every mob kind resolves exactly one relationship policy.
- Every capturable mob reports one clear post-capture outcome.
- Every `tameable: true` mob has a working relationship adapter.
- Every rideable mob has an obtainable ownership path.
- Sentient, faction-aligned, temporary-summon, legendary, construct, dragon, and relocation exceptions match their declared rules.
- No ordinary capture result contains an unknown condition.
- Passive, neutral, hostile, tiny-health, aquatic, Prime, and story-locked matrices are deterministic.
- Every ordinary aggressive has the same visible 40% health fallback and the same two optional route contracts.
- A species presentation profile may change animation, sound, particles, and copy but cannot change evade count, hidden steps, acceptance semantics, or readiness duration.
- Outmaneuver counts only distinct valid committed-action tokens, resets on participating-player damage, decays visibly, and cannot advance from navigation failure.
- Calming offerings are public policy data, validate medium/terrain/reachability, reserve and consume exactly one item, and never become an unknown condition.

### Orb and inventory tests

- Only the normal Capture Orb is obtainable.
- Empty orbs stack; filled orbs never stack or merge metadata.
- Splitting from a stack creates one unique orb identity.
- Capture/release preserves the exact specimen.
- Lens and species item IDs normalize safely in inventory, cursor, chest, equipment, crafting grid, furnace, drop, rack, healer, archive, aquarium, apiary, morph loom, and merchant stock.
- Overflow/refund migration cannot duplicate on reload.
- Removed recipes, creative entries, loot, guild rewards, and item-guide pages are absent.

### Relationship tests

- Capture never sets owner or tame state for a wild specimen.
- Wild aggressive specimens cannot be attuned or deployed as companions.
- Stabilize, Nourish, and Connect progress deterministically.
- Form Bond is the only ordinary conversion transaction.
- Form Bond initializes generic and species-specific compatibility state.
- Commands, AI friendliness, combat targeting, work, breeding, equipment, and mounting agree on ownership.
- Long-term bond tiers continue after conversion and do not regress.
- Release clears custody correctly without corrupting specimen history.
- Foreign ownership and explicit transfer are enforced.

### Small-creature and facility tests

- butterflies, Lightning Bugs, workers, queens, fish, and sea slugs use normal orb capture;
- optional jars/exhibits/apiaries accept and return the exact specimen;
- Lightning Bug jar light remains functional;
- apiary production and Queen Cell husbandry remain functional;
- breaking a facility returns the exact orb/specimen or safe overflow;
- no parallel jar/capsule capture path increments Bestiary counts twice.

### Research and UI tests

- first sight reveals eligibility and the broad capture rule;
- no target or Bestiary panel displays `Unknown condition`;
- Kinmark/Camp observation advances Studied without gating basic capture;
- authored sheets remain present and unique;
- Prime routes and legendary chapters retain their authored text;
- Bestiary Seen/Captured/Bonded states are correct;
- Creature Camp hides companion controls until Form Bond;
- tooltips and release confirmations communicate disposition and outcome;
- keyboard, mouse, controller, and narrow-screen layouts expose the same actions.

### Persistence tests

- load current saves, legacy cage saves, lens-orb saves, species-orb saves, active attuned companions, untamed attuned captures, archives, stations, habitats, drops, and merchant inventories;
- save/reload before and after every relationship transition;
- preserve stable IDs and all progression/custom fields;
- no world entity/orb duplication during active-deployment migration;
- migration is idempotent.

### Multiplayer tests

- host and guest use the same readiness outcome;
- the host alone accepts clean evades, offering placement/consumption, route resets, and capture-ready expiry;
- concurrent optional-route attempts resolve to one participant/revision and return a specific conflict state;
- the non-damage route contributor receives only the declared short capture-priority window, not ownership or a silent bond;
- capture, rehabilitation, bond, transfer, deploy, recall, and release are host-authoritative;
- stale revisions, spoofed owner IDs, missing food, wrong orb, out-of-range actions, and foreign companions fail closed;
- simultaneous capture and simultaneous Form Bond resolve once;
- reconnect replays terminal results without duplicate costs or state;
- Bestiary, inventory, mob snapshots, and relationship UI converge after accepted actions;
- older protocol peers receive a clear version failure rather than partial compatibility.

### Regression and performance tests

- current orb rack, Healing Station, archive, aquarium, apiary, commerce, golem forge, morphing, Prime custody, and legendary tests remain green after intentional assertion updates;
- no new per-frame scan across all stored creatures;
- optional pacification state is bounded to active encounters and event-driven by committed actions, damage, item use, and short local timers;
- relationship policy is static or memoized by species;
- rehabilitation advances only on explicit host actions;
- Creature Camp continues to create no additional simulation bubble;
- HUD readiness evaluation remains bounded to the aimed creature;
- full test suite, production build, and a save-migration fixture matrix pass.

## Telemetry

Add bounded counters for:

- capture attempts, successes, and primary blocker;
- aggressive captures by readiness route: health subdual, outmaneuver, calming offering, or authored resolution;
- optional-route resets by bounded reason;
- captures by temperament/family;
- time from first sight to first capture;
- time and actions from capture to Form Bond;
- abandonment at Stabilize, Nourish, or Connect;
- relocation-only captures and releases;
- attempted invalid attunements/deployments;
- migration counts by legacy orb type;
- multiplayer conflicts and rejections.

Do not log specimen names, player chat, free-form notes, or unbounded metadata.

The key evaluation question is not merely “did captures increase?” It is:

> Can a new player predict the next action, and does every eligible captured creature reach the promised usable state without consulting source code?

## Rollout order and commit boundaries

### Phase 0 — Freeze the contract

- Add the central relationship-policy type and validation plan.
- Build a generated audit of every mob's current capture, tame, ownership, mount, habitat, and exception paths.
- Add migration fixtures for every existing orb/custody representation.
- Record baseline capture and Camp flows.

**Gate:** every species is classified; no game behavior changes.

### Phase 1 — Canonical relationship state

- Add canonical relationship metadata and migration derivation.
- Add compatibility adapters for all existing specialized tame states.
- Make friendliness, ownership, commandability, and mounting read through one resolver.
- Keep current capture rules temporarily.

**Gate:** all existing bonded creatures behave identically after migration; no untamed creature becomes owned.

### Phase 2 — One item, one custody record

- Remove lens/species orb obtainability.
- Convert commerce and forge templates to metadata-bearing normal orbs.
- Normalize legacy item IDs and refund lens investments.
- Move butterfly, Lightning Bug, and bee custody to normal orbs.
- Retain optional facility/display conversions.

**Gate:** one player-facing capture item; exact specimen and facility round trips pass.

### Phase 3 — Universal readiness and feedback

- Replace nine ordinary profiles and seventeen player-facing conditions with the universal readiness resolver.
- Keep the exact visible 40% health fallback as the predominant aggressive route.
- Add Break Its Tempo and Set a Calming Offering as optional, host-authoritative routes into the same capture-ready state.
- Validate that every eligible ordinary aggressive exposes at least one public calming offering and compatible presentation.
- Preserve legendary, faction, ownership, summon, construct, lifecycle, and medium locks.
- Convert authored sheets and Prime routes to research/mastery or humane alternatives.
- Replace unknown HUD states with primary actionable blockers.

**Gate:** every ordinary species has a predictable deterministic capture path visible on first observation.

### Phase 4 — Rehabilitation and Form Bond

- Add Stabilize, Nourish, Connect, and explicit Form Bond.
- Gate attunement/deployment and companion controls by canonical relationship.
- Initialize every eligible species adapter on bond.
- Add transfer and hostile-release safety.

**Gate:** every eligible neutral/aggressive captured creature can become friendly and usable; ineligible outcomes are explained before capture.

### Phase 5 — Bestiary, guilds, economy, and content

- Simplify Observed/Studied/Mastered research.
- Update Bestiary Seen/Captured/Bonded UI.
- Preserve and reroute authored capture/care writing.
- Replace lens guild objectives and rewards.
- Update recipes, item guide, loot, merchants, quests, tutorials, and accessibility copy.

**Gate:** no live content asks for a retired orb/lens/net capture path; research remains rewarding without gating basic collection.

### Phase 6 — Multiplayer, migration, and release audit

- Extend host-authoritative creature actions.
- Run concurrency, reconnect, migration, facility, and rollback matrices.
- Add bounded telemetry and diagnostics.
- Run visual, input, responsive, performance, save, and full regression passes.

**Gate:** zero lost/duplicated specimens, zero duplicate costs, zero client-authoritative bonds, and all acceptance criteria pass.

## Open decisions

Recommended defaults are shown first.

1. **Does one-orb custody include insects and bees?**
   Recommended: yes. Jars and apiary objects remain optional downstream habitats, not capture devices.

2. **What are the universal aggressive capture routes?**
   Recommended: keep 40% of maximum health, rounded up and displayed exactly, as the predominant reliable route with a one-heart fallback for tiny creatures. Add two optional alternatives: evade two committed actions and disengage briefly, or place the explicitly named calming offering and let the creature accept it undisturbed. All three create the same visible capture-ready state; the non-damage routes use a 10-second window, while health subdual remains ready for as long as the threshold is satisfied.

3. **Do Prime routes hard-gate capture?**
   Recommended: no. They gate mastery rewards and authored ecological benefits, not collection.

4. **Can relocation-only aggressive creatures be captured?**
   Recommended: yes, when their research, habitat, relocation, or release outcome is meaningful and declared before capture. They cannot be attuned as companions.

5. **Does a physical enclosure gate rehabilitation?**
   Recommended: no. Creature Camp is the safe abstract rehabilitation context. A compatible sanctuary habitat can accelerate one connection session.

6. **How many connection sessions are required?**
   Recommended: 1 Gentle, 2 Skittish, 2 Defensive, 3 Hostile. Tune from telemetry without creating species-specific hidden counts.

7. **What happens to the Butterfly Net?**
   Recommended: repurpose it as an optional insect survey/research tool or retire it with a material refund. Do not retain it as a custody tool.

8. **Can companions be traded?**
   Recommended: only through explicit keeper-offer and recipient-accept transactions at Creature Camp. Ordinary item selling must reject filled orbs.

9. **Should the base orb recipe change?**
   Recommended: keep its current four-orb output for the first release and balance after observing universal-orb use.

10. **Should wild captured creatures be field-deployable before bonding?**
    Recommended: no. They may be released to the wild or assigned to a compatible habitat, but attuned deployment is a companion privilege.

## Acceptance criteria

The update is complete only when:

1. A normal Capture Orb is the only player-facing item required to capture any capturable creature.
2. No lens orb or species orb is obtainable through crafting, creative inventory, loot, merchants, guilds, quests, or tutorials.
3. Butterflies, Lightning Bugs, bees, fish, sea slugs, ordinary fauna, and eligible monsters enter the same exact-specimen custody system.
4. Every aimed discovered creature gives an immediate, understandable capture state with no unknown condition.
5. Ordinary passive/neutral capture uses Calm; every ordinary aggressive prominently supports the same visible health threshold and may alternatively be outmaneuvered or accept one publicly named calming offering; aquatic capture needs water but no special orb.
6. Capture remains deterministic and has no hidden probability.
7. Capturing a wild neutral or aggressive creature never silently makes it friendly, owned, commandable, mountable, or deployable.
8. Every eligible captured creature has a visible Stabilize -> Nourish -> Connect -> Form Bond path.
9. Form Bond is explicit, host-authoritative, deterministic, and initializes all state needed for friendliness, following, combat, work, gear, breeding, and riding.
10. Every ineligible creature explains whether it is relocation-only, story-locked, faction-aligned, foreign-owned, temporary, recruited, constructed, lifecycle-bound, or uncapturable.
11. Research remains rich and extensible but never hides basic eligibility or blocks ordinary capture through an unrevealed condition.
12. All existing authored creature micro-hooks, care clues, enclosure clues, release outcomes, legendary resolutions, and append-only Bestiary sections remain accessible in an appropriate role.
13. Existing valid tamed creatures remain tamed; existing untamed captures remain untamed but receive the correct visible path.
14. Every legacy cage, orb, lens orb, species orb, jar/capsule custody record, station, archive, facility, and active deployment migrates without losing or duplicating a specimen.
15. Filled orbs remain exact singletons and empty orbs remain safely stackable.
16. Multiplayer capture, rehabilitation, bonding, transfer, deployment, recall, release, inventory cost, and Bestiary progress are host-authoritative and idempotent.
17. No `tameable: true` or rideable species lacks a validated conversion/ownership adapter.
18. No new background creature simulation, per-frame inventory scan, or unbounded telemetry is introduced.
19. Focused tests, migration fixtures, multiplayer concurrency/reconnect tests, the full suite, and production build pass.
20. A short blind usability test can answer, for an unfamiliar creature: “Can I capture it?”, “What do I do next?”, “Can it become my companion?”, and “Why not?” using only the game UI.

## Recommended approval decision

Approve the broad one-orb design, including small creatures, and approve the explicit separation between **capture custody** and **companion bond**.

The most important implementation choice is not the exact 40% threshold or the flavor of an evade animation. It is establishing one canonical relationship policy and state before replacing UI and recipes. Without that foundation, removing lens items would make capture easier to understand while leaving the deeper “captured but unusable” bug intact. The health route should remain predominant; the two optional non-damage routes add expression and creature character without becoming new gates.

The recommended final shape is:

- one ordinary Capture Orb;
- one deterministic readiness resolver with a predominant health-subdual route and two visible optional alternatives;
- one visible post-capture lifecycle;
- one explicit Form Bond transaction;
- one canonical ownership answer;
- research that adds depth rather than permission friction;
- authored exceptions that are rare, visible, and genuinely meaningful.

## v1.11.0 implementation record

Blockwild v1.11.0 **Kinship Accord** implements this contract as one coherent system:

- The normal Capture Orb is the only obtainable capture device. Retired lens, species-orb, cage, bee-capsule, and net custody records normalize into the canonical exact-specimen orb path; lens shells refund two normal orbs once.
- Ordinary readiness is deterministic and public. Passive creatures use Calm, aquatic creatures require a shared liquid medium, and aggressive creatures prominently retain the reliable 40%-health/one-heart route. Break Its Tempo and Calming Offering are optional ten-second alternatives with visible progress and bounded anti-spam state.
- Capture records custody without silently changing disposition, ownership, commandability, mounting, combat allegiance, or attunement.
- The Creature Camp presents Stabilize, Nourish, Connect, and explicit Form Bond as one visible lifecycle. Canonical relationship metadata and compatibility adapters keep pet, courser, shade, apiary, work, gear, breeding, combat, and mount systems on the same ownership answer.
- Explicit keeper transfer is a two-party Camp transaction: the current keeper offers an exact stored companion, the named connected recipient accepts within one minute, the host revalidates both inventories and the bond, and the complete orb/history moves atomically.
- Bestiary research is Observed, Studied, and Mastered depth rather than hidden capture permission. The aimed-creature HUD always gives an actionable rule or a named authored exception.
- Multiplayer capture, optional pacification, rehabilitation, Form Bond, transfer, deployment, recall, release, costs, and progression remain host-authoritative. Typed requests, terminal responses, inventory revisions, range/line-of-sight checks, and response replay preserve fail-closed behavior.
- Capture diagnostics use fixed counters only: attempts, successes, route, primary blocker, rehabilitation transitions, legacy migration class, and transfer. They add no creature simulation, player text, specimen names, or unbounded event stream.
- The release gate passes the standard pretest matrices, focused capture/migration/multiplayer tests, native TypeScript, zero-warning ESLint, rendered-page and authored-audio checks, 823 gameplay/content tests, whitespace validation, model-sheet inspection, and all five verified production-build stages.
