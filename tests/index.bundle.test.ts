// ── External Dependencies & Registrations
import { describe, expect, it } from 'vitest';

// ── Local Framework
import config from '~/config.json';

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const BUNDLE_URL = new URL(`../dist/${config.id}.es.js`, import.meta.url);

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// The app loads the built bundle, not the source the other suites test, so this checks what is actually shipped. CI
// builds before it tests. Locally, run 'npm run build' first.
describe('built bundle', () => {
    it('exports a Tool with every action config.json lists', async () => {
        let bundle: { Tool: new () => unknown };
        try {
            bundle = (await import(BUNDLE_URL.href)) as { Tool: new () => unknown };
        } catch (error) {
            throw new Error("No bundle to test. Run 'npm run build' first.", { cause: error });
        }

        const tool = new bundle.Tool() as Record<string, unknown>;

        for (const actionName of config.actionNames) expect(typeof tool[actionName], actionName).toBe('function');
    });
});
