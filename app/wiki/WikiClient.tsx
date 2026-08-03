"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { WikiCategory, WikiEntry, WikiIndexEntry } from "../game/wiki-content";
import styles from "./wiki.module.css";

type WikiIndexPayload = Readonly<{
  schema: number;
  categories: Readonly<Record<WikiCategory, number>>;
  entries: readonly WikiIndexEntry[];
}>;
type WikiShard = Readonly<{ schema: number; category: WikiCategory; entries: readonly WikiEntry[] }>;
type CategoryFilter = WikiCategory | "all";

const CATEGORY_META: Readonly<Record<WikiCategory, Readonly<{ label: string; mark: string; description: string }>>> = Object.freeze({
  system: { label: "Field Manual", mark: "I", description: "Rules and ways to play" },
  item: { label: "Items & Recipes", mark: "II", description: "Origins, making, and uses" },
  creature: { label: "Creatures", mark: "III", description: "Ecology and fieldcraft" },
  plant: { label: "Flora", mark: "IV", description: "Growth and harvests" },
  biome: { label: "Biomes", mark: "V", description: "Regions and inhabitants" },
});

function entryCategory(key: string): WikiCategory | null {
  const category = key.split(":", 1)[0] as WikiCategory;
  return category in CATEGORY_META ? category : null;
}

function hrefFor(key: string) {
  return `/wiki?entry=${encodeURIComponent(key)}`;
}

function textMatches(entry: WikiIndexEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [entry.name, entry.eyebrow, entry.summary, ...entry.tags].some((value) => value.toLocaleLowerCase().includes(normalized));
}

