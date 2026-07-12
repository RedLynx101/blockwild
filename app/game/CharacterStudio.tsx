"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  CHARACTER_COLOR_SWATCHES,
  CHARACTER_RACE_DEFINITIONS,
  CHARACTER_RACES,
  CHARACTER_STARTING_SKILL_POINTS,
  MAX_CHARACTER_PROFILES,
  remainingCharacterSkillPoints,
  type CharacterColorKey,
  type CharacterProfile,
  type CharacterProfileCatalog,
} from "./character-profiles";
import { SKILLS, type SkillId } from "./skills";

type CharacterPatch = Partial<Pick<CharacterProfile, "name" | "appearance" | "startingSkills">>;

export function CharacterStudio({
  catalog,
  profile,
  preview,
  onSelect,
  onCreate,
  onRemove,
  onPatch,
}: {
  catalog: CharacterProfileCatalog;
  profile: CharacterProfile;
  preview: ReactNode;
  onSelect: (profileId: string) => void;
  onCreate: () => void;
  onRemove: (profileId: string) => void;
  onPatch: (profileId: string, patch: CharacterPatch) => void;
}) {
  const [nameDraft, setNameDraft] = useState(profile.name);

  const commitName = () => onPatch(profile.id, { name: nameDraft });
  const updateColor = (key: CharacterColorKey, color: string) => onPatch(profile.id, {
    appearance: { ...profile.appearance, colors: { ...profile.appearance.colors, [key]: color } },
  });
  const updateSkill = (skillId: SkillId, delta: number) => {
    const current = profile.startingSkills[skillId];
    const remaining = remainingCharacterSkillPoints(profile.startingSkills);
    if (delta > 0 && remaining <= 0) return;
    if (delta < 0 && current <= 0) return;
    onPatch(profile.id, { startingSkills: { ...profile.startingSkills, [skillId]: current + delta } });
  };
  const race = CHARACTER_RACE_DEFINITIONS[profile.appearance.race];
  const remaining = remainingCharacterSkillPoints(profile.startingSkills);

  return (
    <section className="character-studio" aria-labelledby="character-studio-title">
      <header>
        <div><span className="panel-eyebrow">SAVED CHARACTERS · {catalog.profiles.length}/{MAX_CHARACTER_PROFILES}</span><strong id="character-studio-title">Trailblazer</strong></div>
        <button type="button" onClick={onCreate} disabled={catalog.profiles.length >= MAX_CHARACTER_PROFILES}>+ NEW</button>
      </header>
      <div className="character-profile-tabs" role="tablist" aria-label="Saved characters">
        {catalog.profiles.map((candidate) => (
          <button type="button" role="tab" aria-selected={candidate.id === profile.id} className={candidate.id === profile.id ? "active" : ""} key={candidate.id} onClick={() => onSelect(candidate.id)}>
            <span style={{ background: candidate.appearance.colors.shirt }} aria-hidden="true" />
            <b>{candidate.name}</b>
            <small>{CHARACTER_RACE_DEFINITIONS[candidate.appearance.race].name}</small>
          </button>
        ))}
      </div>
      <div className="character-studio-workspace">
        <div className="character-studio-preview">
          {preview}
          <span><b>{race.name}</b><small>{profile.appearance.sex === "female" ? "Female" : "Male"} · {race.waterBreathing ? "Water breathing" : "Air breathing"}</small></span>
        </div>
        <div className="character-studio-controls">
          <label className="character-name-field"><span>Name</span><input suppressHydrationWarning value={nameDraft} maxLength={32} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
          <div className="character-core-fields">
            <label><span>Race</span><select value={profile.appearance.race} onChange={(event) => onPatch(profile.id, { appearance: { ...profile.appearance, race: event.target.value as CharacterProfile["appearance"]["race"] } })}>{CHARACTER_RACES.map((raceId) => <option value={raceId} key={raceId}>{CHARACTER_RACE_DEFINITIONS[raceId].name}</option>)}</select></label>
            <fieldset><legend>Sex</legend>{(["male", "female"] as const).map((sex) => <button type="button" key={sex} aria-pressed={profile.appearance.sex === sex} className={profile.appearance.sex === sex ? "active" : ""} onClick={() => onPatch(profile.id, { appearance: { ...profile.appearance, sex } })}>{sex === "male" ? "M" : "F"}</button>)}</fieldset>
          </div>
          <p className="character-race-note">{race.description}{race.homeFaction ? " Native culture starts at +25 alignment." : ""}</p>
          <div className="character-color-editor" aria-label="Character colors">
            {(Object.keys(CHARACTER_COLOR_SWATCHES) as CharacterColorKey[]).map((key) => <div key={key}><span>{key}</span><div>{CHARACTER_COLOR_SWATCHES[key].map((color) => <button type="button" key={color} title={`${key} ${color}`} aria-label={`${key} ${color}`} aria-pressed={profile.appearance.colors[key] === color} className={profile.appearance.colors[key] === color ? "active" : ""} style={{ "--swatch": color } as CSSProperties} onClick={() => updateColor(key, color)} />)}</div></div>)}
          </div>
        </div>
      </div>
      <details className="character-skills-editor">
        <summary><span>Starting aptitudes</span><b>{remaining ? `${remaining} / ${CHARACTER_STARTING_SKILL_POINTS} UNASSIGNED` : `${CHARACTER_STARTING_SKILL_POINTS} / ${CHARACTER_STARTING_SKILL_POINTS} ASSIGNED`}</b></summary>
        <p>These are first-day bonuses for a new character. World progression continues independently.</p>
        <div>{SKILLS.map((skill) => <label key={skill.id} title={skill.description}><span><i style={{ background: skill.accent }} />{skill.name}</span><button type="button" onClick={() => updateSkill(skill.id, -1)} disabled={profile.startingSkills[skill.id] <= 0}>−</button><b>{profile.startingSkills[skill.id]}</b><button type="button" onClick={() => updateSkill(skill.id, 1)} disabled={remaining <= 0}>+</button></label>)}</div>
      </details>
      <footer><span>ID {profile.id.slice(-12).toUpperCase()}</span><button type="button" disabled={catalog.profiles.length <= 1} onClick={() => onRemove(profile.id)}>REMOVE</button></footer>
    </section>
  );
}
