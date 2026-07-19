import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MapPanel } from "../app/game/HearthroadsPanels.tsx";
import { MinimapHud, NavigationHud } from "../app/game/NavigationHud.tsx";
import {
  constrainMapViewState,
  createCartographySession,
  createMapKnowledge,
  createMapViewState,
  ABSOLUTE_MIN_MAP_ZOOM,
  MIN_MAP_ZOOM,
  joinCartographySession,
  mapChunkAtViewportPoint,
  mapChunksInViewport,
  mapSurfaceQuadrantColor,
  mapTerrainPalette,
  mapViewportBounds,
  mapViewportProjection,
  MAP_WATER_SURFACE_COLOR,
  markChunksRendered,
  normalizeMapKnowledge,
  normalizeMapViewState,
  panMapView,
  placeWayshrine,
  shareMapsAtCartographyTable,
  stepMapZoom,
} from "../app/game/map-system.ts";
import { centeredPoiCompassEntry, compassEntries, navigationTargets } from "../app/game/navigation.ts";
import {
  celestialVisibilityThroughClouds,
  cloudCelestialOcclusion,
  cloudDayProfile,
  cloudOpacityTarget,
  createWeatherState,
  planCloudCluster,
  planCloudField,
  planRainColumn,
  rainAmbienceLevel,
  rainOpenColumnFraction,
  stepCloudFade,
  weatherBiomeFromId,
  weatherVisuals,
  type CloudClusterPlan,
  type WeatherState,
} from "../app/game/weather.ts";

test("map migration preserves old saves and records deterministic biome ink", () => {
  const old = normalizeMapKnowledge({
    schema: 1,
    worldId: "old-world",
    playerId: "old-player",
    exploredChunks: ["0,0", "1,0", "bad"],
    chunkBiomes: { "0,0": 1, "1,0": "Sugarplum Vale", "2,0": 6, bad: 9 },
    markers: [],
  });
  assert.deepEqual(old.exploredChunks, ["0,0", "1,0"]);
  assert.deepEqual(old.terrainByChunk, { "0,0": 1, "1,0": "Sugarplum Vale" });
  assert.equal(mapTerrainPalette(old.terrainByChunk["0,0"]).water, true);
  assert.equal(mapTerrainPalette(old.terrainByChunk["1,0"]).fill, "#c46fa5");

  const discovered = markChunksRendered(old, [
    { x: 2, z: -1, biome: 22 },
    { x: 3, z: -1, biome: "Snowcap mountain" },
  ]);
  assert.deepEqual(discovered.exploredChunks, ["0,0", "1,0", "2,-1", "3,-1"]);
  assert.equal(discovered.terrainByChunk["2,-1"], 22);
  assert.equal(mapTerrainPalette(discovered.terrainByChunk["3,-1"]).label, "Snowcap range");
});

test("cartography shares terrain samples without replacing the local sample", () => {
  const left = markChunksRendered(createMapKnowledge("world", "left"), [{ x: 0, z: 0, biome: 3 }]);
  const right = markChunksRendered(createMapKnowledge("world", "right"), [
    { x: 0, z: 0, biome: 21 },
    { x: 4, z: -2, biome: 1 },
  ]);
  const joined = joinCartographySession(createCartographySession("table", "left"), "right");
  assert.equal(joined.joined, true);
  const shared = shareMapsAtCartographyTable(joined.session, "left", left, "right", right);
  assert.equal(shared.ok, true);
  assert.equal(shared.left.terrainByChunk["0,0"], 3, "existing local survey ink wins deterministic conflicts");
  assert.equal(shared.left.terrainByChunk["4,-2"], 1);
  assert.equal(shared.right.terrainByChunk["0,0"], 21);
});

