"use client";

import { useMemo, useState } from "react";
import { GUILDS, GUILD_NPCS, GUILD_QUESTS, guildJoinEligibility, promotionEligibility, questProgress, type GuildBookState, type GuildId } from "./guilds";

export type GuildPanelProps = Readonly<{
  state: GuildBookState;
  onClose: () => void;
  onJoin: (guildId: GuildId) => void;
  onStartQuest: (questId: string) => void;
  onResolveQuest: (questId: string, outcomeId: string) => void;
  onPromote: (guildId: GuildId) => void;
}>;

export function GuildPanel({ state, onClose, onJoin, onStartQuest, onResolveQuest, onPromote }: GuildPanelProps) {
  const ids = Object.keys(GUILDS) as GuildId[];
  const [selected, setSelected] = useState<GuildId>(() => ids.find((id) => state.guilds[id].membership !== "unknown") ?? "waykeeper");
  const guild = GUILDS[selected];
  const player = state.guilds[selected];
  const quests = useMemo(() => GUILD_QUESTS.filter((quest) => quest.guildId === selected), [selected]);
  const people = useMemo(() => GUILD_NPCS.filter((npc) => npc.guildId === selected), [selected]);
  const promotion = promotionEligibility(state, selected);
  const joinEligibility = guildJoinEligibility(state, selected);
  const met = player.membership !== "unknown" || player.hallDiscoveryIds.length > 0;
  const currentRank = guild.ranks.find((rank) => rank.id === player.rankId)?.name ?? "Unsworn";
  const membershipLabel = player.membership === "unknown" && player.hallDiscoveryIds.length > 0 ? "discovered" : player.membership;
  return <section className="menu-overlay guild-overlay" aria-labelledby="guild-panel-title">
    <div className="guild-folio">
      <button type="button" className="panel-close" onClick={onClose} aria-label="Close guild ledger">×</button>
      <header className="guild-folio-header">
        <div><span className="panel-eyebrow">GUILDS OF HEARTHROADS · LIVING LEDGER</span><h2 id="guild-panel-title">{guild.name}</h2><p>{guild.purpose}</p></div>
        <dl><div><dt>Membership</dt><dd>{membershipLabel}</dd></div><div><dt>Rank</dt><dd>{currentRank}</dd></div><div><dt>Standing</dt><dd>{Math.round(player.standing)}</dd></div></dl>
      </header>
      <nav className="guild-tabs" aria-label="Guilds">
        {ids.map((id) => {
          const guildState = state.guilds[id];
          const label = guildState.membership === "unknown" ? (guildState.hallDiscoveryIds.length > 0 ? "DISCOVERED" : "UNMET") : GUILDS[id].ranks.find((rank) => rank.id === guildState.rankId)?.name ?? guildState.membership.toUpperCase();
          return <button type="button" key={id} className={selected === id ? "active" : ""} aria-pressed={selected === id} onClick={() => setSelected(id)}><span>{GUILDS[id].name}</span><small>{label}</small></button>;
        })}
      </nav>
      <div className="guild-folio-body">
        <main>
          <section className="guild-chapter-list" aria-labelledby="guild-campaign-title"><header><div><small>AUTHORED CAMPAIGN</small><h3 id="guild-campaign-title">Eight chapters</h3></div>{joinEligibility.eligible && <button type="button" className="guild-primary" onClick={() => onJoin(selected)}>Take the oath</button>}</header>
            {!met && <p className="guild-missing" role="note">Unmet guild — ledger preview only. {joinEligibility.reason}</p>}
            {met && player.membership !== "member" && player.membership !== "honored" && <p className="guild-missing" role="note">{joinEligibility.reason}</p>}
            {quests.map((quest) => {
              const complete = player.completedQuestIds.includes(quest.id); const active = player.activeQuestIds.includes(quest.id); const progress = active ? questProgress(state, quest.id) : null;
              const previous = quests[quest.number - 2];
              const unlocked = quest.number === 1 || Boolean(previous && player.completedQuestIds.includes(previous.id));
              return <article key={quest.id} className={`${complete ? "complete" : ""} ${active ? "active" : ""}`}>
                <div className="guild-chapter-number">{String(quest.number).padStart(2, "0")}</div>
                <div><h4>{quest.name}</h4><p>{quest.summary}</p><small>{progress?.explanation ?? quest.solutionFamilies.join(" / ")}</small><details><summary>Field brief, consequences, and recovery</summary><p>Giver: {quest.giverId} · Recovery contact: {quest.recoveryGiverId}</p><p>Site: {quest.locationIds.join(", ")} · Encounter: {quest.encounterIds.join(", ")}</p><ul>{quest.objectives.map((entry) => <li key={entry.id}><strong>{entry.explanation}</strong><br /><span>Failure: {entry.failureText}</span><br /><span>Recovery: {entry.recoveryText}</span></li>)}</ul><p>{quest.persistentChange}</p></details></div>
                <div className="guild-chapter-state">{complete ? <b>RECORDED</b> : active && progress?.complete
                  ? <div className="guild-outcome-row" aria-label={`Resolve ${quest.name}`}><small>RECORD A CONSEQUENCE</small>{quest.solutionFamilies.map((outcome) => <button type="button" key={outcome} onClick={() => onResolveQuest(quest.id, outcome)}>{outcome}</button>)}</div>
                  : active ? <b>IN FIELD</b> : <button type="button" disabled={!["member", "honored"].includes(player.membership) || !unlocked} onClick={() => onStartQuest(quest.id)}>Accept</button>}</div>
              </article>;
            })}
          </section>
        </main>
        <aside>
          <section><small>RANK LADDER</small><h3>Demonstrated service</h3><ol className="guild-ranks">{guild.ranks.map((rank) => <li key={rank.id} className={rank.id === player.rankId ? "current" : ""}><span>{rank.name}</span><small>{rank.standing} standing · {rank.demonstrationCount} proofs</small></li>)}</ol>{promotion.next && <button type="button" className="guild-promote" disabled={!promotion.eligible} onClick={() => onPromote(selected)}>Promote to {promotion.next.name}</button>}{promotion.missing.length > 0 && <p className="guild-missing">Still needed: {promotion.missing.join(", ")}.</p>}</section>
          <section><small>PEOPLE, NOT LOADOUTS</small><h3>Hall company</h3>{people.map((person) => <article className="guild-person" key={person.id}><div><strong>{person.name}</strong><small>{person.role}{person.recruitable ? " · RECRUITABLE" : ""}</small></div><p>{person.philosophy}</p><p>{person.personalConcern}</p>{person.recruitCondition && <small>{person.recruitCondition}</small>}{person.companion && <em>{person.companion}</em>}<details><summary>Schedule and recovery</summary><p>{person.homeSchedule.join(" · ")}</p><p>{person.recoveryProtocol}</p></details></article>)}</section>
          <section><small>CHARTER EFFECT</small><h3>{player.doctrineChoiceId ?? "Undecided"}</h3><p>{player.doctrineChoiceId ? "The hall, services, schedules, and repeatable contracts reflect this stored outcome." : `Final choices: ${guild.doctrines.join(", ")}.`}</p></section>
        </aside>
      </div>
    </div>
  </section>;
}
