# Development and validation

## Environment

- Node.js 22.13 or newer
- Current WebGL browser with hardware acceleration
- WSL/Linux for the exact production Sites scripts (`bash`, `flock`, `sha256sum`, GNU `timeout`)

Use `npm ci`; do not update the lockfile incidentally.

## Iteration loop

1. Run the narrowest relevant Node test while changing a pure system.
2. Run `npx tsc --noEmit` and `npm run lint` before broad validation.
3. Exercise UI, interaction, model, lighting, or world changes in the browser.
4. Inspect screenshots and browser errors at desktop and narrow viewports.
5. Run `npm test` before a release commit.

## Generated knowledge and art

`npm run build:wiki` writes the public knowledge index and five category shards from `app/game/wiki-content.ts`. Generated JSON is committed so static routes remain inspectable and host-independent.

`npm run cardforge:render-art` writes the selected canonical Full Art roster from production creature models. Review representative small, large, aquatic, flying, subterranean, and luminous creatures before publishing.

## Release discipline

`main` is the release branch. A release is complete only when:

- the intended files are committed and the worktree contains no accidental project changes;
- GitHub contains the exact commit;
- the Vercel deployment for that commit is ready and `blockwild.app` serves it;
- the Sites source and production version point at the same commit;
- the home route, `/wiki`, generated knowledge, and representative game flows are checked on the public origins.

Never commit `.blockwild-agent/`, environment values, browser session data, or ignored output directories.
