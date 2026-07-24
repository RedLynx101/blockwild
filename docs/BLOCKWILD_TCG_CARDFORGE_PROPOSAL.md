# Blockwild TCG — Cardforge Full-System Proposal

**Status:** Planning proposal only

**Primary design input:** `C:\Users\NoahH\Downloads\BWTCG.txt` (read in place; not modified)

**Target:** A complete Blockwild trading-card-game system, not a limited vertical slice

**Implementation in this task:** None

## 1. Executive recommendation

Build Blockwild TCG as a distinct, data-driven subsystem with four firm boundaries:

1. **The card catalog is static content.** Card rules, printings, sets, rarity, source links, and deterministic layout data live in versioned TypeScript data modules. Saves store IDs and counts, never copies of full definitions.
2. **The host owns every mutation.** Pack opening, card grants, store trades, player transfers, deck validation, and match actions use the same request-ID, expected-revision, accepted/rejected pattern already used by Blockwild multiplayer.
3. **Collection custody is not ordinary item metadata.** Sealed packs and withdrawn physical cards can appear in inventory, but a dedicated TCG ledger remains the authority for counts and locations. This prevents the same card from existing in inventory, digital storage, and a trade at once.
4. **Card rendering is deterministic and text-safe.** Every card can ship using the repository's existing mob portrait assets. Optional future ImageGen art is an offline, reviewed asset-production step; it is never required at runtime and never renders card text.

The proposed launch rules use 30-card decks, five-card opening hands, an automatically growing energy resource, a three-unit board, and 20 Resolve. Matches should take roughly 8–12 minutes after tuning. Card rarity and visual variants affect collectibility and economic value, not raw competitive power.

The full system should include two TCG guilds:

- **The Cardwrights' Collegium** handles collecting, authentication, print history, the Card Dex, and archive upgrades.
- **The Waytable Circuit** handles tutorials, town challengers, deck trials, rankings, and match rewards.

This two-guild recommendation is intentionally a product decision, not a discovered repository fact. One guild with two quest branches would cost less content work.

## 2. What the repository already provides

The recommendations below are based on the current worktree, not on an assumed rewrite.

| Existing system | Observed repository contract | Consequence for the TCG |
|---|---|---|
| Main game shell | `app/game/engine.ts` owns gameplay state, inventory, mobs, persistence, world interactions, and multiplayer integration; `app/game/VoxelGame.tsx` owns the large HUD/overlay composition. | Put pure TCG rules in `app/game/tcg/`; let the engine orchestrate them instead of embedding card rules in the engine component. |
| Save format | `WorldSave` is version 2 with additive optional subsystem fields (`app/game/engine.ts:1397`). Loading uses `migrateSavedWorld`, subsystem normalizers, and a multiple-world `WorldStorage` path (`app/game/engine.ts:2640`, `app/game/world-storage.ts`). | Add optional normalized TCG fields without incrementing the world generator version. Do not serialize the catalog. |
| Inventory | Item IDs are numeric and append-only; `InventorySlot.metadata` can hold per-stack data (`app/game/data.ts`). Player inventory is 36 slots and multiplayer validation bounds it (`app/game/multiplayer.ts`). | Add stable item IDs only for physical shells such as a booster, card case, and loose-card token. Do not model an unlimited collection as ordinary slots. |
| Digital storage | `app/game/digital-storage.ts` already has bounded, normalized item and creature stores. Item stacks merge by exact metadata; creature orbs are uniquely identified and deduplicated. | Reuse its defensive-normalization and atomic deposit/withdraw patterns, but create a card-specific archive. Arbitrary card metadata in the generic item vault would fragment stacks and inflate saves. |
| Creature catalog | `MOB_ORDER` and `MOB_DEFS` in `app/game/mobs.ts` provide stable mob IDs, names, temperament, health, habitat, lore, colors, drops, sentience, faction, and role. | Use mob IDs as source references for Creature cards, but author card stats separately. Runtime health/damage is not card balance. |
| Creature typing | `app/game/creature-types.ts` has an append-only registry of 21 types, glyphs/colors, and a combat-facing relationship chart. `app/game/creature-profiles.ts` and `creature-moves.ts` provide authored ecology, stats, and move identity. | Reuse type IDs, names, glyphs, and thematic move links. Use a TCG-specific bounded advantage rule instead of importing real-time combat multipliers directly. |
| Capture | Capture Orbs use stable `orbId` and `CreatureMetadata.entityId`; sentient/faction-aligned creatures cannot be captured. Capture/release is host-authoritative. Prime/legendary custody already rejects stale or copied ownership state (`app/game/capture-orbs.ts`, `creature-cage.ts`, `creature-rarity.ts`, `legendary-encounters.ts`). | Capture grants must key off stable specimen/species claims. Humanoid/sentient cards must come from shops, packs, guilds, or wins, as requested in the brief. Reuse custody and claim-ID patterns. |
| Loot and dungeons | Mob death and drops are host-owned in `engine.ts`. Attuned creatures faint without loot; unresolved legendary encounters retreat without loot. `app/game/contextual-loot.ts` uses seeded container rolls, acquisition IDs, ownership, and distinct dungeon-staging/specialist/vault families. | Insert packs into authored loot families and resolved boss grants. Never put rewards on captured companions or unresolved legendary retreats. |
| Economy | `app/game/economy.ts` uses string-serialized gold, wallet and merchant revisions, deterministic restocking, custom catalogs, and atomic buy/sell results. The current merchant panel exposes Buy/Sell tabs (`app/game/HearthroadsPanels.tsx:1655`). Guest trades are revalidated and committed by the host. | Extend the market with a Goods/Cards selector, TCG stock records, and atomic card custody transactions. Preserve existing pricing/alignment modifiers where appropriate. |
| Settlements | Settlements have stable residents, faction/profession roles, merchants, chairs/tables, and daily schedules including sitting/socializing/trading (`app/game/settlements.ts:1360`). | Town card tables and resident challengers fit existing generated settlements. Challenge availability can be derived deterministically from resident role and schedule. |
| Guilds | `app/game/guilds.ts` has seven compile-time guild IDs, authored campaigns, ranks, NPCs, halls, and a normalized shared guild book. | Adding guilds is a content-wide change, not a label: it requires definitions, quests, NPCs, hall placement, UI, save normalization, and tests. |
| Bestiary UI | The Bestiary already supports search, discovered/captured filtering, facets, sorting, list/detail views, and an unlimited progress model. | Reuse its interaction patterns for the Card Dex, but keep TCG state independent from the creature Bestiary. |
| Multiplayer | The protocol has typed payloads, bounded validators, `requestId`, `expectedRevision`, accepted/rejected status, targeted host-owned player state, and chunked progression (`app/game/multiplayer.ts:380`, `:394`, `:421`, `:562`). The UI explicitly says the host browser owns the world save (`app/game/VoxelGame.tsx:5280`). | Add dedicated TCG action/state messages. Never tunnel matches or card trades through `CreatureAction`. Concealed hands require player-targeted views. |
| Art pipeline | `app/game/mob-models.ts` is the canonical production model source. `scripts/render-models.ts` deterministically produces creature SVG portraits and manifests; `public/creatures/` already contains broad portrait coverage. Tests compare production portrait output. | Ship with existing deterministic portraits as illustration fallbacks. Future generated art should be content-addressed, reviewed, and optional. |

### Explicit assumptions

These are proposed defaults because the repository and `BWTCG.txt` do not settle them:

- **A1 — Scope:** TCG ownership is scoped to one world/host save, like current guest progression. Cards do not automatically travel between unrelated worlds.
- **A2 — Match shape:** The initial constructed format is 30 cards, 20 Resolve, and a three-Being board.
- **A3 — Economy:** Initial rarity values, pack prices, and drop rates below are tuning seeds, not claims based on telemetry.
- **A4 — Content:** Launch size is coverage-driven rather than capped in advance. The full registry audit determines the definition count; every eligible live mob still needs a card or an explicit exclusion.
- **A5 — Guilds:** Two full guilds ship with the system.
- **A6 — Trust:** Multiplayer protection targets accidental duplication, stale actions, replay, and ordinary client tampering. A local host can edit its own save or client and cannot be made a trusted tournament server.
- **A7 — Art:** No ImageGen illustration is required to ship functional cards.

## 3. Design goals

### 3.1 Goals

- Turn existing exploration, capture, dungeons, bosses, towns, factions, guilds, and commerce into mutually reinforcing card sources.
- Make duplicate cards useful and legible without imposing a collection cap.
- Let a new player play a teaching match before buying packs.
- Keep collection rarity exciting without making higher rarity a direct power tier.
- Make pack contents, store stock, boss grants, and matches reproducible and authority-safe.
- Give every town a social use beyond ordinary shopping.
- Make the card catalog extensible enough for themed sets and art variants without rewriting match rules.
- Work entirely offline in single player and over the existing host-authoritative peer session.
- Preserve old worlds: an existing save should open with an empty TCG state and no loss of unrelated data.

### 3.2 Non-goals for the first complete build

- No real-money purchases, cash value, blockchain, external marketplace, or account-level economy.
- No runtime generative-art calls.
- No cross-host global inventory or ranked anti-cheat service.
- No player-created card rules, custom images, or arbitrary text entering multiplayer payloads.
- No card-stat bonuses based on foil, alternate art, scarcity, or price.
- No gold wagering in player-versus-player matches until collusion and disconnect abuse are designed.

## 4. Player loops

### 4.1 First-hour loop

1. Meet a Waytable Circuit guide in or near the starting settlement.
2. Use a loaner deck in a no-reward tutorial match. The loaner exists only for teaching and cannot be traded.
3. Finish the tutorial to receive one idempotent, normal-print starter bundle.
4. Open the starter pack, see five ordered reveals, and inspect new Card Dex entries.
5. Build or edit a 30-card deck with legality feedback.
6. Challenge one local resident and earn a first-win reward.
7. Visit a merchant's **Cards** counter to compare stable stock, owned counts, and prices.

If the player trades away the starter cards, the loaner remains available for casual, rewardless teaching matches. This avoids permanently locking a world out of the TCG.

### 4.2 Ongoing collection loop

Explore or trade → obtain sealed packs, loose cards, or grants → reveal/deposit cards → update the Card Dex → inspect duplicates and variants → build decks → play town or player matches → unlock set/guild rewards → return to harder exploration.

Each acquisition route should emphasize a different part of Blockwild:

- capture fills species-linked gaps;
- dungeon families yield themed packs;
- bosses yield signature printings;
- merchants provide targeted singles and randomized packs;
- guilds provide progression and utility;
- matches provide mastery rewards rather than the best raw economy farm;
- player transfers let duplicate holdings circulate.

### 4.3 Long-term loop

- Complete definition, printing, variant, and finish sub-collections.
- Raise Cardwright and Waytable guild ranks.
- Assemble faction, type, habitat, boss, or set archetypes.
- Defeat increasingly strong town challengers.
- Earn first-win and seasonal-circuit cosmetics.
- Pursue boss signatures and authored promos.
- Trade duplicates without invalidating saved decks or creating duplicate custody.

## 5. Card content model

### 5.1 Card classes

| Class | Repository source | Rules role | Examples of source material |
|---|---|---|---|
| **Being — Creature** | `MOB_DEFS`, creature profiles, types, moves | Persistent unit with cost, Power, Guard, type, traits, and abilities | Natural mobs, dragons, legendary creatures |
| **Being — Character** | sentient mob definitions, settlement professions, guild NPCs | Persistent unit focused on faction/guild synergies | Merchants, mayors, guards, guild figures |
| **Technique** | creature moves, spells, tools, behaviors | One-time effect, then discard | movement, attacks, care, capture, magic |
| **Relic** | item catalog, drops, crafting, dungeon rewards | Persistent attachment or support permanent | tools, artifacts, food, Capture Orbs |
| **Place** | biomes, settlements, dungeons, guild halls, POIs | One active world modifier per player | Moonbough hall, dungeon vault, reef market |

`Boss`, `Sentient`, `Guild`, `Faction`, `Aquatic`, `Dragon`, `Prime`, and habitat names are traits, not separate card classes.

### 5.2 Types

Use the existing 21 stable creature type IDs for identity, search, deck synergy, iconography, and a small combat edge. A card may have one primary type and up to two secondary types.

For TCG combat, resolve only the primary attacking/defending types:

- strong relationship: attacker deals +1 combat damage;
- resisted relationship: attacker deals -1 combat damage, minimum 0;
- otherwise: no modifier;
- if multiple repository relationships would apply, the TCG adapter still caps the result at ±1.

This preserves Blockwild's type language without importing real-time multipliers or making players memorize multi-axis arithmetic. Techniques can reference secondary types for deck-building effects.

### 5.3 Rarity

Use five collectible rarities:

1. Common
2. Uncommon
3. Rare
4. Epic
5. Legendary

Rarity controls print frequency, acquisition route, presentation, and reference value. It does **not** grant an automatic stat budget. A narrow Legendary may be scarce because it depicts a unique world event, while a Common may be a competitive archetype staple.

`Starter`, `Promo`, `Boss Signature`, and `Guild Reward` are acquisition labels, not rarities. This avoids mixing “where it came from” with “how often it appears.”

### 5.4 Definitions, printings, and variants

- A **card definition** is one immutable rules identity. Deck copy limits and balance patches address this ID.
- A **printing** is a collectible edition of a definition within a set. It owns collector number, frame, illustration, finish eligibility, and market reference.
- A **variant** changes art direction, frame treatment, or composition without changing rules.
- A **finish** changes surface treatment: standard, foil, etched, or boss-signature.

All variants and finishes of a definition share the same deck copy limit. Match state records the chosen printing for presentation but evaluates only the definition and rules revision.

Recommended variant policy:

- standard printing: always present;
- foil: low independent roll on eligible pack cards;
- set showcase: authored subset, alternate illustration/frame;
- boss signature: guaranteed once from a resolved unique encounter;
- capture print: species-linked mark and provenance, same rules as the standard card;
- no random stat rolls, condition grading, durability, or gameplay-affecting serial numbers.

### 5.5 Sets and themes

Proposed initial set framework:

| Set | Purpose | Content |
|---|---|---|
| **Wildroads Core** | Complete launch environment | Broad creature types, all settlement factions, basic Techniques/Relics/Places, starter archetypes |
| **Halls and Hearths** | Town and guild identity | Residents, professions, commerce, chairs/tables, guild halls, social play |
| **Vaults Below** | Dungeon and boss chase content | Dungeon families, specialist loot, vaults, bosses, signature printings |

For production risk, these can be three theme partitions inside one launch legality block rather than three separately released products.

After launch, sets may be themed around an ecosystem, faction, guild, expedition, or update. Every set declares:

- stable set ID and semantic content version;
- legality dates/formats;
- collector-number range;
- available rarities and finishes;
- pack collation rules;
- art-direction key;
- source inclusion/exclusion policy;
- deterministic stock and loot tags.

Recommended format policy: launch with **Open** (all released cards) and **Core** (launch legality block). Do not rotate PvE town matches. Defer competitive rotation until there are enough sets to justify it.