test("map zoom and pan retain the same x/z chunk coordinate system", () => {
  assert.equal(MIN_MAP_ZOOM, 0.5);
  assert.equal(ABSOLUTE_MIN_MAP_ZOOM, 0.1);
  assert.deepEqual(normalizeMapViewState({ schema: 99, zoom: -20, panX: Number.NaN, panZ: Infinity }), createMapViewState());
  const base = { minX: -10, maxX: 10, minZ: -20, maxZ: 20 };
  const zoomed = stepMapZoom(createMapViewState(), 1);
  const moved = panMapView(zoomed, 3, -4);
  const viewport = mapViewportBounds(base, moved);
  assert.equal(viewport.maxX - viewport.minX, 20 / zoomed.zoom);
  assert.equal(viewport.maxZ - viewport.minZ, 40 / zoomed.zoom);
  assert.equal((viewport.minX + viewport.maxX) / 2, 3);
  assert.equal((viewport.minZ + viewport.maxZ) / 2, -4);

  const projection = mapViewportProjection({ minX: -10, maxX: 10, minZ: -20, maxZ: 20 }, 800, 400);
  assert.equal(projection.scale, 10, "both axes share one chunk scale");
  assert.equal(projection.contentWidth, 200);
  assert.equal(projection.contentHeight, 400);
  assert.equal(projection.offsetX, 300, "a narrow map is centered instead of stretched horizontally");
  assert.deepEqual(mapChunkAtViewportPoint(405, 205, { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }, 800, 400), { x: 0, z: 0 });
  assert.equal(mapChunkAtViewportPoint(20, 200, { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }, 800, 400), null);
});

test("map panning is clamped so known terrain cannot be dragged out of the canvas", () => {
  const base = { minX: -10, maxX: 10, minZ: -8, maxZ: 8 };
  assert.deepEqual(constrainMapViewState(base, panMapView(createMapViewState(), 500, -500)), createMapViewState());
  const close = constrainMapViewState(base, panMapView({ ...createMapViewState(), zoom: 4 }, 500, -500));
  assert.equal(close.panX, 7.5);
  assert.equal(close.panZ, -6);
  assert.deepEqual(mapViewportBounds(base, close), { minX: 5, maxX: 10, minZ: -8, maxZ: -4 });
});

test("detailed map sampling gives water precedence and culls offscreen chunks", () => {
  assert.equal(mapSurfaceQuadrantColor(["#777777", "#888888", "#999999", "#aaaaaa"], true), MAP_WATER_SURFACE_COLOR);
  assert.notEqual(mapSurfaceQuadrantColor(["#777777", "#888888", "#999999", "#aaaaaa"], false), MAP_WATER_SURFACE_COLOR);
  assert.deepEqual(
    mapChunksInViewport(["-20,0", "0,0", "1,1", "40,40"], { minX: -1, maxX: 3, minZ: -1, maxZ: 3 }).map((chunk) => chunk.key),
    ["0,0", "1,1"],
  );
});

test("the Wayfinder names only a POI aimed beneath the center notch", () => {
  const focused = centeredPoiCompassEntry([
    { id: "cardinal:N", label: "N", kind: "cardinal", offsetPercent: 50, distance: null, tracked: false, glyph: "N" },
    { id: "poi:off", label: "Old Cairn", kind: "poi", offsetPercent: 56, distance: 20, tracked: false, glyph: "◆" },
    { id: "poi:center", label: "Lantern Piehouse", kind: "poi", offsetPercent: 49.2, distance: 60, tracked: false, glyph: "◆" },
    { id: "player:friend", label: "Trailfriend", kind: "player", offsetPercent: 50, distance: 8, tracked: false, glyph: "●" },
  ]);
  assert.equal(focused?.id, "poi:center");
  assert.equal(centeredPoiCompassEntry([{ id: "poi:off", label: "Old Cairn", kind: "poi", offsetPercent: 56, distance: 20, tracked: false, glyph: "◆" }]), null);
});

test("a tracked destination remains on the HUD at any distance and clamps behind the player to an edge", () => {
  const markers = [{
    id: "manual:far-camp",
    kind: "manual" as const,
    name: "Far Camp",
    position: { x: 0, y: 30, z: 8_000 },
    discoveredAt: 1,
    updatedAt: 1,
    discoveredBy: "player",
    ownerId: "player",
    icon: "pin",
  }];
  const entries = compassEntries(0, { x: 0, y: 30, z: 0 }, navigationTargets(markers, [], "manual:far-camp"));
  const tracked = entries.find((entry) => entry.id === "manual:far-camp");
  assert.ok(tracked);
  assert.equal(tracked.distance, 8_000);
  assert.ok(tracked.edge === "left" || tracked.edge === "right");
  assert.ok(tracked.offsetPercent <= 6 || tracked.offsetPercent >= 94);
  const markup = renderToStaticMarkup(createElement(NavigationHud, {
    headingRadians: 0,
    position: { x: 0, y: 30, z: 0 },
    markers,
    players: [],
    trackedId: "manual:far-camp",
    onTrack: () => undefined,
  }));
  assert.match(markup, /Far Camp/);
  assert.match(markup, /edge-(left|right)/u);
  assert.match(markup, /Far Camp[\s\S]*8,?000m/u);
});

