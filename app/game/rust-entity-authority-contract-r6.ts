export const RUST_ENTITY_AUTHORITY_PROTOCOL_R6_V1 = 1 as const;
export const RUST_ENTITY_COMMAND_SCHEMA_R6_V1 = 1 as const;
export const RUST_ENTITY_SNAPSHOT_SCHEMA_R6_V2 = 2 as const;

export const RUST_ENTITY_MAX_COUNT_R6 = 65_535;
export const RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6 = 4_096;
export const RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6 = 64 * 1_048_576;
export const RUST_ENTITY_MAX_EXTRACTION_BYTES_R6 = 4 * 1_048_576;
export const RUST_ENTITY_MAX_EXTRACTION_RECORDS_R6 = 4_096;

export type RustEntityIdR6 = bigint;
export type RustEntityMapR6<T> = readonly (readonly [string, T])[];
export type RustEntityVec3R6 = Readonly<{ x: number; y: number; z: number }>;
export type RustEntityClassR6 = "creature" | "player" | "sentient" | "construct" | "projectile" | "vehicle";
export type RustEntityResidencyR6 = "hot" | "cold";
export type RustEntitySimulationTierR6 = "hero" | "nearby" | "coarse" | "dormant";
export type RustEntityBodyShapeR6 = "capsule" | "box" | "sphere" | "serpentine" | "flying" | "aquatic";
export type RustEntityMovementModeR6 = "ground" | "swim" | "fly" | "burrow" | "climb" | "mounted" | "knocked-back" | "disabled";
export type RustEntityAiIntentR6 = "idle" | "wander" | "graze" | "flee" | "pursue" | "attack" | "follow" | "work" | "return-home" | "scripted";
export type RustEntityDespawnReasonR6 = "natural-range" | "defeated" | "captured" | "released" | "admin";

export type RustEntityCompatibilityRecordR6 = Readonly<{
  schema: 1;
  externalEntityId: string;
  legacyNumericId: bigint | null;
  specimenId: string;
  kindKey: string;
  class: RustEntityClassR6;
  variantKey: string | null;
  name: string | null;
  locationId: bigint;
  position: RustEntityVec3R6;
  yaw: number;
  velocity: RustEntityVec3R6;
  health: number;
  maximumHealth: number;
  ageTicks: bigint;
  naturalSpawned: boolean;
  everLed: boolean;
  ownerId: string | null;
  tamed: boolean;
  bondPoints: number;
  bondTier: string;
  socialGroupId: string | null;
  factionId: string | null;
  settlementId: string | null;
  equipment: RustEntityMapR6<string>;
  research: RustEntityMapR6<number>;
  custom: RustEntityMapR6<string>;
}>;

export type RustEntityBlackboardValueR6 =
  | Readonly<{ type: "bool"; value: boolean }>
  | Readonly<{ type: "signed"; value: bigint }>
  | Readonly<{ type: "fixed-milli"; value: bigint }>
  | Readonly<{ type: "unsigned"; value: bigint }>
  | Readonly<{ type: "entity"; value: bigint }>
  | Readonly<{ type: "text"; value: string }>
  | Readonly<{ type: "bytes"; value: Uint8Array }>;

export type RustEntityVitalsR6 = Readonly<{
  health: number;
  maximumHealth: number;
  hungerMilli: number;
  saturationMilli: number;
  oxygenMilli: number;
  temperatureMilli: number;
  wetnessMilli: number;
  environmentFlags: number;
  lastDamageTick: bigint;
  lastBreathTick: bigint;
}>;

export type RustEntityActionR6 = Readonly<{
  key: string;
  phase: number;
  startedTick: bigint;
  endsTick: bigint;
  target: RustEntityIdR6 | null;
}>;

export type RustEntityLocomotionR6 = Readonly<{
  shape: RustEntityBodyShapeR6;
  radius: number;
  halfHeight: number;
  mass: number;
  stepHeight: number;
  velocity: RustEntityVec3R6;
  desiredVelocity: RustEntityVec3R6;
  grounded: boolean;
  submerged: boolean;
  movementMode: RustEntityMovementModeR6;
  action: RustEntityActionR6;
  cooldowns: RustEntityMapR6<bigint>;
}>;

