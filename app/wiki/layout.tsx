import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blockwild Wiki",
  description: "Search Blockwild's creatures, items, recipes, flora, biomes, and field systems from the browser or the game.",
  alternates: { canonical: "/wiki" },
  openGraph: {
    title: "Blockwild Wiki",
    description: "A living field reference for the creatures, materials, places, and systems of Blockwild.",
    url: "/wiki",
    images: [{ url: "/og.png", width: 1527, height: 862, alt: "Blockwild wilderness" }],
  },
};

export default function WikiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
