import { mergeTerrainGeometry, type TerrainSectionGeometry } from "./terrain-buffer-pipeline";

type Request = Readonly<{ id: number; parts: readonly TerrainSectionGeometry[] }>;

self.onmessage = (event: MessageEvent<Request>) => {
  const geometry = mergeTerrainGeometry(event.data.parts);
  const transfer = geometry ? Object.values(geometry).map((array) => array.buffer as ArrayBuffer) : [];
  self.postMessage({ id: event.data.id, geometry }, { transfer });
};
