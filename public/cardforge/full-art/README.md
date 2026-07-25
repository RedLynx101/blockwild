# Cardforge Wildlight Full Art

These twelve backgrounds are the first reviewed Full Art roster for Cardforge catalog revision `cardforge-2`.

They were generated offline with OpenAI ImageGen on 2026-07-24, manually reviewed as a set, and exported as 768×1152 WebP assets. The prompts requested original Blockwild storybook fantasy grounded in readable voxel forms, edge-to-edge composition, calm title/rules zones, and no text, card frames, logos, trademarks, or copied trading-card trade dress.

| Set | Card definition | Asset |
|---|---|---|
| Wildroads Core | `card:mob:petalfox` | `petalfox.webp` |
| Wildroads Core | `card:mob:thimbledeer` | `thimbledeer.webp` |
| Wildroads Core | `card:mob:brinewhisk-otter` | `brinewhisk-otter.webp` |
| Wildroads Core | `card:authored:migration-confluence` | `migration-confluence.webp` |
| Halls & Hearths | `card:mob:hobbit-mayor` | `hobbit-hearthwarden.webp` |
| Halls & Hearths | `card:mob:wood-elf-elderweaver` | `wood-elf-elderweaver.webp` |
| Halls & Hearths | `card:mob:dwarf-thane` | `deepgear-thane.webp` |
| Halls & Hearths | `card:authored:cardwright-collegium` | `cardwrights-collegium.webp` |
| Vaults Below | `card:mob:fire-dragon` | `fire-dragon.webp` |
| Vaults Below | `card:mob:worldshell-leviathan` | `worldshell-leviathan.webp` |
| Vaults Below | `card:mob:ilyr-virebloom` | `ilyr-virebloom.webp` |
| Vaults Below | `card:authored:reliquary-vault` | `reliquary-vault.webp` |

The generated pixels never contain rules text. `app/game/tcg/layout.ts` and `app/game/CardforgePanel.tsx` apply the authoritative title, cost, rules, stats, collector number, and finish overlays.

For every future Full Art:

1. Generate only a vertical background illustration.
2. Preserve the source creature or place identity and the relevant set art direction.
3. Keep the title and lower rules zones compositionally quiet.
4. Reject text, watermark, anatomy drift, copied characters, and framing that hides the subject.
5. Export a reviewed 2:3 WebP, add it to `TCG_FULL_ART_ILLUSTRATIONS`, bump the catalog revision, and run the Cardforge asset/layout/browser checks.