function EntryMark({ entry, large = false }: Readonly<{ entry: WikiIndexEntry | WikiEntry; large?: boolean }>) {
  if (large && entry.category === "system") {
    return <span className={`${styles.entryMark} ${styles.entryMarkLarge}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/blockwild-icon-192.png" alt="" />
    </span>;
  }
  if (entry.image) {
    return <span className={`${styles.entryMark} ${large ? styles.entryMarkLarge : ""}`}>
      {/* Canonical production portraits are small local SVGs and stay lazy outside the active article. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={entry.image} alt="" loading={large ? "eager" : "lazy"} decoding="async" />
    </span>;
  }
  const letters = entry.category === "item" ? "IT" : entry.category === "biome" ? "BM" : entry.category === "system" ? "FM" : "BW";
  return <span className={`${styles.entryMark} ${styles.entryMarkType} ${large ? styles.entryMarkLarge : ""}`} aria-hidden="true">{letters}</span>;
}

export default function WikiClient() {
  const [index, setIndex] = useState<WikiIndexPayload | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("system");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("system:getting-started");
  const [selected, setSelected] = useState<WikiEntry | null>(null);
  const [status, setStatus] = useState("Opening the field archive...");
  const shards = useRef(new Map<WikiCategory, readonly WikiEntry[]>());
  const activeResult = useRef<HTMLAnchorElement | null>(null);
  const reader = useRef<HTMLElement | null>(null);

  const loadEntry = useCallback(async (key: string, updateHistory = false) => {
    const targetCategory = entryCategory(key);
    if (!targetCategory) return;
    try {
      let entries = shards.current.get(targetCategory);
      if (!entries) {
        const response = await fetch(`/knowledge/${targetCategory}.json`);
        if (!response.ok) throw new Error(`Archive shard returned ${response.status}`);
        const payload = await response.json() as WikiShard;
        entries = payload.entries;
        shards.current.set(targetCategory, entries);
      }
      const next = entries.find((entry) => entry.key === key) ?? entries[0] ?? null;
      setSelected(next);
      if (next) {
        setSelectedKey(next.key);
        if (updateHistory) window.history.pushState({}, "", hrefFor(next.key));
        setStatus("");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The field archive could not be opened.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/knowledge/index.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Archive index returned ${response.status}`);
        return response.json() as Promise<WikiIndexPayload>;
      })
      .then((payload) => {
        if (!active) return;
        setIndex(payload);
        const requested = new URLSearchParams(window.location.search).get("entry");
        const target = requested && payload.entries.some((entry) => entry.key === requested) ? requested : "system:getting-started";
        const targetCategory = entryCategory(target);
        if (requested && targetCategory) setCategory(targetCategory);
        void loadEntry(target);
      })
      .catch((error) => active && setStatus(error instanceof Error ? error.message : "The field archive could not be opened."));
    const onPopState = () => {
      const requested = new URLSearchParams(window.location.search).get("entry") ?? "system:getting-started";
      const targetCategory = entryCategory(requested);
      if (targetCategory) setCategory(targetCategory);
      void loadEntry(requested);
    };
    window.addEventListener("popstate", onPopState);
    return () => { active = false; window.removeEventListener("popstate", onPopState); };
  }, [loadEntry]);

  const results = useMemo(() => {
    if (!index) return [];
    return index.entries.filter((entry) => (category === "all" || entry.category === category) && textMatches(entry, query));
  }, [category, index, query]);

  const related = useMemo(() => selected && index
    ? selected.relatedKeys.map((key) => index.entries.find((entry) => entry.key === key)).filter((entry): entry is WikiIndexEntry => Boolean(entry)).slice(0, 10)
    : [], [index, selected]);

  useEffect(() => {
    activeResult.current?.scrollIntoView({ block: "nearest" });
    reader.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedKey]);

  const chooseCategory = (next: CategoryFilter) => {
    setCategory(next);
    setQuery("");
    if (next !== "all") {
      const first = index?.entries.find((entry) => entry.category === next);
      if (first) void loadEntry(first.key, true);
    }
  };

  return (
    <div className={styles.workspace}>
      <aside className={styles.categories} aria-label="Wiki sections">
        <div className={styles.archiveLabel}><span>ARCHIVE</span><b>{index?.entries.length ?? "..."}</b><small>maintained entries</small></div>
        <button type="button" className={category === "all" ? styles.activeCategory : ""} onClick={() => chooseCategory("all")}>
          <span className={styles.roman}>ALL</span><b>Search everything</b><small>One index across Blockwild</small>
        </button>
        {(Object.entries(CATEGORY_META) as [WikiCategory, (typeof CATEGORY_META)[WikiCategory]][]).map(([key, meta]) => (
          <button type="button" key={key} className={category === key ? styles.activeCategory : ""} onClick={() => chooseCategory(key)}>
            <span className={styles.roman}>{meta.mark}</span><b>{meta.label}</b><small>{index?.categories[key] ?? "..."} entries - {meta.description}</small>
          </button>
        ))}
        <p className={styles.progressNote}><b>Bestiary stays personal.</b> This public archive explains stable rules; discoveries and hidden field notes still unlock in your character&apos;s Bestiary.</p>
      </aside>

      <section className={styles.indexPanel} aria-label="Wiki index">
        <label className={styles.search}>
          <span>SEARCH THE FIELD ARCHIVE</span>
          <div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Creature, recipe, biome, system..." />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">&#215;</button>}</div>
        </label>
        <div className={styles.resultCount}>{results.length} {results.length === 1 ? "entry" : "entries"}</div>
        <div className={styles.resultList}>
          {results.map((entry) => (
            <a key={entry.key} ref={entry.key === selectedKey ? activeResult : undefined} data-wiki-key={entry.key} href={hrefFor(entry.key)} className={entry.key === selectedKey ? styles.activeResult : ""} onClick={(event) => { event.preventDefault(); void loadEntry(entry.key, true); }}>
              <EntryMark entry={entry} />
              <span><small>{entry.eyebrow}</small><b>{entry.name}</b><p>{entry.summary}</p></span>
            </a>
          ))}
          {!status && !results.length && <p className={styles.empty}>No maintained entry matches that search.</p>}
        </div>
      </section>

      <article ref={reader} className={styles.reader} id="wiki-reader" tabIndex={-1} aria-live="polite">
        {status && <div className={styles.loading}>{status}</div>}
        {selected && <>
          <header className={styles.readerHeader}>
            <EntryMark entry={selected} large />
            <div><span>{selected.eyebrow}</span><h1>{selected.name}</h1><p>{selected.summary}</p></div>
          </header>
          {selected.facts.length > 0 && <dl className={styles.facts}>{selected.facts.map((fact) => <div key={`${fact.label}:${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
          <div className={styles.articleBody}>{selected.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={`${section.heading}:${index}`}>{paragraph}</p>)}</section>)}</div>
          {related.length > 0 && <nav className={styles.related} aria-label="Related wiki entries"><h2>Follow the trail</h2>{related.map((entry) => <a key={entry.key} href={hrefFor(entry.key)} onClick={(event) => { event.preventDefault(); setCategory(entry.category); void loadEntry(entry.key, true); }}><span>{entry.eyebrow}</span><b>{entry.name}</b></a>)}</nav>}
          <div className={styles.articleActions}><button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy article link</button><Link href="/">Return to the game</Link></div>
        </>}
      </article>
    </div>
  );
}
