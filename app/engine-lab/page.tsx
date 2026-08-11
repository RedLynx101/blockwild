import type { Metadata } from "next";
import EngineLabClient from "./EngineLabClient";

export const metadata: Metadata = {
  title: "Engine Lab · Blockwild",
  description: "Private Blockwild Rust, WebAssembly, worker, and WebGPU migration diagnostics.",
  robots: { index: false, follow: false },
};

export default function EngineLabPage() {
  return <EngineLabClient />;
}