export type RustEntityAiStateR6 = Readonly<{
  intent: RustEntityAiIntentR6;
  intentKey: string;
  target: RustEntityIdR6 | null;
  home: RustEntityVec3R6;
  blackboard: RustEntityMapR6<RustEntityBlackboardValueR6>;
  routeEpoch: bigint;
  routeCursor: number;
  route: readonly RustEntityVec3R6[];
  threats: readonly Readonly<{
    entity: RustEntityIdR6;
    scoreMilli: number;
    lastSeenTick: bigint;
    lastKnownCell: readonly [number, number, number];
  }>[];
  decisionDueTick: bigint;
}>;

export type RustEntityComponentsR6 = Readonly<{
  vitals: RustEntityVitalsR6;
  locomotion: RustEntityLocomotionR6;
  ai: RustEntityAiStateR6;
  social: Readonly<{
    groupId: string | null;
    leader: RustEntityIdR6 | null;
    following: RustEntityIdR6 | null;
    herdRank: number;
    dispositionMilli: number;
    preferredSeparation: number;
    lastSocialTick: bigint;
  }>;
  mount: Readonly<{
    parentMount: RustEntityIdR6 | null;
    occupiedSeat: number | null;
    seats: readonly Readonly<{
      index: number;
      role: string;
      offset: RustEntityVec3R6;
      occupant: RustEntityIdR6 | null;
      controlWeightMilli: number;
    }>[];
    saddleKey: string | null;
    acceptsRiders: boolean;
  }>;
  protection: Readonly<{
    flags: bigint;
    firstOwnedTick: bigint | null;
    firstLedTick: bigint | null;
    enclosureVerifiedTick: bigint | null;
    namedTick: bigint | null;
    provenanceKey: string | null;
  }>;
  network: Readonly<{
    ownerPeerId: string | null;
    lastCommandSequence: bigint;
    lastCommandTick: bigint;
    leaseEpoch: bigint;
    leaseExpiresTick: bigint;
  }>;
  care: Readonly<{
    stabilized: boolean;
    nourishmentMilli: number;
    trustMilli: number;
    careStage: number;
    lastCareTick: bigint;
  }> | null;
  husbandry: Readonly<{
    sex: number;
    maturityMilli: number;
    breedCooldownUntilTick: bigint;
    gestationUntilTick: bigint;
    parentSpecimenIds: readonly string[];
  }> | null;
  work: Readonly<{
    taskKey: string;
    progressMilli: number;
    targetEntity: RustEntityIdR6 | null;
    targetCell: readonly [number, number, number] | null;
    carryingItemKey: string | null;
    dueTick: bigint;
  }> | null;
  equipment: RustEntityMapR6<Readonly<{
    itemKey: string;
    count: number;
    durability: number;
    custom: RustEntityMapR6<Uint8Array>;
  }>>;
  dragon: Readonly<{
    lineageKey: string;
    elementKey: string;
    lifeStage: number;
    flightStaminaMilli: number;
    breathChargeMilli: number;
    eggOrHatchling: boolean;
  }> | null;
  legendary: Readonly<{
    encounterKey: string;
    phase: number;
    defeated: boolean;
    captureLockUntilTick: bigint;
    worldFlags: RustEntityMapR6<bigint>;
  }> | null;
  summon: Readonly<{
    originRealmKey: string;
    summonerId: string | null;
    expiresTick: bigint;
    grounded: boolean;
    groundingItemKey: string | null;
  }> | null;
  sentient: Readonly<{
    factionId: string | null;
    settlementId: string | null;
    occupationKey: string;
    dialogueState: RustEntityMapR6<number>;
    reputationMilli: number;
  }> | null;
  unknownExtensions: RustEntityMapR6<Uint8Array>;
}>;

export type RustEntityDormantSummaryR6 = Readonly<{
  sleptAtTick: bigint;
  lastAdvancedTick: bigint;
  careCycles: number;
  breedingCycles: number;
  workCycles: number;
  nextCareTick: bigint;
  nextBreedingTick: bigint;
  nextWorkTick: bigint;
  nextEcologyTick: bigint;
  routeEpoch: bigint;
  populationCostQuarters: number;
}>;