### 5.6 Catalog coverage rule

The first complete content pass should generate an audit from the live registries:

- every eligible `MOB_ORDER` entry has a Creature card or an explicit exclusion reason;
- every sentient faction has Character cards obtainable without capture;
- every current guild has at least one representation card;
- every dungeon family and authored boss has a pack, Place, Character, or signature link;
- every card references valid source IDs and existing type IDs;
- summoned/transient/system-only mobs are excluded explicitly rather than silently omitted.

Static source data may prefill names, lore fragments, types, and art keys. Costs, Power, Guard, abilities, rarity, and pack eligibility remain authored TCG content.

## 6. Proposed data schema

The shapes below are planning contracts, not implementation code.

```ts
type TcgCardDefinition = {
  schema: 1;
  id: string;                    // stable, never reused
  rulesRevision: number;
  name: string;
  class: "creature" | "character" | "technique" | "relic" | "place";
  source: {
    kind: "mob" | "item" | "move" | "profession" | "guild" | "poi" | "authored";
    id: string;
  };
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  primaryType?: CreatureTypeId;
  secondaryTypes: CreatureTypeId[];
  factions: string[];
  guilds: string[];
  traits: string[];
  cost: number;
  power?: number;
  guard?: number;
  keywords: TcgKeywordId[];
  abilities: TcgAbilitySpec[];    // structured effects, not executable strings
  flavorText?: string;
};

type TcgPrinting = {
  schema: 1;
  id: string;                    // stable collectible identity
  cardDefinitionId: string;
  setId: string;
  collectorNumber: string;
  variant: "standard" | "showcase" | "capture" | "boss-signature" | "promo";
  finish: "standard" | "foil" | "etched" | "signature";
  illustrationKey: string;
  frameKey: string;
  acquisitionTags: string[];
  valueModifierPermille: number;
  released: boolean;
};

type TcgPlayerState = {
  schema: 1;
  revision: number;
  ownerId: string;
  archived: Record<string, number>;          // printing ID -> digital count
  dex: Record<string, TcgDexEntry>;          // definition ID
  decks: TcgDeck[];
  activeDeckId: string | null;
  tutorial: TcgTutorialState;
  npcProgress: Record<string, TcgNpcProgress>;
  rewardClaims: string[];
  recentEventIds: string[];
};

type TcgWorldState = {
  schema: 1;
  revision: number;
  catalogRevision: string;
  players: Record<string, TcgPlayerState>;
  custodyBatches: Record<string, TcgCardBatch>; // physical stack partitions
  uniqueCopies: Record<string, TcgUniqueCopy>;  // only true serialized promos
  merchantStock: Record<string, TcgMerchantStock>;
  packBatches: Record<string, TcgPackBatch>;
  activeTrades: Record<string, TcgTradeEscrow>;
  activeMatches: Record<string, TcgMatchState>;
  worldGrantClaims: string[];
};
```

### 6.1 Count model

Ordinary copies are fungible by `printingId` and stored as bounded integer counts. Archived cards use one count per printing. Physical cards use one custody batch per stack/container partition, not one object per card. This makes unlimited duplicates practical without one JSON object per Common.

The physical-batch totals and archived counts are canonical and update in one transaction; UI holdings are derived from them. Only truly serialized rewards—such as a one-per-world boss signature, if Noah wants visible serial provenance—receive a `copyId`. A normal foil is still a printing count, not a unique object.

Every normalizer must:

- reject unknown IDs into a recoverable quarantine report rather than treating them as playable;
- clamp unsafe counts and revisions;
- bound arrays, string lengths, nested records, and total serialized size;
- merge duplicate printing entries;
- preserve unknown future-safe optional fields only when explicitly supported;
- never silently convert one printing into another.

### 6.2 Static catalog versus save state

The save stores only `catalogRevision`, printing IDs, definition IDs in decks, counts, and transaction state. It does not store card text, source lore, image paths, or ability definitions. Catalog IDs are append-only. Retired cards remain resolvable and are marked unavailable/illegal rather than deleted.

## 7. Acquisition system

### 7.1 Packs and collation

Every standard booster contains exactly five cards. The reveal screen sorts the resulting cards from lowest rarity to highest rarity, as requested in `BWTCG.txt`; it must not reorder ownership or secretly reroll.

Recommended initial slot table:

| Slot | Common | Uncommon | Rare | Epic | Legendary |
|---|---:|---:|---:|---:|---:|
| 1–3, each | 80% | 18% | 2% | — | — |
| 4 | — | 70% | 25% | 5% | — |
| 5 | — | — | 80% | 17% | 3% |

Expected contents are 2.40 Common, 1.24 Uncommon, 1.11 Rare, 0.22 Epic, and 0.03 Legendary. This is an initial balancing assumption. Automated simulations should evaluate at least one million deterministic pack openings before those odds are accepted.

Collation rules:

- first choose the slot rarity using the pack batch seed and pack index;
- choose from cards eligible for the pack's set/theme and rarity;
- apply a mild within-pack duplicate guard for definitions when the pool permits, but do not add collection-based duplicate protection;
- roll finish after definition/printing selection so foil does not consume the rare slot;
- sort the reveal by rarity, then collector number;
- commit all five awards atomically;
- if capacity or normalization fails, keep the pack unopened and award nothing;
- record the redeemed `packBatchId + packIndex` before publishing the result.

Recommended finish rates:

- foil: 8% per eligible card;
- showcase replacement: 1% per eligible authored definition;
- etched/signature: authored reward only, not a generic pack roll.

Those rates are also assumptions. Variants remain cosmetic.

### 7.2 Physical sealed packs

Sealed packs are inventory items because they are tangible loot and merchant goods. A stack refers to a host-issued pack batch:

- `packBatchId`;
- set/product ID;
- quantity and next unopened index;
- issuer/source;
- created revision.

The host derives each pack's deterministic seed from world identity, batch ID, and pack index. A guest never submits or selects a seed. Opening consumes one index exactly once. Copying old item metadata cannot redeem an already-consumed index.

Avoid a fully precommitted cryptographic reveal system in the first build; it adds complexity without making a local host trustworthy. Deterministic host-issued batches plus redemption claims solve the repository's realistic failure modes.

### 7.3 Merchant stock

Extend `TradePanel` with an explicit **Market** selector:

- General goods
- Cards and packs

Buy/Sell remains the second-level direction control. The Cards market shows:

- set, rarity, variant/finish, and owned count;
- physical/archive split;
- quantity;
- stable price quote and stock limit;
- source/theme hints without exposing unrevealed pack contents.

Recommended restock:

- follow the existing two-world-day merchant cadence;
- 8–16 TCG entries per dedicated card merchant;
- 2–5 sealed pack lines;
- 6–11 single-card lines;
- 0–2 showcase or old-set lines;
- 60% of weighted choices from faction/profession/biome/guild themes;
- 40% from the wider legal catalog;
- stock is derived from saved `restockSeed + restockDay + tcgCatalogRevision`, so reopening the panel never rerolls it.

General merchants may carry 0–4 TCG entries. Cardwright merchants get the broadest singles pool; Waytable merchants emphasize playable packs and starter archetypes.

TCG stock should have its own bounded state rather than masquerading as `MerchantStack` entries in the existing item catalog. The current economy API can supply pricing, wallet revisions, authority stamps, and event patterns, but variant identity and card custody need domain-specific validation.

### 7.4 Dungeon, mob, and boss rewards

Integrate packs through existing host-owned loot points:

