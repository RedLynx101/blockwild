# Security policy

## Supported version

Security fixes target the current `main` branch and the production build deployed from it. Older browser-local builds are not separately maintained.

## Reporting a vulnerability

Do not open a public issue containing an exploit, private save, invite code, API key, voice credential, or player/session data. Use GitHub's private [security advisory form](https://github.com/RedLynx101/blockwild/security/advisories/new). Include:

- the affected route, module, or version;
- a minimal reproduction using synthetic data;
- the expected and observed authority boundary;
- practical impact;
- any safe mitigation you already tested.

Do not test against another person's world, account, or multiplayer session without explicit permission. Avoid destructive or high-volume testing against the public deployment.

## Current trust boundaries

- World and character saves are browser-local and should be treated as untrusted input during import.
- Multiplayer is host-authoritative; guest actions must pass bounded validation before mutating shared state.
- In-world chat is untrusted data and must not directly steer an AI runner.
- AI companion capabilities are explicitly granted and revocable by the human host.
- ElevenLabs and other provider credentials belong only in the external runner and must never be shipped to client JavaScript.
- Static wiki and media assets must not become an execution path for user-supplied markup.
