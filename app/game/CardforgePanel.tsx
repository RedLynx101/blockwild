"use client";

import { useMemo, useState } from "react";
import { TCG_CATALOG, TCG_RARITY_ORDER, TCG_SETS, tcgCardSearchText, tcgDefinitionForPrinting } from "./tcg/catalog";
import { TCG_ARCHIVE_CAPACITY, TCG_ARCHIVE_UPGRADE_PRICE, totalTcgArchived, validateTcgDeck } from "./tcg/collection";
import { layoutTcgCard } from "./tcg/card-layout";
import { tcgPrintingReferenceValue } from "./tcg/market";
import type { TcgHudState, TcgLocation, TcgMatchAction, TcgPublicMatchPlayer, TcgTradeAsset } from "./tcg/types";
import { GUILDS, GUILD_QUESTS, promotionEligibility, questProgress, type GuildBookState, type GuildId } from "./guilds";

type CardforgeTab = "binder" | "dex" | "decks" | "packs" | "market" | "battle" | "exchange" | "guilds" | "rules";

type CardforgePanelProps = Readonly<{
  state: TcgHudState;
  guildBook: GuildBookState;
  initialTab?: CardforgeTab;
  walletBalance: string;
  onClose: () => void;
  onStartTutorial: () => void;
  onClaimStarter: () => void;
  onOpenPack: (batchId: string) => void;
  onMoveCards: (printingId: string, count: number, from: TcgLocation, to: TcgLocation) => void;
  onArchiveDuplicates: () => void;
  onUpgradeArchive: () => void;
  onWithdrawLoose: (printingId: string, count: number) => void;
  onSaveDeck: (input: Readonly<{ id?: string; name: string; printingIds: readonly string[]; format?: "open" | "core" }>) => void;
  onSetActiveDeck: (deckId: string) => void;
  onStartNpcMatch: (opponentId: string) => void;
  onMatchAction: (matchId: string, action: TcgMatchAction, expectedRevision: number) => void;
  onBuy: (entryId: string, quantity: number) => void;
  onSell: (printingId: string, quantity: number, location: TcgLocation) => void;
  onTrade: (recipientId: string, assets: readonly TcgTradeAsset[]) => void;
  onTradeResponse: (tradeId: string, accept: boolean) => void;
  onChallenge: (recipientId: string) => void;
  onChallengeResponse: (challengeId: string, accept: boolean) => void;
  onJoinGuild: (guildId: GuildId) => void;
  onStartGuildQuest: (questId: string) => void;
  onResolveGuildQuest: (questId: string, outcomeId: string) => void;
  onPromoteGuild: (guildId: GuildId) => void;
}>;

const titleCase = (value: string) => value.replace(/-/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());