| Source | Proposed reward |
|---|---|
| Eligible unaffiliated hostile natural mob | 0.25% theme-booster chance |
| Elite/special encounter | 2% theme-booster chance |
| Dungeon staging container | low chance of a standard booster |
| Dungeon specialist container | 12% themed-booster chance |
| Dungeon vault | one guaranteed dungeon-themed booster on first valid open, then normal contextual rolls |
| Repeatable dungeon boss | one guaranteed themed booster per valid resolution, subject to existing encounter cadence |
| Unique/Prime/legendary first resolution | one signature printing plus a themed booster, keyed by encounter/site claim |

These rates are assumptions and must be simulated against current encounter frequency.

Required safeguards:

- attuned/captured creatures still faint without drops;
- sentient residents do not drop cards or packs;
- unresolved legendary retreats award nothing;
- boss signatures use the existing idea of site/encounter identity and acquired reward IDs;
- reopening, reconnecting, save/reload, or copying a stale container state cannot repeat a first-resolution reward;
- loose unique cards should not become ordinary world drops, which are capped and metadata-sensitive in the current engine.

### 7.5 Capture links

Recommended default:

- the first valid capture of a species grants one normal **Capture Print** of its Creature card;
- the claim key is `playerId + mobKind`, not Capture Orb position or inventory slot;
- recapture, release/recapture, breeding replacement, or transferring the same specimen does not repeat the grant;
- subsequent duplicates come primarily from packs, shops, trades, and matches;
- a unique specimen may be shown in provenance text, but its genetics do not alter card rules;
- sentient/faction-aligned humanoids are excluded and their cards are bought, won, or awarded through guilds.

Alternative Noah may prefer: one grant per distinct stable specimen ID, with a daily species cap. That more literally rewards each capture but creates an incentive to capture disposable creatures for card farming. The first-species rule is safer for ecology and economy.

### 7.6 Guild and quest rewards

**Cardwrights' Collegium**

- tutorial: archive and Card Dex;
- ranks unlock archive capacity, advanced sorting, set checklists, price history hints, and old-set merchant access;
- quests ask for set completion, variant discovery, provenance, and safe deposits;
- rewards are binder cosmetics, deterministic promos, and utility—not stronger cards.

**Waytable Circuit**

- tutorial: deck building and matches;
- ranks unlock challenger tiers, deck slots, table cosmetics, and circuit formats;
- quests require wins with types/factions, not raw win streak grinding;
- rewards use first-win or authored claim IDs.

Existing guild semantic-event plumbing can record `pack-opened`, `card-discovered`, `set-threshold`, `deck-validated`, `npc-match-won`, and `player-trade-completed`. These additions must be bounded and normalized like current guild history.

## 8. Economy and balancing

### 8.1 Initial reference values

Proposed tuning seed:

| Rarity | Single-card reference value |
|---|---:|
| Common | 4 gold |
| Uncommon | 12 gold |
| Rare | 40 gold |
| Epic | 140 gold |
| Legendary | 450 gold |

Suggested modifiers:

- standard: ×1.00;
- foil: ×1.25;
- showcase: ×1.75;
- capture print: ×1.00;
- boss signature: no automatic merchant sale, or a separately authored value.

Suggested retail:

- standard five-card booster: 65 gold;
- faction/theme booster: 80 gold;
- curated starter bundle: one-time quest reward, then 180 gold;
- merchant buyback: 25–35% of reference value;
- sealed-pack buyback: at most 25% of retail.

With the proposed pack odds, the expected sum of single-card reference values is about 113 gold before finish rolls. At a 30% buyback, the expected liquidation value is about 34 gold, safely below a 65-gold pack. The gap pays for choice, excitement, and merchant spread without enabling deterministic buy-open-sell arbitrage.

All prices should still pass through existing faction standing, bartering, and merchant-demand logic, but enforce these invariants:

- expected pack buyback value remains below 55% of retail at every normal modifier combination;
- the same merchant never buys a sealed pack for more than it sells it;
- a merchant cannot sell and rebuy a single for net player profit without an external state change;
- reward-only signatures cannot be converted into infinite gold;
- price computations use bounded integer/BigInt-safe gold paths already present in the economy.

### 8.2 Supply controls

- Merchant stock is stable until restock.
- First-win NPC rewards are once per opponent per world day; signature/promotional rewards are once ever.
- Repeat matches may award Circuit reputation and a small fixed gold amount, but no uncapped packs.
- Mob pack drops exclude allied, captured, summoned, and sentient creatures.
- Dungeon guarantees follow resolved container/encounter identity.
- Collection duplicates are unlimited, but every route has an issuance record.

### 8.3 Balance process

Build a headless simulator around the pure match reducer:

- pack EV by product and set;
- cards acquired per hour by exploration route;
- gold in/out by player tier;
- archetype win rate, first-player advantage, average turns, hand size, and deck-out rate;
- rarity share in top-performing decks;
- NPC reward yield per hour;
- save-size growth at 1,000, 10,000, and 100,000 owned cards.

Balance targets:

- first-player win rate: 48–52%;
- median match: 8–12 minutes and 8–14 turns;
- no launch archetype above 55% win rate across a representative matchup matrix;
- Common/Uncommon cards remain at least 60% of cards in viable starter decks;
- normal pack liquidation EV remains below 55% of retail;
- a new player can construct one legal deck from the tutorial/starter path without purchasing random packs.

## 9. Physical cards, archive, binder, Card Dex, and decks

### 9.1 Physical representation

Use three physical shells:

1. **Sealed Booster** — stackable host-issued pack-batch item.
2. **Card Case** — portable interaction item that opens the Binder/Decks UI; it does not duplicate contents into metadata.
3. **Loose Card** — a printing-specific physical withdrawal token, stackable only when printing and custody batch match.

Physical cards are useful for chests, direct inspection, authored display blocks, and transfers. The ledger owns the count; the inventory item references a custody batch. Removing or moving the item goes through a TCG custody transaction, not generic metadata copying.

Do not allow player-created loose-card world drops in the first release. Existing world drops are capped and ordinary metadata equality is not sufficient for scarce custody. Direct transfer and containers cover the useful cases. Authored loot should award packs or ledger grants.

### 9.2 Digital Card Archive and Binder

Add a card-specific Waygrid/archive facility:

- tiered capacity measured in total card copies;
- search by name, set, class, type, faction, guild, rarity, variant, finish, and source;
- bulk deposit/withdraw;
- “deposit all duplicates above deck need”;
- atomic overflow behavior;
- never accepts unknown or quarantined printing IDs;
- records physical and archived counts separately.

The **Binder** is the main collection interface. It combines physical and archived holdings, supports page/list views, and exposes allocation/transfer controls. Digital storage is a custody location; the Binder is the UI over all locations.

### 9.3 Card Dex

The Card Dex is definition-first:

- one catalog entry per card definition, including missing cards;
- `everOwned`, `ownedTotal`, `physical`, `archived`, `selectedInActiveDeck`, and variant/finish counts;
- arbitrary duplicate counts;
- discovered source hints and full source details after first ownership;
- set progress at definition, printing, variant, and finish levels;
- recent acquisition and first acquisition timestamp/order;
- no dependence on the Living Bestiary's capture counts.

Sort:

- catalog/collector number;
- name;
- set;
- rarity;
- class;
- primary type;
- faction/guild;
- total owned;
- newest acquired;
- reference value.

Filter:

- all/owned/missing;
- set and legality;
- class;
- type;
- faction/guild;
- rarity;
- standard/foil/showcase/capture/signature;
- deck legal;
- source family.

OR applies within one facet and AND across facets, matching the repository's current Bestiary interaction model.

### 9.4 Decks