test("map panel renders biome colors, zoom controls, headings, and other players", () => {
  const knowledge = markChunksRendered(createMapKnowledge("world", "local"), [
    { x: 0, z: 0, biome: 3 },
    { x: 1, z: 0, biome: 1 },
    { x: 2, z: 0, biome: 21 },
  ]);
  const markup = renderToStaticMarkup(
    createElement(MapPanel, {
      knowledge,
      currentPosition: { x: 8, y: 40, z: 8 },
      currentHeadingRadians: Math.PI / 2,
      otherPlayers: [{
        id: "friend",
        name: "Trailfriend",
        position: { x: 24, y: 40, z: 8 },
        headingRadians: Math.PI,
        color: "#24a0ed",
      }],
      selectedMarkerId: null,
      onSelectMarker: () => undefined,
      onAddManualMarker: () => undefined,
      onRemoveManualMarker: () => undefined,
      onRenameMarker: () => undefined,
      onBeginFastTravel: () => undefined,
      minimapEnabled: true,
      onMinimapEnabledChange: () => undefined,
    }),
  );
  assert.match(markup, /Pan map north/);
  assert.match(markup, /Zoom map in/);
  assert.match(markup, /Current map zoom/);
  assert.match(markup, /Detailed terrain/);
  assert.match(markup, /HUD minimap/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /<canvas class="hearthroads-map-terrain"/);
  assert.doesNotMatch(markup, /hearthroads-map-chunk-group/);
  assert.equal(mapTerrainPalette(1).fill, "#4f86a7");
  assert.equal(mapTerrainPalette(21).fill, "#c46fa5");
  assert.match(markup, /Trailfriend/);
  assert.match(markup, /rotate\(-1\.5707963267948966rad\)/, "clockwise world turns rotate clockwise on the map rather than mirroring");
});

test("wayshrines use the authored waystone rune instead of a shared text glyph", () => {
  let knowledge = markChunksRendered(createMapKnowledge("waystone-icon", "local"), [
    { x: 0, z: 0, biome: 3 },
    { x: 1, z: 0, biome: 3 },
  ]);
  knowledge = placeWayshrine(knowledge, {
    id: "wayshrine:test",
    name: "Test Waystone",
    position: { x: 16, y: 40, z: 8 },
    playerId: "local",
    discoveredAt: 1,
    icon: "wayshrine",
  });
  const markup = renderToStaticMarkup(createElement(MapPanel, {
    knowledge,
    currentPosition: { x: 8, y: 40, z: 8 },
    selectedMarkerId: "wayshrine:test",
    onSelectMarker: () => undefined,
    onAddManualMarker: () => undefined,
    onRemoveManualMarker: () => undefined,
    onRenameMarker: () => undefined,
    onBeginFastTravel: () => undefined,
  }));
  assert.equal((markup.match(/data-map-icon="waystone"/gu) ?? []).length, 3, "map pin, legend, and inspector should share the authored sigil");
  assert.doesNotMatch(markup, /♜/u);
  assert.match(markup, /Crossroads|Test Waystone/u);
});

test("the optional minimap renders a bounded north-up canvas and tracked target", () => {
  const knowledge = markChunksRendered(createMapKnowledge("minimap", "local"), [
    { x: 0, z: 0, biome: 3 },
    { x: 1, z: 0, biome: 1 },
  ]);
  const markup = renderToStaticMarkup(createElement(MinimapHud, {
    knowledge,
    headingRadians: Math.PI / 2,
    position: { x: 8, y: 40, z: 8 },
    players: [],
    trackedId: null,
  }));
  assert.match(markup, /class="world-minimap"/u);
  assert.match(markup, /<canvas/u);
  assert.match(markup, />N<\/span>/u);
  assert.match(markup, /LOCAL MAP/u);
});

test("large explored maps retain one bounded terrain canvas instead of per-chunk DOM", () => {
  const chunks = Array.from({ length: 16_384 }, (_, index) => ({ x: index % 128, z: Math.floor(index / 128), biome: index % 24 }));
  const knowledge = markChunksRendered(createMapKnowledge("large-map", "local"), chunks);
  const markup = renderToStaticMarkup(createElement(MapPanel, {
    knowledge,
    currentPosition: { x: 8, y: 40, z: 8 },
    selectedMarkerId: null,
    onSelectMarker: () => undefined,
    onAddManualMarker: () => undefined,
    onRemoveManualMarker: () => undefined,
    onRenameMarker: () => undefined,
    onBeginFastTravel: () => undefined,
  }));
  assert.equal((markup.match(/<canvas /gu) ?? []).length, 1);
  assert.doesNotMatch(markup, /hearthroads-map-chunk-group/);
  assert.ok(markup.length < 12_000, `large-map markup should stay bounded, received ${markup.length} characters`);
});