export type RustEntityHotRecordR6 = Readonly<{
  id: RustEntityIdR6;
  record: RustEntityCompatibilityRecordR6;
  components: RustEntityComponentsR6;
  entityRevision: bigint;
  tier: Exclude<RustEntitySimulationTierR6, "dormant">;
  protection: bigint;
  outOfRangeSeconds: number;
  lastSimulatedTick: bigint;
}>;

export type RustEntityColdRecordR6 = Readonly<{
  id: RustEntityIdR6;
  record: RustEntityCompatibilityRecordR6;
  components: RustEntityComponentsR6;
  entityRevision: bigint;
  protection: bigint;
  summary: RustEntityDormantSummaryR6;
}>;

export type RustEntityAuthoritySnapshotR6V2 = Readonly<{
  schema: 2;
  revision: bigint;
  lastSequence: bigint | null;
  slots: readonly Readonly<{ generation: number; residency: RustEntityResidencyR6 | null }>[];
  free: readonly number[];
  hot: readonly RustEntityHotRecordR6[];
  cold: readonly RustEntityColdRecordR6[];
}>;

export type RustEntityExtractionRecordR6V2 = Readonly<{
  entityId: RustEntityIdR6;
  residency: RustEntityResidencyR6;
  class: RustEntityClassR6;
  simulationTier: RustEntitySimulationTierR6;
  protection: bigint;
  externalEntityId: string;
  specimenId: string;
  kindKey: string;
  variantKey: string | null;
  name: string | null;
  modelKey: string;
  position: RustEntityVec3R6;
  yaw: number;
  velocity: RustEntityVec3R6;
  health: number;
  maximumHealth: number;
  tamed: boolean;
}>;

export type RustEntityExtractionR6V2 = Readonly<{
  schema: 2;
  extractionRevision: bigint;
  total: number;
  selected: number;
  omitted: number;
  records: readonly RustEntityExtractionRecordR6V2[];
}>;

