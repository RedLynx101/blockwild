import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildLivingBestiarySheet, extractRenderableTriangles } from "../scripts/render-living-bestiary-showcase";

test("showcase extraction retains curved topology, transparency, and luminous materials", () => {
  const root = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0x67cfe3, transparent: true, opacity: .46 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd878 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glass);
  sphere.name = "test-glass-sphere";
  root.add(sphere);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.24, .11, 8, 24), glow);
  ring.name = "test-floating-glow-ring";
  ring.rotation.x = Math.PI * .42;
  root.add(ring);

  const rendered = extractRenderableTriangles(root);
  assert.ok(rendered.triangles.length > 250, "curved primitives must not collapse to a twelve-triangle bounding box");
  assert.ok(rendered.triangles.some((triangle) => Math.abs(triangle.opacity - .46) < 1e-6));
  assert.ok(rendered.triangles.some((triangle) => triangle.glowing));
  assert.equal(rendered.meshCount, 2);
});

test("showcase sheet labels real production creatures and exposes geometry statistics", () => {
  const sheet = buildLivingBestiarySheet({
    kinds: ["orchard-glider", "ilyr-virebloom", "vellum-warden"],
    phase: "before",
    columns: 3,
    title: "Focused geometry audit",
    subtitle: "Production hierarchy check",
  });
  assert.match(sheet.svg, /<polygon /u);
  assert.match(sheet.svg, /Orchard Glider/u);
  assert.match(sheet.svg, /Ilyr Virebloom/u);
  assert.match(sheet.svg, /Vellum Warden/u);
  assert.match(sheet.svg, /fill-opacity="0\.[1-9][0-9]*"/u);
  assert.ok(sheet.totals.meshes > 30);
  assert.ok(sheet.totals.triangles > sheet.totals.meshes * 2);
  assert.ok(sheet.totals.transparentTriangles > 0);
  assert.ok(sheet.totals.glowingTriangles > 0);
});