test("daily cloud plans are deterministic, layered, larger, and density-variable", () => {
  const weather = createWeatherState({ seed: "clouds", biome: "glimmerwood" }, 7);
  assert.equal(weatherBiomeFromId(21), "sugarplum");
  assert.equal(weatherBiomeFromId(22), "glimmerwood");
  assert.equal(weatherBiomeFromId(23), "snowcap");
  const day = cloudDayProfile("clouds", 7);
  assert.deepEqual(day, cloudDayProfile("clouds", 7));
  assert.notDeepEqual(day, cloudDayProfile("clouds", 8));
  const cluster = planCloudCluster("clouds", 0, 0, weather, 7);
  assert.ok(cluster.lobes.length >= 11 && cluster.lobes.length <= 15);
  assert.ok(new Set(cluster.lobes.map((lobe) => lobe.layer)).size >= 2);
  assert.ok(cluster.lobes.every((lobe) => lobe.shape === "blocky-puff" && lobe.scaleX >= 5));
  assert.ok(planCloudField("clouds", 0, 0, 3, weather).length <= 49);
});

test("cloud opacity fades and celestial sprites disappear behind a lobe", () => {
  const fair: WeatherState = {
    kind: "clear",
    cycle: 2,
    elapsedSeconds: 40,
    durationSeconds: 300,
    intensity: 0,
    windAngle: 0,
    windSpeed: 1,
  };
  const target = cloudOpacityTarget(fair);
  const oneStep = stepCloudFade(0, fair, 0.5);
  const later = stepCloudFade(oneStep.opacity, fair, 4);
  assert.ok(oneStep.opacity > 0 && oneStep.opacity < target);
  assert.ok(later.opacity > oneStep.opacity && later.opacity <= target);

  const overhead: CloudClusterPlan = {
    id: "overhead",
    x: 0,
    y: 60,
    z: 0,
    driftX: 0,
    driftZ: 0,
    lobes: [{
      x: 0, y: 0, z: 0, scaleX: 8, scaleY: 4, scaleZ: 8,
      brightness: 1, layer: 0, shape: "blocky-puff",
    }],
  };
  const occlusion = cloudCelestialOcclusion({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, [overhead], 0.8);
  assert.ok(occlusion >= 0.79);
  assert.ok(celestialVisibilityThroughClouds(1, occlusion) <= 0.21);
  assert.equal(cloudCelestialOcclusion({ x: 50, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, [overhead]), 0);
});

test("rain stops per roofed column while nearby open rain and ambience remain", () => {
  const open = planRainColumn({ x: 0, z: 0, spawnY: 72, floorY: 40, viewerY: 42 });
  const roofed = planRainColumn({ x: 1, z: 0, spawnY: 72, floorY: 40, obstructionY: 45, viewerY: 42 });
  const porch = planRainColumn({ x: 2, z: 0, spawnY: 72, floorY: 40, obstructionY: 39, viewerY: 42 });
  assert.equal(open.bottomY, 40.04);
  assert.equal(roofed.bottomY, 45.04);
  assert.equal(roofed.openAboveViewer, false);
  assert.equal(porch.openAboveViewer, true);
  assert.equal(rainOpenColumnFraction([open, roofed, porch]), 2 / 3);
  assert.equal(rainAmbienceLevel(1, 0), 0.18, "an indoor listener still hears muffled global rain");
  assert.equal(rainAmbienceLevel(1, 1), 1);
});

test("storms remain a unified overcast sky with hidden sun and moon", () => {
  const storm: WeatherState = {
    kind: "thunder",
    cycle: 3,
    elapsedSeconds: 24,
    durationSeconds: 180,
    intensity: 0.9,
    windAngle: 0,
    windSpeed: 5,
  };
  const visuals = weatherVisuals(storm);
  assert.equal(visuals.fullOvercast, true);
  assert.equal(visuals.sunVisibility, 0);
  assert.equal(visuals.celestialVisibility, 0);
  assert.equal(planCloudField("storm", 0, 0, 4, storm).length, 0);
});
