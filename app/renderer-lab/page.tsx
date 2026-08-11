import type { Metadata } from "next";
import RendererLabClient from "./RendererLabClient";

export const metadata: Metadata = {
  title: "Renderer Lab · Blockwild",
  description: "Private Blockwild extraction V2 and Rust wgpu renderer diagnostics.",
  robots: { index: false, follow: false },
};

export default function RendererLabPage() {
  return <RendererLabClient />;
}