function CardArt({ printingId, compact = false }: Readonly<{ printingId: string; compact?: boolean }>) {
  const printing = TCG_CATALOG.printings[printingId];
  const definition = printing ? TCG_CATALOG.definitions[printing.cardDefinitionId] : null;
  if (!printing || !definition) return null;
  const layout = layoutTcgCard(definition, printing);
  const portrait = printing.illustrationKey.startsWith("/") ? printing.illustrationKey : null;
  const fullArt = printing.variant === "full-art" && portrait;
  return (
    <article className={`cardforge-card rarity-${definition.rarity} variant-${printing.variant} finish-${printing.finish}${compact ? " compact" : ""}`} title={definition.abilities.map((ability) => ability.text).join(" ")}>
      {fullArt && <>
        {/* Reviewed production art is immutable per printing; card text and layout remain deterministic DOM overlays. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cardforge-full-art-bg" src={fullArt} alt="" draggable={false} loading="lazy" decoding="async" />
      </>}
      <header><span>{definition.cost}</span><b>{definition.name}</b><em>{printing.collectorNumber}</em></header>
      <div className="cardforge-illustration">
        {!fullArt && portrait ? <>
          {/* Stable local creature portraits are already tiny SVG assets; image optimization would add indirection without reducing payload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portrait} alt="" draggable={false} loading="lazy" decoding="async" />
        </> : !fullArt && <span aria-hidden="true">{definition.class === "technique" ? "✦" : definition.class === "relic" ? "◆" : "⌂"}</span>}
      </div>
      <div className="cardforge-type-line">{titleCase(definition.class)} · {definition.primaryType ? titleCase(definition.primaryType) : "Neutral"}</div>
      {!compact && <div className="cardforge-rules">
        {definition.keywords.length > 0 && <strong>{definition.keywords.map(titleCase).join(" · ")}</strong>}
        {definition.abilities.map((ability) => <p key={ability.id}>{ability.text}</p>)}
        {definition.flavorText && <i>{definition.flavorText}</i>}
      </div>}
      <footer>
        <span>{titleCase(definition.rarity)} · {titleCase(printing.variant)}{printing.finish !== "standard" ? ` · ${titleCase(printing.finish)}` : ""}</span>
        {(definition.power !== undefined || definition.guard !== undefined) && <b>{definition.power ?? 0}/{definition.guard ?? 0}</b>}
      </footer>
      <span className="cardforge-layout-proof" aria-hidden="true">layout-v{layout.version}</span>
    </article>
  );
}

function MatchPlayer({ player, active, own }: Readonly<{
  player: TcgPublicMatchPlayer;
  active: boolean;
  own: boolean;
}>) {
  if (!player) return null;
  return (
    <section className={`cardforge-match-player${active ? " active" : ""}`}>
      <header><b>{player.displayName}</b><span>{player.resolve} Resolve</span><span>{player.energy}/{player.maxEnergy} Energy</span></header>
      <div className="cardforge-board">
        {player.board.map((card, index) => <div key={card?.instanceId ?? `empty-${index}`} className="cardforge-board-slot">
          {card ? <CardArt printingId={card.printingId} compact /> : <span>Open lane</span>}
        </div>)}
      </div>
      <footer><span>{player.deckCount} deck</span><span>{player.handCount} hand</span><span>{player.discardCount} discard</span>{own && <strong>Your side</strong>}</footer>
    </section>
  );
}

export function CardforgePanel(props: CardforgePanelProps) {
  const { state } = props;
  const [tab, setTab] = useState<CardforgeTab>(state.activeMatch ? "battle" : props.initialTab ?? "binder");
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("all");
  const [cardClass, setCardClass] = useState("all");
  const [setId, setSetId] = useState("all");
  const [variant, setVariant] = useState("all");
  const [finish, setFinish] = useState("all");
  const [ownership, setOwnership] = useState<"all" | "owned" | "missing">("all");
  const [sort, setSort] = useState<"name" | "rarity" | "owned" | "set" | "value" | "newest">("name");
  const [selectedPrintingId, setSelectedPrintingId] = useState<string | null>(null);
  const [mulliganIndexes, setMulliganIndexes] = useState<number[]>([]);
  const activeDeck = state.player.decks.find((deck) => deck.id === state.player.activeDeckId) ?? state.player.decks[0] ?? null;
  const [deckId, setDeckId] = useState<string | undefined>(activeDeck?.id);
  const [deckName, setDeckName] = useState(activeDeck?.name ?? "New Cardforge Deck");
  const [deckCards, setDeckCards] = useState<string[]>(activeDeck ? [...activeDeck.printingIds] : []);
  const [tradeRecipient, setTradeRecipient] = useState(state.peers[0]?.id ?? "");
  const [tradeCount, setTradeCount] = useState(1);
  const archivedTotal = totalTcgArchived(state.player);
  const archiveCapacity = TCG_ARCHIVE_CAPACITY[state.player.archiveTier];
  const archiveUpgradePrice = state.player.archiveTier === 1 ? TCG_ARCHIVE_UPGRADE_PRICE[1]
    : state.player.archiveTier === 2 ? TCG_ARCHIVE_UPGRADE_PRICE[2] : null;

  const collectionRows = useMemo(() => Object.entries(state.player.holdings).flatMap(([printingId, holding]) => {
    const printing = TCG_CATALOG.printings[printingId];
    const definition = printing ? TCG_CATALOG.definitions[printing.cardDefinitionId] : null;
    return definition ? [{ printingId, holding, printing, definition, total: holding.physical + holding.archived }] : [];
  }).filter(({ definition, printing }) => (rarity === "all" || definition.rarity === rarity)
    && (cardClass === "all" || definition.class === cardClass)
    && (setId === "all" || printing.setId === setId)
    && (variant === "all" || printing.variant === variant)
    && (finish === "all" || printing.finish === finish)
    && (!query.trim() || tcgCardSearchText(definition, printing).includes(query.trim().toLowerCase())))
    .sort((left, right) => {
      if (sort === "rarity") return TCG_RARITY_ORDER.indexOf(right.definition.rarity) - TCG_RARITY_ORDER.indexOf(left.definition.rarity) || left.definition.name.localeCompare(right.definition.name);
      if (sort === "owned") return right.total - left.total || left.definition.name.localeCompare(right.definition.name);
      if (sort === "set") return left.printing.setId.localeCompare(right.printing.setId) || left.printing.collectorNumber.localeCompare(right.printing.collectorNumber);
      if (sort === "value") return tcgPrintingReferenceValue(right.printing) - tcgPrintingReferenceValue(left.printing) || left.definition.name.localeCompare(right.definition.name);
      if (sort === "newest") return (state.player.dex[right.definition.id]?.lastAcquiredAt ?? 0) - (state.player.dex[left.definition.id]?.lastAcquiredAt ?? 0);
      return left.definition.name.localeCompare(right.definition.name);
    }), [state.player.holdings, state.player.dex, query, rarity, cardClass, setId, variant, finish, sort]);

  const dexRows = useMemo(() => TCG_CATALOG.definitionOrder.map((definitionId) => {
    const definition = TCG_CATALOG.definitions[definitionId];
    const printings = (TCG_CATALOG.printingsByDefinition[definitionId] ?? []).map((id) => TCG_CATALOG.printings[id]);
    return { definition, dex: state.player.dex[definitionId], printings };
  }).filter(({ definition, dex, printings }) => (rarity === "all" || definition.rarity === rarity)
    && (cardClass === "all" || definition.class === cardClass)
    && (ownership === "all" || (ownership === "owned") === Boolean(dex?.everOwned))
    && (setId === "all" || printings.some((printing) => printing.setId === setId))
    && (variant === "all" || printings.some((printing) => printing.variant === variant))
    && (finish === "all" || printings.some((printing) => printing.finish === finish))
    && (!query.trim() || printings.some((printing) => tcgCardSearchText(definition, printing).includes(query.trim().toLowerCase()))))
    .sort((left, right) => {
      if (sort === "rarity") return TCG_RARITY_ORDER.indexOf(right.definition.rarity) - TCG_RARITY_ORDER.indexOf(left.definition.rarity) || left.definition.name.localeCompare(right.definition.name);
      if (sort === "owned") return (right.dex?.acquiredCount ?? 0) - (left.dex?.acquiredCount ?? 0) || left.definition.name.localeCompare(right.definition.name);
      if (sort === "set") return (left.printings[0]?.collectorNumber ?? "").localeCompare(right.printings[0]?.collectorNumber ?? "");
      if (sort === "value") return tcgPrintingReferenceValue(right.printings[0]) - tcgPrintingReferenceValue(left.printings[0]);
      if (sort === "newest") return (right.dex?.lastAcquiredAt ?? 0) - (left.dex?.lastAcquiredAt ?? 0);
      return left.definition.name.localeCompare(right.definition.name);
    }), [state.player.dex, query, rarity, cardClass, ownership, setId, variant, finish, sort]);
  const setCompletion = useMemo(() => Object.values(TCG_SETS).map((set) => {
    const definitions = new Set(TCG_CATALOG.printingOrder
      .filter((id) => TCG_CATALOG.printings[id].setId === set.id)
      .map((id) => TCG_CATALOG.printings[id].cardDefinitionId));
    return {
      ...set,
      owned: [...definitions].filter((definitionId) => state.player.dex[definitionId]?.everOwned).length,
      total: definitions.size,
    };
  }), [state.player.dex]);

  const validation = useMemo(() => validateTcgDeck(deckCards, state.player), [deckCards, state.player]);
  const selectedRow = selectedPrintingId ? collectionRows.find((row) => row.printingId === selectedPrintingId) ?? null : null;
  const ownIndex = state.activeMatch?.viewerPlayerIndex ?? 0;
  const ownMatchPlayer = state.activeMatch?.players[ownIndex];
  const opponentMatchPlayer = state.activeMatch?.players[ownIndex === 0 ? 1 : 0];
  const opponentHasGuard = opponentMatchPlayer?.board.some((card) => card && tcgDefinitionForPrinting(card.printingId)?.keywords.includes("guard")) ?? false;

  const loadDeck = (id: string) => {
    const deck = state.player.decks.find((entry) => entry.id === id);
    if (!deck) return;
    setDeckId(deck.id);
    setDeckName(deck.name);
    setDeckCards([...deck.printingIds]);
  };

  const addToDeck = (printingId: string) => {
    if (deckCards.length >= 30) return;
    setDeckCards((current) => [...current, printingId]);
  };

  const playCard = (handIndex: number) => {
    if (!state.activeMatch) return;
    const definition = tcgDefinitionForPrinting(ownMatchPlayer?.hand?.[handIndex]?.printingId ?? "");
    const boardSlot = ownMatchPlayer?.board.findIndex((card) => card === null) ?? -1;
    const opponent = state.activeMatch.players[ownIndex === 0 ? 1 : 0];
    const effect = definition?.abilities.find((ability) => ability.trigger === "play")?.effect;
    const targetBoardSlot = effect?.kind === "damage" && effect.target !== "enemy-resolve"
      ? opponent.board.findIndex(Boolean)
      : ownMatchPlayer?.board.findIndex(Boolean);
    props.onMatchAction(state.activeMatch.id, {
      kind: "play",
      handIndex,
      ...(definition && ["creature", "character"].includes(definition.class) && boardSlot >= 0 ? { boardSlot } : {}),
      ...(targetBoardSlot !== undefined && targetBoardSlot >= 0 ? { targetBoardSlot } : {}),
    }, state.activeMatch.revision);
  };

  return (
    <section className="menu-overlay cardforge-overlay" aria-label="Cardforge trading card game">
      <div className="cardforge-shell">
        <header className="cardforge-masthead">
          <div><small>BLOCKWILD TRADING CARD GAME</small><h2>Cardforge</h2><p>Physical case · duplicate-aware Card Dex · Waygrid binder</p></div>
          <div className="cardforge-wallet"><small>GOLD</small><b>{props.walletBalance}</b><button onClick={props.onClose} aria-label="Close Cardforge">×</button></div>
        </header>
        <nav className="cardforge-tabs" aria-label="Cardforge sections">
          {(["binder", "dex", "decks", "packs", "market", "battle", "exchange", "guilds", "rules"] as const).map((entry) => (
            <button key={entry} className={tab === entry ? "active" : ""} onClick={() => setTab(entry)}>
              {titleCase(entry)}{entry === "packs" && state.packBatches.length ? ` (${state.packBatches.reduce((sum, batch) => sum + batch.quantity - batch.nextIndex, 0)})` : ""}
            </button>
          ))}
        </nav>

        {!state.player.tutorial.starterClaimed && <aside className="cardforge-starter">
          <div><b>Your first Waytable seat is ready.</b><p>{state.player.tutorial.tutorialCompleted
            ? "Your lesson is recorded. Claim the one-time legal starter collection."
            : "Play a rewardless lesson with immutable loaner decks. Finishing without conceding awards one legal starter deck, a Cardforge Case, and two boosters."}</p></div>
          <button onClick={state.player.tutorial.tutorialCompleted ? props.onClaimStarter : props.onStartTutorial}>
            {state.player.tutorial.tutorialCompleted ? "Claim Starter Kit" : "Start Teaching Match"}
          </button>
        </aside>}
        {state.recoveryIssues.length > 0 && <aside className="cardforge-recovery" role="status">
          <b>Cardforge recovery report</b>
          <span>{state.recoveryIssues.length} invalid or ambiguous record{state.recoveryIssues.length === 1 ? "" : "s"} were quarantined or cancelled. No replacement value was issued.</span>
          <details><summary>Diagnostic IDs</summary><code>{state.recoveryIssues.join("\n")}</code></details>
        </aside>}

        {(tab === "binder" || tab === "dex") && <div className="cardforge-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, type, set, trait…" aria-label="Search Cardforge collection" />
          <select value={rarity} onChange={(event) => setRarity(event.target.value)} aria-label="Filter by rarity">
            <option value="all">All rarities</option>{TCG_RARITY_ORDER.map((entry) => <option key={entry} value={entry}>{titleCase(entry)}</option>)}
          </select>
          <select value={cardClass} onChange={(event) => setCardClass(event.target.value)} aria-label="Filter by card class">
            <option value="all">All classes</option>{["creature", "character", "technique", "relic", "place"].map((entry) => <option key={entry} value={entry}>{titleCase(entry)}</option>)}
          </select>
          <select value={setId} onChange={(event) => setSetId(event.target.value)} aria-label="Filter by set">
            <option value="all">All sets</option>{Object.values(TCG_SETS).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <select value={variant} onChange={(event) => setVariant(event.target.value)} aria-label="Filter by variant">
            <option value="all">All variants</option>{["standard", "showcase", "full-art", "capture", "boss-signature", "promo"].map((entry) => <option key={entry} value={entry}>{titleCase(entry)}</option>)}
          </select>
          <select value={finish} onChange={(event) => setFinish(event.target.value)} aria-label="Filter by finish">
            <option value="all">All finishes</option>{["standard", "foil", "etched", "signature"].map((entry) => <option key={entry} value={entry}>{titleCase(entry)}</option>)}
          </select>
          {tab === "dex" && <select value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)} aria-label="Filter by discovery">
            <option value="all">Owned + missing</option><option value="owned">Owned</option><option value="missing">Missing</option>
          </select>}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort collection">
            <option value="name">Name</option><option value="rarity">Rarity</option><option value="owned">Owned count</option><option value="set">Collector number</option><option value="value">Reference value</option><option value="newest">Newest acquired</option>
          </select>
          {tab === "binder" && <button onClick={props.onArchiveDuplicates}>Archive duplicates above deck need</button>}
        </div>}

        {tab === "binder" && <main className="cardforge-collection-layout">
          <div className="cardforge-card-grid">
            {collectionRows.length === 0 && <div className="cardforge-empty">No cards match this view. Packs and captures add physical copies; archive them to the Waygrid without losing duplicates.</div>}
            {collectionRows.map(({ printingId, holding, total, definition }) => <button key={printingId} className={`cardforge-card-button${selectedPrintingId === printingId ? " selected" : ""}`} onClick={() => setSelectedPrintingId(printingId)}>
              <CardArt printingId={printingId} compact />
              <span><b>×{total}</b><em>{holding.physical} case · {holding.archived} archived</em></span>
              <small>{definition.name}</small>
            </button>)}
          </div>
          <aside className="cardforge-inspector">
            <div className="cardforge-archive-capacity">
              <b>Waygrid archive tier {state.player.archiveTier}</b>
              <span>{archivedTotal.toLocaleString()} / {archiveCapacity.toLocaleString()} copies</span>
              <progress max={archiveCapacity} value={archivedTotal} aria-label="Card archive capacity" />
              {archiveUpgradePrice !== null && <button disabled={BigInt(props.walletBalance) < BigInt(archiveUpgradePrice)} onClick={props.onUpgradeArchive}>
                Upgrade to tier {state.player.archiveTier + 1} · {archiveUpgradePrice}g
              </button>}
            </div>
            {selectedRow ? <>
              <CardArt printingId={selectedRow.printingId} />
              <div className="cardforge-custody">
                <b>Custody</b><span>{selectedRow.holding.physical} physical · {selectedRow.holding.archived} archived</span>
                <button disabled={selectedRow.holding.physical <= 0} onClick={() => props.onMoveCards(selectedRow.printingId, 1, "physical", "archived")}>Archive one</button>
                <button disabled={selectedRow.holding.archived <= 0} onClick={() => props.onMoveCards(selectedRow.printingId, 1, "archived", "physical")}>Withdraw one</button>
                <button disabled={selectedRow.holding.physical <= 0} onClick={() => props.onWithdrawLoose(selectedRow.printingId, 1)}>Make loose card token</button>
                <button onClick={() => addToDeck(selectedRow.printingId)}>Add to deck</button>
                <button disabled={!state.merchant || selectedRow.holding.physical <= 0} onClick={() => props.onSell(selectedRow.printingId, 1, "physical")}>Sell physical</button>
              </div>
            </> : <div className="cardforge-empty">Select a printing to inspect its rules, layout, custody, and deck actions.</div>}
          </aside>
        </main>}

        {tab === "dex" && <main className="cardforge-dex">
          <header><b>{Object.values(state.player.dex).filter((entry) => entry.everOwned).length}/{TCG_CATALOG.definitionOrder.length} discovered</b><span>Duplicate copies and every finish remain visible in the binder.</span></header>
          <nav className="cardforge-set-progress" aria-label="Set completion">
            {setCompletion.map((set) => <button key={set.id} onClick={() => setSetId(set.id)} aria-label={`Filter to ${set.name}`}>
              <b>{set.symbol} {set.name}</b><span>{set.owned}/{set.total}</span>
            </button>)}
          </nav>
          <div>{dexRows.map(({ definition, dex }) => (
            <article key={definition.id} className={dex?.everOwned ? "known" : "unknown"}>
              <span>{dex?.everOwned ? "◆" : "?"}</span><div><b>{dex?.everOwned ? definition.name : "Undiscovered card"}</b><small>{titleCase(definition.class)} · {titleCase(definition.rarity)}</small></div>
              <em>{dex ? `${dex.acquiredCount} acquired · ${dex.variantsSeen.length} variants · ${dex.finishesSeen.length} finishes` : "No record"}</em>
            </article>))}
          </div>
        </main>}

        {tab === "decks" && <main className="cardforge-decks">
          <aside><button onClick={() => { setDeckId(undefined); setDeckName("New Cardforge Deck"); setDeckCards([]); }}>+ New deck</button>
            {state.player.decks.map((deck) => <button key={deck.id} className={deck.id === deckId ? "active" : ""} onClick={() => loadDeck(deck.id)}>
              <b>{deck.name}</b><small>{deck.printingIds.length}/30 · {deck.format}{deck.id === state.player.activeDeckId ? " · active" : ""}</small>
            </button>)}
          </aside>
          <section>
            <header><input value={deckName} onChange={(event) => setDeckName(event.target.value.slice(0, 48))} aria-label="Deck name" />
              <span className={validation.valid ? "valid" : "invalid"}>{deckCards.length}/30 · {validation.valid ? "Legal" : validation.errors[0] ?? "Incomplete"}</span>
              <button disabled={!validation.valid} onClick={() => props.onSaveDeck({ id: deckId, name: deckName, printingIds: deckCards, format: "core" })}>Save deck</button>
              {deckId && <button disabled={!validation.valid || deckId === state.player.activeDeckId} onClick={() => props.onSetActiveDeck(deckId)}>Make active</button>}
            </header>
            <div className="cardforge-deck-list">{deckCards.map((printingId, index) => {
              const definition = tcgDefinitionForPrinting(printingId);
              return <button key={`${printingId}-${index}`} onClick={() => setDeckCards((cards) => cards.filter((_, cardIndex) => cardIndex !== index))}>
                <span>{definition?.cost ?? 0}</span><b>{definition?.name ?? printingId}</b><em>{definition ? titleCase(definition.class) : "Unknown"} · remove</em>
              </button>;
            })}</div>
            <div className="cardforge-deck-pool">{collectionRows.map(({ printingId, total, definition }) => <button key={printingId} onClick={() => addToDeck(printingId)} disabled={deckCards.length >= 30}>
              <span>{definition.cost}</span><b>{definition.name}</b><em>owned {total}</em>
            </button>)}</div>
          </section>
        </main>}

        {tab === "packs" && <main className="cardforge-packs">
          {state.lastPackReveal && <section className="cardforge-pack-reveal" aria-label="Latest Cardforge pack reveal">
            <header><b>Latest committed reveal</b><span>Least to most rare · batch {state.lastPackReveal.batchId.slice(-8)}</span></header>
            <div>{state.lastPackReveal.printingIds.map((printingId, index) => {
              const printing = TCG_CATALOG.printings[printingId];
              const holding = state.player.holdings[printingId];
              const dex = printing ? state.player.dex[printing.cardDefinitionId] : null;
              return <article key={`${printingId}-${index}`}>
                <CardArt printingId={printingId} compact />
                <small>{dex?.acquiredCount === 1 ? "New" : "Owned"} · {holding ? holding.physical + holding.archived : 0} total · {titleCase(printing?.variant ?? "standard")} · {titleCase(printing?.finish ?? "standard")}</small>
              </article>;
            })}</div>
          </section>}
          {state.packBatches.length === 0 ? <div className="cardforge-empty">No sealed boosters. Town stock, dungeon vaults, bosses, and Waytable wins can add more.</div> : state.packBatches.map((batch) => {
            const product = TCG_CATALOG.packs[batch.productId];
            return <article key={batch.id}><div className="cardforge-pack-art" aria-hidden="true">◆<span>5+</span></div><div><b>{product?.name ?? batch.productId}</b><p>{batch.source}</p><small>{batch.quantity - batch.nextIndex} sealed · deterministic batch #{batch.id.slice(-8)}</small></div><button onClick={() => props.onOpenPack(batch.id)}>Open next pack</button></article>;
          })}
          <aside><b>Published collation</b><p>Three common-biased slots, one uncommon-plus slot, and one rare-plus slot. Foils replace a standard printing without changing rarity. A 1.5% Wildlight pocket adds one Full Art bonus; it never replaces a base slot and reveals last.</p></aside>
        </main>}

        {tab === "market" && <main className="cardforge-market">
          <header><div><b>{state.merchant ? "Town Card Counter" : "No card merchant in reach"}</b><p>Stock is deterministic for this merchant and refreshes every two world days. Sales return 30% reference value.</p></div><span>{props.walletBalance} gold</span></header>
          <div>{state.merchant?.entries.map((entry) => {
            const product = entry.kind === "pack" ? TCG_CATALOG.packs[entry.productId] : null;
            const definition = entry.kind === "card" ? tcgDefinitionForPrinting(entry.printingId) : null;
            return <article key={entry.id}>
              {entry.kind === "card" ? <CardArt printingId={entry.printingId} compact /> : <div className="cardforge-pack-art">◆<span>5</span></div>}
              <div><b>{product?.name ?? definition?.name ?? entry.id}</b><small>{entry.quantity} in stock · {entry.tags.slice(0, 3).map(titleCase).join(" · ")}</small></div>
              <button disabled={entry.quantity <= 0 || BigInt(props.walletBalance) < BigInt(entry.unitPrice)} onClick={() => props.onBuy(entry.id, 1)}>{entry.unitPrice}g · Buy</button>
            </article>;
          }) ?? <div className="cardforge-empty">Open Cardforge near a town resident or merchant to see local stock.</div>}</div>
        </main>}

        {tab === "battle" && <main className="cardforge-battle">
          {!state.activeMatch ? <>
            <header><b>{state.settlementName ? `${state.settlementName} Waytables` : "Town Waytables"}</b><p>Matches are first to reduce opposing Resolve to zero. Mulligan once, gain one maximum Energy per turn, play to three lanes, and respect Guard before direct attacks.</p><small>{state.challengerStatus}</small></header>
            <div className="cardforge-opponents">{state.opponents.map((opponent) => <article key={opponent.id}>
              <span>{opponent.difficulty}</span><div><b>{opponent.name}</b><small>{opponent.title} · {opponent.rewardGold}g first-principled reward</small><p>{opponent.themeTags.map(titleCase).join(" · ")}</p></div>
              <button onClick={() => props.onStartNpcMatch(opponent.id)}>Challenge</button>
            </article>)}{state.opponents.length === 0 && <div className="cardforge-empty">{state.challengerStatus}</div>}</div>
          </> : <>
            <header><b>Match {state.activeMatch.id.slice(-8)}</b><span>Turn {state.activeMatch.turn} · {titleCase(state.activeMatch.phase)} · revision {state.activeMatch.revision}{state.activeMatch.turnDeadlineAt ? " · 90s network clock active" : ""}</span></header>
            <MatchPlayer player={state.activeMatch.players[ownIndex === 0 ? 1 : 0]} active={state.activeMatch.activePlayerIndex !== ownIndex} own={false} />
            <MatchPlayer player={state.activeMatch.players[ownIndex]} active={state.activeMatch.activePlayerIndex === ownIndex} own />
            {state.activeMatch.phase === "mulligan" && <div className="cardforge-hand">
              {ownMatchPlayer?.hand?.filter((card) => !card.generated).map((card, index) => <button key={card.instanceId} className={mulliganIndexes.includes(index) ? "selected" : ""} aria-pressed={mulliganIndexes.includes(index)} onClick={() => setMulliganIndexes((current) => current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index])}><CardArt printingId={card.printingId} compact /><span>{mulliganIndexes.includes(index) ? "Will replace" : "Keep"}</span></button>)}
              <div className="cardforge-match-actions"><button onClick={() => props.onMatchAction(state.activeMatch!.id, { kind: "mulligan", handIndexes: mulliganIndexes }, state.activeMatch!.revision)}>{mulliganIndexes.length > 0 ? `Replace ${mulliganIndexes.length}` : "Keep all"}</button></div>
            </div>}
            {state.activeMatch.phase === "playing" && <div className="cardforge-hand">
              {ownMatchPlayer?.hand?.map((card, index) => <button key={card.instanceId} disabled={state.activeMatch!.activePlayerIndex !== ownIndex || (tcgDefinitionForPrinting(card.printingId)?.cost ?? 99) > ownMatchPlayer.energy} onClick={() => playCard(index)}><CardArt printingId={card.printingId} compact /><span>Play</span></button>)}
              <div className="cardforge-match-actions">
                {ownMatchPlayer?.board.map((card, index) => card && <div key={card.instanceId} className="cardforge-attacker-actions">
                  <b>{tcgDefinitionForPrinting(card.printingId)?.name}</b>
                  <button disabled={state.activeMatch!.activePlayerIndex !== ownIndex || card.exhausted || opponentHasGuard} onClick={() => props.onMatchAction(state.activeMatch!.id, { kind: "attack", boardSlot: index, target: "resolve" }, state.activeMatch!.revision)}>Attack Resolve</button>
                  {opponentMatchPlayer?.board.map((target, targetBoardSlot) => target && <button key={target.instanceId} disabled={state.activeMatch!.activePlayerIndex !== ownIndex || card.exhausted || (opponentHasGuard && !tcgDefinitionForPrinting(target.printingId)?.keywords.includes("guard"))} onClick={() => props.onMatchAction(state.activeMatch!.id, { kind: "attack", boardSlot: index, target: "being", targetBoardSlot }, state.activeMatch!.revision)}>Attack {tcgDefinitionForPrinting(target.printingId)?.name}</button>)}
                </div>)}
                <button disabled={state.activeMatch.activePlayerIndex !== ownIndex} onClick={() => props.onMatchAction(state.activeMatch!.id, { kind: "end-turn" }, state.activeMatch!.revision)}>End turn</button>
                <button onClick={() => props.onMatchAction(state.activeMatch!.id, { kind: "concede" }, state.activeMatch!.revision)}>Concede</button>
              </div>
            </div>}
            {state.activeMatch.phase === "complete" && <div className="cardforge-result"><b>{state.activeMatch.winnerId === state.player.ownerId ? "Victory" : "Match complete"}</b><p>{titleCase(state.activeMatch.reason ?? "complete")}</p></div>}
            <ol className="cardforge-match-log">{state.activeMatch.log.slice(-8).map((entry) => <li key={`${entry.revision}-${entry.text}`}>{entry.text}</li>)}</ol>
          </>}
        </main>}

        {tab === "exchange" && <main className="cardforge-exchange">
          <section><h3>Peer challenges</h3>{state.peers.length === 0 ? <p>No connected human peers.</p> : state.peers.map((peer) => <article key={peer.id}><b>{peer.name}</b><button onClick={() => props.onChallenge(peer.id)}>Challenge</button></article>)}
            {state.challenges.map((challenge) => <article key={challenge.id}><div><b>{challenge.challengerId === state.player.ownerId ? "Challenge sent" : "Challenge received"}</b><small>{titleCase(challenge.status)} · expires shortly</small></div>{challenge.recipientId === state.player.ownerId && challenge.status === "pending" && <><button onClick={() => props.onChallengeResponse(challenge.id, true)}>Accept</button><button onClick={() => props.onChallengeResponse(challenge.id, false)}>Decline</button></>}</article>)}</section>
          <section><h3>Custody transfer</h3><p>Offers lock the stated physical or archived quantity until accepted, cancelled, or expired. Accepted cards land in the recipient’s archive.</p>
            <select value={tradeRecipient} onChange={(event) => setTradeRecipient(event.target.value)}><option value="">Choose peer</option>{state.peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.name}</option>)}</select>
            <input type="number" min={1} max={4096} value={tradeCount} onChange={(event) => setTradeCount(Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
            <button disabled={!tradeRecipient || !selectedRow || selectedRow.holding.physical < tradeCount} onClick={() => selectedRow && props.onTrade(tradeRecipient, [{ printingId: selectedRow.printingId, count: tradeCount, location: "physical" }])}>Offer selected physical card</button>
            {state.trades.map((trade) => <article key={trade.id}><div><b>{trade.initiatorAssets.map((asset) => `${asset.count}× ${tcgDefinitionForPrinting(asset.printingId)?.name ?? asset.printingId}`).join(", ")}</b><small>{titleCase(trade.status)} · {trade.initiatorId} → {trade.recipientId}</small></div>{trade.status === "open" && <><button onClick={() => props.onTradeResponse(trade.id, true)}>Accept</button><button onClick={() => props.onTradeResponse(trade.id, false)}>Cancel</button></>}</article>)}
          </section>
        </main>}

        {tab === "guilds" && <section className="cardforge-guild-ledgers">
          {(["cardwright", "waytable"] as const).map((guildId) => {
            const definition = GUILDS[guildId];
            const guildState = props.guildBook.guilds[guildId];
            const quests = GUILD_QUESTS.filter((quest) => quest.guildId === guildId);
            const active = quests.find((quest) => guildState.activeQuestIds.includes(quest.id)) ?? null;
            const nextQuest = quests.find((quest) => !guildState.completedQuestIds.includes(quest.id)) ?? null;
            const progress = active ? questProgress(props.guildBook, active.id) : null;
            const promotion = promotionEligibility(props.guildBook, guildId);
            return <article key={guildId}>
              <h3>{definition.name}</h3>
              <p>{definition.purpose}</p>
              <small>{titleCase(guildState.membership)} Â· {guildState.standing} standing Â· {guildState.rankId ? definition.ranks.find((rank) => rank.id === guildState.rankId)?.name : "No rank"}</small>
              {active && progress && <div className="cardforge-guild-progress">
                <b>Chapter {active.number}: {active.name}</b>
                <p>{active.summary}</p>
                <ol>{progress.objectives.map((objective) => <li key={objective.id}>{objective.explanation} <strong>{objective.current}/{objective.target}</strong></li>)}</ol>
                {progress.complete && active.solutionFamilies.map((outcomeId) => <button key={outcomeId} onClick={() => props.onResolveGuildQuest(active.id, outcomeId)}>Resolve: {titleCase(outcomeId)}</button>)}
              </div>}
              {!active && guildState.membership === "invited" && <button onClick={() => props.onJoinGuild(guildId)}>Take the guild oath</button>}
              {!active && ["member", "honored"].includes(guildState.membership) && nextQuest && <button onClick={() => props.onStartGuildQuest(nextQuest.id)}>Start chapter {nextQuest.number}: {nextQuest.name}</button>}
              {promotion.next && <button disabled={!promotion.eligible} title={promotion.missing.join(", ")} onClick={() => props.onPromoteGuild(guildId)}>Promote to {promotion.next.name}</button>}
            </article>;
          })}
        </section>}

        {tab === "guilds" && <main className="cardforge-guilds">
          <article><span>◆</span><div><h3>The Cardwrights’ Hall</h3><p>Collect, archive, trade, and document printings. Hall standing is expressed through Dex completion, variant discovery, and honest custody transfer.</p><ol><li>Claim a case and starter</li><li>Archive ten distinct definitions</li><li>Open each set booster</li><li>Trade without duplication</li><li>Complete a set page</li><li>Authenticate a Wildlight Full Art</li><li>Curate a town counter</li><li>Present the Grand Binder</li></ol></div></article>
          <article><span>⚔</span><div><h3>The Waytable Circuit</h3><p>Build legal decks and defeat authored town opponents before challenging connected keepers. Match logs and revisions are authoritative evidence.</p><ol><li>Finish the tutorial match</li><li>Win with a legal core deck</li><li>Defeat two town styles</li><li>Win after a mulligan</li><li>Use all five card classes</li><li>Win a peer challenge</li><li>Defeat a master opponent</li><li>Claim the Grand Waytable title</li></ol></div></article>
          <aside><b>Card illustration pipeline</b><p>Every printing uses immutable definition text, a stable collector number, and bounded text regions. Standard and Showcase cards retain deterministic creature portraits. The curated Full Art roster uses reviewed generated scenes at <code>/cardforge/full-art/</code> beneath the same deterministic overlays; rules and match state never depend on generated pixels.</p></aside>
        </main>}

        {tab === "rules" && <main className="cardforge-rules-guide">
          <h2>Cardforge field rules</h2>
          <section><h3>Collection and custody</h3><p>Cards belong to this host world. Physical and archived counts are two locations in one host-owned ledger; decks and matches only lock references and never mint copies. Loose Card tokens can move through packs and containers but cannot become world drops. Direct or reciprocal peer offers lock exact assets until both sides commit, cancel, or expire.</p></section>
          <section><h3>Finding cards</h3><p>Your first completed teaching match grants one legal starter, a case, and two boosters. The first eligible capture of each non-sentient species grants one Capture Print. Dungeon vaults, resolved bosses, town stock, guild chapters, and bounded first-win rewards provide the other routes. Repeat captures, copied pack metadata, allied or attuned defeats, and repeated claim IDs grant nothing.</p></section>
          <section><h3>Packs, rarity, and variants</h3><p>Every booster commits five base cards: three common-biased slots, one Uncommon-or-better slot, and one Rare-or-better slot, revealed least to most rare. A 1.5% Wildlight pocket adds a sixth, last-revealed Full Art card without replacing the guaranteed base slots. Common through Legendary describes supply, not a separate power budget. Foil, etched, Showcase, Full Art, Capture, promo, and signature treatments are cosmetic printings of the same rules identity.</p></section>
          <section><h3>Decks and turns</h3><p>Open and Core decks contain 30 cards, at least 12 Beings, no more than four Places, up to three copies per definition, and one copy of Legendary or Prime cards. Each keeper starts at 20 Resolve with five cards and three Being lanes. Mulligan once, gain and refill one more Trail Energy each turn to ten, then play, clash, and end. The first player skips a turn-one draw; the second receives a one-use Trail Spark. Guard must be challenged first, combat is simultaneous, and an empty required draw loses.</p></section>
          <section><h3>Multiplayer trust</h3><p>The host validates revisions, ownership, prices, hidden zones, shuffles, actions, rewards, and escrow. Guests receive only their own hand and public opposing counts. Rejected or stale actions are repaired from a fresh host projection. Friendly play has no wagers or ranked-security claim: the host is authoritative, not an independent tournament server.</p></section>
        </main>}
      </div>
    </section>
  );
}
