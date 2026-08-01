# Cardforge art provenance

Cardforge revision `cardforge-3` separates creature identity from scene art.

## Canonical creature Full Art

The 38 released creature Full Art printings in `../full-art-canonical/` are deterministic SVG scenes rendered offline by `scripts/render-cardforge-creature-art.ts`. Every subject comes from the same production model path used by gameplay and the Bestiary:

- model source: `app/game/mob-models.ts`
- portrait extraction: `scripts/render-models.ts`
- selection and habitat direction: `app/game/tcg/creature-art.ts`
- generated asset manifest: `../full-art-canonical/manifest.json`

The habitat, framing, and lighting motif may change, but the anatomy cannot drift. These files are small local assets, contain no runtime generation, and preserve deterministic Cardforge text overlays.

## Authored scene Full Art

Three reviewed 768 x 1152 WebP backgrounds remain active for non-creature cards:

| Card definition | Asset |
|---|---|
| `card:authored:migration-confluence` | `migration-confluence.webp` |
| `card:authored:cardwright-collegium` | `cardwrights-collegium.webp` |
| `card:authored:reliquary-vault` | `reliquary-vault.webp` |

They were generated offline with OpenAI ImageGen on 2026-07-24 and manually reviewed. Their pixels contain no rules text. The remaining WebP files in this directory are retained as design-history references but are no longer released printings because their creature anatomy was less faithful to the production models.

## Acceptance rule

New creature art must begin with a canonical production-model render or an explicitly approved locked reference. Reject anatomy drift, generated text, watermarks, copied characters, incompatible trade dress, unreadable silhouettes, and busy title or rules zones. Add any released path to `TCG_FULL_ART_ILLUSTRATIONS`, bump the catalog revision, and run the Cardforge asset, layout, and browser checks.
