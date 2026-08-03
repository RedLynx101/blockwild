import { mergeTerrainGeometry, type TerrainSectionGeometry } from "./terrain-buffer-pipeline";

type Request = Readonly<{ id: number; parts: readonly TerrainSectionGeometry[] }>;

self.postMessage({ type: "ready", protocol: 1 });

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const geometry = mergeTerrainGeometry(event.data.parts);
    const transfer = geometry ? Object.values(geometry).map((array) => array.buffer as ArrayBuffer) : [];
    self.postMessage({ type: "result", id: event.data.id, geometry }, { transfer });
  } catch (error) {
    self.postMessage({ type: "task-error", id: event.data.id, message: error instanceof Error ? error.message : String(error) });
  }
};