- 30 cards exactly;
- at least 12 Being cards;
- no more than 3 copies of one card definition across all its printings;
- no more than 1 copy of a specific Legendary definition;
- no more than 4 Place cards;
- a saved deck may reference owned printings across physical and archived custody;
- multiple saved decks may reference the same owned copies;
- the active deck is revalidated against current holdings before a match;
- starting a match locks the chosen deck snapshot until the match ends;
- an escrow or merchant sale cannot consume copies locked by an active match;
- if a balance revision changes a definition, saved decks show a repair state instead of silently replacing cards.

Recommended launch allowance: 12 saved deck slots, with more unlocked cosmetically through the Waytable guild. Deck slot count should not affect competitive power.

## 10. Match rules

### 10.1 Match objective and board

- Each player starts at **20 Resolve**.
- Each player uses a legal 30-card deck.
- Each player has five hand cards initially.
- Each player has three Being slots, two Relic/support slots, and one Place slot.
- Reduce the opponent to 0 Resolve or make the opponent fail to draw from an empty deck.
- Concede is always available.

### 10.2 Setup

1. Host validates both ownership snapshots, format, catalog revision, and deck legality.
2. Host stores deck commitments and creates a deterministic match seed.
3. Host shuffles both decks.
4. Each player draws five.
5. Each player may mulligan any number once; returned cards are reshuffled after replacements are drawn.
6. First player skips the normal turn-one draw.
7. Second player receives **Trail Spark**, a zero-cost one-use Technique that grants one temporary energy for the turn.

### 10.3 Turn flow

1. **Start**
   - increment maximum Trail Energy by one, to a cap of 10;
   - refill energy;
   - ready exhausted cards;
   - resolve start triggers;
   - draw one, except the first player's first turn.
2. **Main**
   - play Beings, Techniques, Relics, and a Place;
   - activate legal Main abilities;
   - reorder no hidden zones.
3. **Clash**
   - each ready Being may attack once;
   - newly played Beings cannot attack unless they have `Swift`;
   - if the defender controls a `Guard` Being, it must be targeted before Resolve;
   - otherwise choose an opposing Being or opposing Resolve;
   - Beings deal Power to one another simultaneously;
   - type advantage changes attacker combat damage by at most ±1;
   - damage remains until healed; a Being at zero Guard is defeated.
4. **End**
   - resolve end triggers;
   - discard temporary effects;
   - enforce hand limit 9, with the active player choosing excess discards;
   - publish the next redacted state revision.

### 10.4 Initial keyword vocabulary

Keep the first rules engine bounded:

- `Guard` — must be attacked before Resolve.
- `Swift` — may attack on the turn played.
- `Ambush` — triggers when an opposing Being enters.
- `Bond` — bonus while a named type/trait is beside it.
- `Faint` — effect when defeated.
- `Forage` — reveal or draw based on a bounded condition.
- `Attune` — attach a Relic or type marker.
- `Rally` — effect when another allied Being enters.
- `Dive` — temporarily cannot be targeted by non-Tide Techniques, with a clear return rule.
- `Prime` — deck-limited trait, not an automatic power bonus.

Abilities must be structured effect data interpreted by a closed engine. Card text is rendered from the structured effect plus authored display text; it is never evaluated as code.

### 10.5 NPC matches in towns

- Every generated settlement gets 2–4 deterministic eligible challengers based on living residents, professions, faction, and world seed.
- Challenge is offered only when the resident is alive, nearby, not fleeing/fighting, and not already engaged.
- Card tables are placed in compatible market, guild, tavern/social, or hall buildings; existing chairs/tables provide spatial anchors.
- NPC decks are authored archetype recipes resolved against faction/type/profession and difficulty.
- Difficulty tiers change deck quality and decision search depth, not hidden card bonuses.
- The host runs deterministic NPC decisions using legal-action enumeration, heuristic scoring, and bounded lookahead.
- First wins grant authored rewards. Repeat wins grant modest Circuit standing and capped gold.
- If combat or settlement danger begins, a town match suspends or safely cancels; it must not leave a resident invulnerable or freeze the world indefinitely.

### 10.6 Player matches

- Start at a card table or through an accepted nearby challenge.
- Friendly match by default; no gold wager.
- Host adjudicates every action and owns shuffle/order.
- Each turn has a configurable 60–90 second clock in network matches; single-player and accessibility options may disable it.
- One reconnect grace window (recommended 120 seconds) preserves the seat.
- After grace expiry, disconnect counts as a loss but does not transfer cards.
- Match rewards are issued once by match ID and result revision.
- Spectating and tournaments can be later protocol extensions; the reducer and action log should support them without exposing hands.

## 11. UI plan

### 11.1 Main TCG hub

Add one top-level `tcg` overlay state with internal routes rather than many unrelated engine overlays:

- Card Dex
- Binder
- Decks
- Packs
- Matches/Circuit

This keeps the `OverlayKind` union and `VoxelGame.tsx` integration small. Dedicated panels and selectors live under `app/game/tcg/ui/`.

### 11.2 Pack opening

- shows sealed product and remaining quantity before confirmation;
- opening is one explicit action;
- receives a committed host result;
- reveals exactly five cards least-to-most rare;
- supports Reduce Motion and instant-reveal;
- includes New, Owned, Total, Variant, and Card Dex progress;
- deposits to the selected default location atomically;
- never blocks ownership on an animation failure.

### 11.3 Store

Add the Goods/Cards market selector above existing Buy/Sell controls. Preserve:

- review before confirmation;
- quantity bounds and limiting reason;
- both purses;
- stable quote;
- merchant identity/faction presentation.

For cards, show owned counts and the exact printing. Never sell an abstract “random Rare single.”

### 11.4 Binder and Deck Builder

Desktop:

- filter/sort rail;
- collection grid/list;
- card detail;
- active deck curve/type/class summary;
- legality and missing-copy rail.

Narrow screens:

- one primary pane at a time;
- persistent deck count/legality footer;
- no hover-only rules;
- card text opens in a readable detail sheet.

Required accessibility:

- keyboard-complete;
- semantic buttons/tabs/listboxes;
- visible focus;
- text alternative for every icon and illustration;
- rarity never communicated only by color;
- font scaling without text clipping;
- Reduce Motion pack reveals;
- deterministic card text in accessible DOM, not only canvas pixels.

### 11.5 Match screen

- clear own hand and concealed opponent-hand count;
- three Being slots per side;
- Resolve, energy, deck, discard, and timer always visible;
- legal targets highlighted after card/action selection;
- action log with concise resolved text;
- inspect any public card without changing selection;
- confirm only irreversible choices such as mulligan, target, concede, and multi-option effects;
- state-repair banner if a stale network action is rejected.

The 3D world can remain visible behind the panel, but match input must capture keyboard/mouse cleanly and must not also swing tools, move inventory items, or interact with the world.

## 12. Multiplayer and authority

### 12.1 Protocol

Add dedicated payloads:

- `tcg-action` — player intent with `requestId`, actor, match/trade/facility ID, expected revision, action kind, and bounded parameters;
- `tcg-state` — targeted redacted match/collection result;
- `tcg-progress` — optional chunked collection transfer if it cannot fit normal state limits.

Do not overload `CreatureAction`; its trade fields currently describe item catalog commerce and its validator has a different trust surface.

### 12.2 Authority rules

The host validates:

- actor/peer identity;
- proximity and active merchant/table/resident when the action requires world context;
- expected player, merchant, collection, escrow, and match revisions;
- current holdings and locks;
- catalog ID and legality;
- turn/priority and legal target;
- pack batch ownership and unopened index;
- claim and request ID non-reuse;
- output bounds before commit.