export type RustEntityCommandR6 =
  | Readonly<{ type: "spawn"; record: RustEntityCompatibilityRecordR6; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "spawn-typed"; record: RustEntityCompatibilityRecordR6; components: RustEntityComponentsR6; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "spawn-at"; id: RustEntityIdR6; record: RustEntityCompatibilityRecordR6; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "spawn-typed-at"; id: RustEntityIdR6; record: RustEntityCompatibilityRecordR6; components: RustEntityComponentsR6; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "despawn"; id: RustEntityIdR6; reason: RustEntityDespawnReasonR6 }>
  | Readonly<{ type: "hibernate"; id: RustEntityIdR6 }>
  | Readonly<{ type: "wake"; id: RustEntityIdR6; tier: RustEntitySimulationTierR6 }>
  | Readonly<{ type: "update-motion"; id: RustEntityIdR6; position: RustEntityVec3R6; yaw: number; velocity: RustEntityVec3R6 }>
  | Readonly<{ type: "set-simulation-tier"; id: RustEntityIdR6; tier: RustEntitySimulationTierR6 }>
  | Readonly<{ type: "set-protection"; id: RustEntityIdR6; protection: bigint }>
  | Readonly<{ type: "set-vitals-environment"; id: RustEntityIdR6; value: RustEntityVitalsR6 }>
  | Readonly<{ type: "set-locomotion-body"; id: RustEntityIdR6; value: RustEntityLocomotionR6 }>
  | Readonly<{ type: "set-ai-state"; id: RustEntityIdR6; value: RustEntityAiStateR6 }>
  | Readonly<{ type: "set-social-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["social"] }>
  | Readonly<{ type: "set-mount-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["mount"] }>
  | Readonly<{ type: "set-protection-provenance"; id: RustEntityIdR6; value: RustEntityComponentsR6["protection"] }>
  | Readonly<{ type: "set-network-authority"; id: RustEntityIdR6; value: RustEntityComponentsR6["network"] }>
  | Readonly<{ type: "set-care-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["care"] }>
  | Readonly<{ type: "set-husbandry-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["husbandry"] }>
  | Readonly<{ type: "set-work-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["work"] }>
  | Readonly<{ type: "set-equipment"; id: RustEntityIdR6; value: RustEntityComponentsR6["equipment"] }>
  | Readonly<{ type: "set-dragon-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["dragon"] }>
  | Readonly<{ type: "set-legendary-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["legendary"] }>
  | Readonly<{ type: "set-summon-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["summon"] }>
  | Readonly<{ type: "set-sentient-state"; id: RustEntityIdR6; value: RustEntityComponentsR6["sentient"] }>
  | Readonly<{ type: "replace-components"; id: RustEntityIdR6; value: RustEntityComponentsR6 }>
  | Readonly<{ type: "replace-compatibility-record"; id: RustEntityIdR6; value: RustEntityCompatibilityRecordR6 }>
  | Readonly<{ type: "set-range-state"; id: RustEntityIdR6; outOfRangeSeconds: number; lastSimulatedTick: bigint }>
  | Readonly<{ type: "set-dormant-summary"; id: RustEntityIdR6; value: RustEntityDormantSummaryR6 }>;

export type RustEntityCommandBatchR6 = Readonly<{
  schema: 1;
  sequence: bigint;
  expectedRevision: bigint;
  tick: bigint;
  commands: readonly RustEntityCommandR6[];
}>;

export type RustEntityEventKindR6 =
  | Readonly<{ type: "spawned"; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "despawned"; reason: RustEntityDespawnReasonR6 }>
  | Readonly<{ type: "residency-changed"; residency: RustEntityResidencyR6 }>
  | Readonly<{ type: "tier-changed"; tier: RustEntitySimulationTierR6 }>
  | Readonly<{ type: "motion-updated" | "protection-changed" | "vitals-environment-changed" | "locomotion-changed" | "ai-changed" | "social-changed" | "mount-changed" | "network-authority-changed" | "care-changed" | "husbandry-changed" | "work-changed" | "equipment-changed" | "dragon-changed" | "legendary-changed" | "summon-changed" | "sentient-changed" | "components-replaced" | "compatibility-record-changed" | "range-state-changed" | "dormant-summary-changed" }>;

export type RustEntityEventBatchR6 = Readonly<{
  schema: 1;
  sequence: bigint;
  previousRevision: bigint;
  revision: bigint;
  events: readonly Readonly<{
    commandIndex: number;
    entityId: RustEntityIdR6;
    previousEntityRevision: bigint;
    entityRevision: bigint;
    kind: RustEntityEventKindR6;
  }>[];
}>;

type RustEntityRequestBaseR6 = Readonly<{
  protocolVersion: 1;
  schemaVersion: 1;
  requestId: number;
  runtimeEpoch: number;
}>;

export type RustEntityAuthorityRequestR6 =
  | (RustEntityRequestBaseR6 & Readonly<{ type: "entity-initialize-r6-v1"; source: "empty" | "snapshot" | "compatibility"; bytes?: ArrayBuffer }>)
  | (RustEntityRequestBaseR6 & Readonly<{ type: "entity-apply-r6-v1"; batch: RustEntityCommandBatchR6 }>)
  | (RustEntityRequestBaseR6 & Readonly<{ type: "entity-export-snapshot-r6-v1"; expectedRevision: bigint }>)
  | (RustEntityRequestBaseR6 & Readonly<{ type: "entity-replace-snapshot-r6-v1"; expectedRevision: bigint; bytes: ArrayBuffer }>)
  | (RustEntityRequestBaseR6 & Readonly<{ type: "entity-dispose-r6-v1" }>);

type RustEntityResponseBaseR6 = RustEntityRequestBaseR6;

export type RustEntityAuthorityResponseR6 =
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-ready-r6-v1"; revision: bigint; lastSequence: bigint | null; entityCount: number }>)
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-events-r6-v1"; result: RustEntityEventBatchR6 }>)
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-snapshot-r6-v1"; revision: bigint; bytes: ArrayBuffer }>)
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-snapshot-replaced-r6-v1"; previousRevision: bigint; revision: bigint; lastSequence: bigint | null; entityCount: number }>)
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-disposed-r6-v1" }>)
  | (RustEntityResponseBaseR6 & Readonly<{ type: "entity-error-r6-v1"; code: string; message: string; retriable: boolean }>);

export interface RustEntityAuthorityTransportR6 {
  request(request: RustEntityAuthorityRequestR6, transfer?: readonly ArrayBuffer[]): Promise<RustEntityAuthorityResponseR6>;
  dispose(): void;
}

export interface RustEntityAuthorityKernelR6 {
  handle(request: RustEntityAuthorityRequestR6): Promise<RustEntityAuthorityResponseR6>;
  dispose?(): Promise<void> | void;
}