The guest submits intent only. It does not submit merchant state, awarded cards, shuffle order, NPC result, card price, or post-action collection.

### 12.3 Hidden information

Store one full host match state, then derive a view for each recipient:

- own hand contains printing/card data;
- opponent hand exposes count only;
- unrevealed deck order is omitted;
- pending secret choices are actor-only;
- spectators, if later added, receive neither hand.

Never send the full state and rely on the UI to hide it.

### 12.4 Atomic trading

Player transfer uses an escrow state machine:

1. initiator selects exact printing/count and optional gold;
2. host validates and locks offered assets;
3. recipient reviews the immutable offer and adds a counter-offer if allowed;
4. both accept the same escrow revision;
5. host atomically transfers both collections/wallets and closes escrow;
6. reject, disconnect, expiry, or revision drift unlocks everything.

Every transition is idempotent by request/event ID. The commit either changes both players or neither. Active-deck match locks and other escrows reduce available counts.

### 12.5 Honest security boundary

This design prevents network clients from awarding themselves cards during a normal hosted session and prevents stale/replayed actions from duplicating custody. It does not make a local host's editable save or JavaScript runtime trustworthy. “Ranked” integrity beyond trusted friends would require a server-authoritative account service, which is outside the current architecture.

## 13. Deterministic card layout and illustration pipeline

### 13.1 Deterministic production layout

Pipeline:

1. validate catalog and printing;
2. resolve localized display text from structured rules;
3. resolve frame, symbols, rarity, collector number, and illustration key;
4. lay out fixed semantic zones;
5. measure text with bundled/versioned fonts;
6. apply bounded typography rules;
7. render SVG for catalog assets and DOM/CSS for interactive UI from the same layout tokens;
8. hash catalog revision, layout version, font version, and illustration asset;
9. write a manifest and comparison artifact in the eventual implementation task.

Required zones:

- name and cost;
- illustration;
- class/type/faction line;
- structured rules text;
- flavor/source line;
- Power/Guard where applicable;
- set symbol, rarity label, collector number, printing/finish, layout version.

Text policy:

- fixed card dimensions and safe areas;
- maximum title/rules/flavor lengths validated in CI;
- only approved symbols and keyword templates;
- two or three bounded font-size steps;
- never squeeze below the readable floor;
- fail catalog validation when text still overflows;
- no rasterized rules text;
- no generative model text inside illustration.

Golden rendering tests should cover longest names, maximum rules blocks, all rarities, every card class, narrow glyphs, missing illustration fallback, and high-contrast mode.

### 13.2 Existing-art fallback

For Creature cards:

- use `public/creatures/<mobKind>.svg`;
- the portrait is grounded in `mob-models.ts` and the current deterministic render script;
- crop/position through authored per-printing art-direction metadata, not runtime randomness.

For Character, Relic, and Place cards:

- reuse existing sentient portraits, item icons, and deterministic repository assets where available;
- provide an authored emblem/silhouette fallback where no source portrait exists;
- block release only if a printing has neither its intended asset nor the approved fallback.

This produces a visually complete, reproducible set before any new production art.

### 13.3 Optional future ImageGen workflow

ImageGen should be an offline content-production lane:

1. render the existing canonical 3D mob portrait to a high-resolution transparent PNG;
2. create a prompt package from card source, set art direction, desired pose, palette, crop, and “no words, letters, border, UI, watermark” constraints;
3. include the existing mob image as the grounding reference;
4. request an illustration only, never the full card;
5. visually compare silhouette, anatomy, signature colors, equipment, and species identity with the source;
6. reject identity drift, unwanted text, framing conflicts, or unreadable focal composition;
7. store an approved asset under a content-addressed key;
8. record source hash, prompt version, generation tool/model metadata, reviewer, date, and intended printing;
9. run the deterministic card renderer and manually review the final card at actual UI size.

Set-level art-direction presets can support the brief's “edgier,” “cute,” “more realistic,” and “artsy” variants without letting each prompt invent a new creature design. Production art generation is a separate future task and requires manual review before release.

## 14. Persistence, migration, and consistency

### 14.1 Save placement

Add optional `tcg?: TcgWorldState` to `WorldSave`. The local player's collection and host-owned guest collections live inside it, keyed by stable player identity. Add only a compact TCG summary to targeted player state; transfer the full collection through a bounded progression path when needed.

The current `PlayerProgressionSnapshot` is the closest existing contract for per-guest journals, maps, Bestiary, magic, banking, and stock state. Either:

- add `tcgPlayer` there and make the world TCG state own only shared merchants/matches/claims; or
- keep the authoritative player collection in `TcgWorldState` and create a dedicated chunked TCG transfer.

Recommendation: use the second option. Cross-player escrow and pack issuance require one world-level atomic authority. The player progression snapshot can carry Card Dex/tutorial/deck preferences only if those are carefully reconciled; avoiding two authoritative copies is more important than reusing the exact snapshot shape.

### 14.2 Migration

- Missing TCG field → normalized empty schema-1 state.
- Existing worlds receive no cards automatically except the once-only tutorial/starter path.
- Save generator version does not change merely for TCG content.
- TCG schema migrations are independent and pure.
- Catalog revision migration maps only explicit IDs; no fuzzy name matching.
- Deprecated printings remain owned and visible.
- Removed/invalid entries are quarantined in a recovery report, not silently converted or sold.
- Importing a world follows the existing world identity/fingerprint policy; all TCG claim keys remain internally consistent with the imported world.

### 14.3 Anti-duplication invariants

For each printing:

`issued = physical + archived + merchant + escrow + pendingGrant + destroyed/retired`

Decks are references and do not add to custody. Matches lock a deck snapshot and do not create another copy.

Required transaction properties:

- consume and award in one commit;
- request/event IDs are idempotent;
- expected revisions reject stale writes;
- pack index is redeemed once;
- first-capture and boss claims are redeemed once;
- unique `copyId` appears in exactly one location;
- escrow changes both parties or neither;
- failed deposit/withdraw preserves the source state;
- save normalization does not increase total issued counts;
- reconnect state repair replaces optimistic guest state with host state.

Keep a bounded recent-event cache for replay protection and durable claim sets for grants that must remain unique forever. Event history may be compacted only after its effect is represented in canonical counts and claims.

### 14.4 Recovery and corruption handling

On load:

1. normalize static IDs and bounds;
2. reconcile pack batches and redeemed indices;
3. reconcile physical custody tokens against ledger batches;
4. release expired escrows;
5. cancel or restore active matches according to saved match phase;
6. detect count/conservation conflicts;
7. quarantine ambiguous assets;
8. expose a diagnostic report with no hidden deletion.

If the game crashes after a transaction is prepared but before it is committed, replay must resolve to the pre-commit or post-commit state, never both.

## 15. Planned code boundaries and integration points

### 15.1 New modules

```text
app/game/tcg/
  ids.ts                 stable IDs and append-only registries
  schema.ts              static and saved-state types
  catalog.ts             catalog composition and audits
  sets/                  authored set/printing data
  abilities.ts           closed effect vocabulary
  collection.ts          holdings, Dex, decks, locks
  custody.ts             physical/archive/escrow conservation
  packs.ts               products, collation, redemption
  market.ts              themed stock and TCG quotes
  grants.ts              capture, boss, guild, quest claim IDs
  match.ts               pure deterministic reducer
  legality.ts            formats and deck validation
  npc.ts                 deterministic deck recipes and decisions
  persistence.ts         normalizers and migrations
  multiplayer.ts         redaction, actions, validators
  selectors.ts           read models for UI
  layout.ts              deterministic card layout tokens
  ui/                    TCG hub, Dex, Binder, Decks, Packs, Match
```

### 15.2 Existing files expected to integrate

| File/system | Planned integration |
|---|---|
| `app/game/data.ts` | Append stable physical-shell item IDs and definitions. |
| `app/game/engine.ts` | Own TCG service/state, save/load hooks, acquisition triggers, proximity checks, overlay summary, host action dispatch. Keep rules out. |
| `app/game/VoxelGame.tsx` | Add one TCG overlay entry and world interaction entry points. |
| `app/game/HearthroadsPanels.tsx` | Either add the Cards market selector or extract the trade shell for goods/TCG adapters. |
| `app/game/economy.ts` | Reuse gold, pricing context, revisions, and merchant authority; do not force printing state into `CommerceItem`. |
| `app/game/contextual-loot.ts` | Add pack products and deterministic first-open grants to relevant families. |
| `app/game/mobs.ts` / profiles / moves / types | Catalog source references and audit generation only. |
| capture and rarity modules | Species/specimen claims and resolved encounter signatures. |
| `app/game/guilds.ts` | New guild IDs, definitions, campaign content, events, rank rewards, hall selection. |
| `app/game/settlements.ts` | Card-table furniture/role compatibility and challenger schedule hooks. |
| `app/game/multiplayer.ts` | New bounded payloads, validators, send/listen helpers, and target-specific redaction. |
| `app/game/world-storage.ts` | No format redesign expected; add size/import/migration tests for TCG state. |
| `scripts/render-models.ts` / `public/creatures` | Illustration source and deterministic fallback assets. |

Do not create a second game engine. The TCG reducer should be pure and testable, while `engine.ts` supplies authoritative world context and commits results.

## 16. Test strategy

### 16.1 Catalog and layout

- no duplicate/reused definition, printing, set, collector, keyword, or product IDs;
- all source references resolve;
- all type IDs are valid;
- all structured abilities are interpretable and bounded;
- coverage audit for mobs, factions, guilds, dungeons, and bosses;
- every released printing has an illustration or approved fallback;
- deterministic layout output matches goldens;
- longest text never clips at supported scale/language;
- card text remains accessible outside raster output.

### 16.2 Packs and economy

- fixed seed/catalog/product returns exact expected contents;
- every standard pack has exactly five valid cards;
- slot floors and reveal sorting hold;
- finish roll never changes rules identity;
- pack opening is atomic and idempotent;
- stale/copied pack batch cannot reopen an index;
- restock stable within the restock period and changes at the boundary;
- theme weights are statistically within tolerance;
- pack/card buy-sell paths conserve gold and custody;
- simulation verifies EV and supply targets.

### 16.3 Collection and persistence

- deposit, withdraw, bulk actions, and capacity overflow;
- unlimited duplicate counts within safe integer bounds;
- decks reference but do not duplicate holdings;
- sale/trade rejects locked or unavailable copies;
- migration from no TCG state;
- each future schema fixture;
- corrupt, oversized, unknown-ID, negative-count, duplicate-ID, and partial-transaction fixtures;
- export/import and autosave/reload;
- 1k/10k/100k-copy save-size and normalization benchmarks.

### 16.4 Acquisition

- first species capture exactly once;
- same specimen through release/recapture does not repeat;
- sentient/faction-aligned capture path never grants;
- attuned faint and unresolved legendary retreat never grant loot;
- contextual container open/reopen/reconnect;
- boss resolution, repeat resolution, and signature claim;
- tutorial/starter reward idempotence;
- NPC first-win/daily reward boundaries.

### 16.5 Match reducer

- setup, shuffle, mulligan, turn phases, resource cap, draw/deck-out;
- every keyword and ability operation;
- simultaneous combat, Guard targeting, type ±1 cap, defeat order;
- legal action enumeration and illegal action rejection;
- deterministic replay from action log;
- first-player balance simulations;
- fuzz/property tests: nonnegative zones, no card creation, valid ownership, bounded hand/board, terminal result once;
- NPC AI only emits legal actions and terminates within budget.

### 16.6 Multiplayer

- guest actions never mutate before host acceptance;
- wrong actor, distance, table, merchant, revision, match seat, turn, target, price, count, or printing rejects;
- redacted state never exposes opposing hands/deck order;
- duplicate request ID is idempotent;
- stale action triggers repair;
- pack/open, market, archive, deck, match, and escrow round trips;
- two-party escrow atomicity under accept/cancel/disconnect/race;
- reconnect grace and expired match;
- progression chunk size, order, loss, duplicate chunk, and maximum total size;
- mixed-version peers receive an explicit unsupported-feature response.

### 16.7 UI and end-to-end

- keyboard and screen-reader paths;
- narrow/wide viewport;
- Reduce Motion;
- buy/sell Goods/Cards selector;
- open five-card pack;
- filter/sort duplicates in Card Dex;
- build legal/illegal decks;
- town NPC match from world interaction through reward;
- two-player challenge and transfer;
- reload after each irreversible action;
- no world movement/tool input while a TCG modal owns focus.

The repository currently uses Node's test runner with `tsx` plus specialized UI, economy, multiplayer, world-storage, and renderer suites. Add focused TCG suites to those existing patterns, then run the full suite, production build, and browser E2E before release.

## 17. Phased implementation order

This order delivers the entire system while keeping each phase reviewable. It is not a recommendation to stop after a small demo.

### Phase 0 — Product and content lock

- Noah resolves the decisions in section 19.
- Audit live mob/item/type/guild/dungeon source coverage.
- Approve launch format, taxonomy, rarity, capture policy, guild scope, set count, and economy targets.
- Produce an authored card/content spreadsheet or typed fixture for the full launch catalog.

**Exit:** every planned definition has a source, class, set, acquisition route, art fallback, and ownership rule.

### Phase 1 — Domain foundation

- Implement IDs, schema, catalog validation, abilities, legality, normalizers, and migrations.
- Add TCG world/player save state.
- Create conservation/idempotency primitives and fixtures.

**Exit:** empty and large collections round-trip; catalog audit is green; no gameplay acquisition exists yet.

### Phase 2 — Collection surfaces

- Add physical shells, custody ledger, Card Archive, Binder, Card Dex, and Deck Builder.
- Add deterministic base-card renderer using existing assets.

**Exit:** cards can be granted by test/admin fixture, moved, sorted, displayed, and assembled into legal decks without count drift.

### Phase 3 — Packs, commerce, and world acquisition

- Add products/collation/reveal.
- Add Goods/Cards merchant market and stable themed stock.
- Add contextual loot, boss signatures, capture claims, tutorial, and guild rewards.

**Exit:** every acquisition route is authority-safe, idempotent, balanced in simulation, and visible in the Dex.

### Phase 4 — Match engine and town play

- Implement the pure reducer, all launch keywords, deck snapshots, NPC decks/AI, card tables, resident challenges, match UI, and rewards.

**Exit:** all launch archetypes can complete deterministic town matches; replay and balance simulations meet targets.

### Phase 5 — Multiplayer and transfer

- Add redacted match protocol, reconnect, escrow, targeted collection sync, validation, and state repair.

**Exit:** two guests/host can match and transfer under races/reconnects without hidden-info leaks or custody drift.

### Phase 6 — Guild campaigns and full content

- Add both halls, NPCs, ranks, campaign quests, rewards, and all launch set data.
- Complete faction/dungeon/boss representation audit.

**Exit:** the complete intended player loop and content catalog are present, not placeholder-only.

### Phase 7 — Art/content production and polish

- Complete authored deterministic frames and fallback crops.
- Optionally produce reviewed ImageGen illustrations under the documented provenance workflow.
- Tune text, accessibility, animation, audio hooks, and responsive presentation.

**Exit:** every released printing passes automated layout checks and manual visual review at game scale.

### Phase 8 — Hardening and release

- Full test/build/E2E matrix.
- Long-run economy/match/save simulations.
- Old-world migrations and export/import fixtures.
- Multiplayer mixed-version behavior.
- Performance and save-size budgets.
- Release notes, player rules, Card Dex help, and maintainer documentation.

**Exit:** all acceptance criteria below are met.

## 18. Risks and mitigations

| Risk | Failure mode | Mitigation |
|---|---|---|
| Engine/UI monolith growth | TCG logic becomes hard to test and destabilizes normal play. | Pure `app/game/tcg` domain; one engine service and one overlay integration. |
| Duplicate custody | A card appears in inventory, archive, escrow, and trade result. | One ledger, revisions, claim IDs, atomic transactions, conservation tests. |
| Save bloat | One object per Common or per generated image reference. | Counts by printing, unique IDs only for true promos, static catalog outside save, bounded compaction. |
| Pack rerolling | Reopen/reload changes contents or repeats rewards. | Host-issued batch/index, deterministic seed, redeemed claims, atomic commit. |
| Capture farming | Players repeatedly capture/release creatures for cards. | First-species claim recommendation; no rewards for sentients/allies/attuned fainting. |
| Economy arbitrage | Buy/open/sell or merchant round trip prints gold. | EV constraints, spreads, stable stock, property tests, simulator. |
| Rarity becomes power | Collecting turns pay-to-win/grind-to-win. | Rarity controls availability/presentation; balance budget independent; starter viability targets. |
| Hidden-information leak | Multiplayer payload exposes hands/deck order. | Per-recipient redacted states, protocol tests, no full-state broadcast. |
| Host cheating misunderstood | P2P presented as ranked-secure. | Explicit trust boundary; no ranked claims without server authority. |
| Catalog drift | Renamed/deleted IDs corrupt decks and holdings. | Append-only IDs, explicit migrations, deprecation instead of deletion. |
| Image identity drift | Generated art no longer resembles the mob or contains text. | Existing portrait grounding, set presets, provenance, human review, deterministic fallback. |
| Text overflow | Card is unreadable at actual UI scale. | Structured text, length budgets, bounded font steps, golden tests, manual review. |
| Content explosion | Two guilds, all mobs, variants, and NPC decks delay release. | Registry-driven audit, authored templates, phased content production, fixed launch set budget. |
| World interruption | Card UI leaves player exposed or traps residents. | Safe table state, clear cancel/suspend rules, no world input bleed. |
| Cross-world expectations | Players expect cards to follow them to unrelated hosts. | Make world scope explicit; defer account portability to a separately designed service. |

## 19. Product decisions Noah must make

The recommended choice is first in each item.

1. **Capture reward:** first capture of each species grants one Capture Print; or each unique specimen can grant one under a daily cap.
2. **Guild scope:** two full guilds (Cardwrights and Waytable); or one guild with collection/competition branches.
3. **Match contract:** approve 30 cards, 20 Resolve, three Being slots, automatic 1–10 energy, and the rules in section 10; or request a different board/resource model before content authoring.
4. **Physical transfer:** direct trade and container/card-case custody at launch, with no player-created loose-card world drops; or support world drops despite larger custody and recovery complexity.
5. **World scope:** cards remain within the host world save; or design account/cross-world portability, which materially expands architecture and trust requirements.
6. **Set release:** three themed partitions in one launch legality block; or separate staged set releases.
7. **Formats:** Open + nonrotating Core at launch; or plan rotation/bans immediately.
8. **Variants:** cosmetic-only foil/showcase/capture/signature; or any gameplay distinction, which this proposal strongly advises against.
9. **Player rewards:** no gold wagers and only bounded friendly-match rewards; or allow wagers/tournaments with added collusion controls.
10. **Boss signatures:** count-based authored signature printings; or individually serialized one-per-world copies.
11. **ImageGen:** ship deterministic existing-art cards first, then add reviewed generated illustrations; or require generated art before the first release.
12. **Economy targets:** accept the proposed 65-gold pack and reference-value model as a simulation starting point, not a final balance promise.

## 20. Concrete acceptance criteria

The complete TCG is ready only when all of the following are true.

### Content and collection

- All released definitions, printings, sets, products, abilities, and keywords pass a unique-ID and source-reference audit.
- Every eligible mob, faction, guild, dungeon family, and boss is represented or has a documented exclusion.
- Every released printing has a deterministic illustration fallback.
- Card Dex shows missing/owned cards, arbitrary duplicate counts, all requested filters/sorts, and correct set completion.
- Physical/archive totals remain correct through deposit, withdrawal, chest/container movement, merchant sale, direct transfer, save/load, export/import, and reconnect.
- Twelve saved decks work; active decks validate 30 cards, copy limits, class minimums, Place cap, format, and current holdings.

### Packs, drops, shops, and capture

- Every standard booster awards exactly five committed cards and reveals them least-to-most rare.
- Fixed seed/product/catalog inputs reproduce exact results.
- Reopen, reload, reconnect, copied metadata, or duplicate request cannot redeem a pack index twice.
- Merchant TCG stock is thematically weighted, broad, stable until restock, and buy/sell atomic.
- Dungeon, mob, boss, capture, guild, tutorial, and match grants obey their exact eligibility and claim rules.
- Sentient residents, allied/captured companions, attuned fainting, and unresolved legendary retreats never produce illicit TCG drops.
- Simulated pack liquidation stays below 55% of retail and ordinary merchant round trips cannot create gold.

### Matches and towns

- A new world can reach a rewardless tutorial match and receive one legal starter collection without random purchases.
- Every generated settlement can select valid challengers or explicitly report why none are currently available.
- NPC and player matches implement setup, mulligan, turns, energy, board limits, types, all launch keywords, victory, concession, timeout, and reconnect.
- Match replay from seed and action log reproduces the same terminal state.
- Opponent hidden zones never appear in another player's payload or UI state.
- Balance simulations meet the section 8 targets or document an approved exception.

### Multiplayer and consistency

- Every mutation is host-authored, revision-checked, bounded, and idempotent.
- Guest optimistic state is repaired after rejection.
- Player-to-player escrow commits both sides or neither under race, disconnect, expiry, and stale-revision tests.
- No test sequence increases issued card totals except an explicit grant/open/purchase transaction.
- Old worlds without TCG state load unchanged with an empty normalized collection.
- Corrupt/unknown TCG data produces a recovery report and never silently turns into valid value.

### UI, art, performance, and release

- Store, Card Dex, Binder, Deck Builder, pack reveal, match, and transfer flows are keyboard-complete, screen-reader legible, responsive, and Reduce-Motion compatible.
- Card rules text never clips in the automated corpus and passes manual review at actual game scale.
- Optional generated illustrations have source references, prompt/provenance records, and human approval; the game still works if they are absent.
- Save/load and UI stay within agreed budgets at 100,000 owned ordinary card copies.
- Focused TCG tests, the repository's full test suite, production build, and browser E2E all pass.
- Player-facing rules and maintainer documentation explain rarity, variants, packs, capture rewards, world scope, trading, match rules, and the honest multiplayer trust boundary.

## 21. Definition of done for this proposal

This document deliberately proposes the complete system: catalog, packs, acquisition, physical/digital custody, Card Dex, decks, matches, towns, guilds, UI, authority, art, persistence, migration, testing, integration, risks, and release order. It does not implement or alter any gameplay behavior.
