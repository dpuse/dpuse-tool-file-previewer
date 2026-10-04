# DPUse File Previewer Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@dpuse/dpuse-tool-file-previewer.svg)](https://www.npmjs.com/package/@dpuse/dpuse-tool-file-previewer)

<!-- OPENING_START -->

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DPUse version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.dpuse.app%2Fconfigs%2Fdpuse-tool-file-previewer&query=%24.data.version&prefix=v&label=DPUse&color=f6821f)](https://github.com/dpuse/dpuse-tool-file-previewer/releases/latest)
[![npm version](https://img.shields.io/npm/v/@dpuse/dpuse-tool-file-previewer?color=cb3837&label=npm)](https://www.npmjs.com/package/@dpuse/dpuse-tool-file-previewer)
[![CI](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/ci.yml/badge.svg)](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/ci.yml)

...

[Report a Vulnerability](https://github.com/dpuse/dpuse-tool-file-previewer/security/advisories/new) · [Open an Issue](https://github.com/dpuse/dpuse-tool-file-previewer/issues)

## About DPUse

[DPUse](https://www.dpuse.app) (Data Positioning & Use) is an in-browser application that positions your data for use through three core activities: sourcing, contextualising, and publishing.

**Sourcing** uses a library of [Connectors](https://www.dpuse.app/connectors) to establish [Connections](https://www.dpuse.app) to applications, databases, file stores, and curated datasets; these connections are subsequently used to configure structured [Data Views](https://www.dpuse.app) from the underlying sources.

**Contextualising** extracts chronological events from those [Data Views](https://www.dpuse.app) and maps them into comprehensive [Context Models](https://www.dpuse.app). This gives the DPUse Engine the structural framework needed to generate deterministic transactions, facts, or observations.

**Publishing** uses a library of [Presenters](https://www.dpuse.app) to render standard [Presentations](https://www.dpuse.app) immediately using the contextualised data; additionally, [Cookbooks](https://www.dpuse.app) of [Recipes](https://www.dpuse.app) let you build Data Apps using your preferred tools.

In addition, DPUse provides [Tools](https://www.dpuse.app) used by the application, and you can use them to construct connectors and presenters.

## Introduction

...

<!-- OPENING_END -->

<!-- USAGE_START -->

## Usage

This [package](https://www.npmjs.com/package/@dpuse/dpuse-tool-file-previewer) is available on [npm](https://www.npmjs.com/). Install it with:

```bash
npm install @dpuse/dpuse-tool-file-previewer
```

To work on the source instead, clone this repository.

```bash
git clone https://github.com/dpuse/dpuse-tool-file-previewer.git
cd dpuse-tool-file-previewer
npm install
```

_Requires [Node.js](https://nodejs.org/) 24 or later, [npm](https://www.npmjs.com/) 12 or later, and [TypeScript](https://www.typescriptlang.org/) 6.0.3 or later._

This repository is managed using the common set of actions provided by [@dpuse/dpuse-development](https://github.com/dpuse/dpuse-development). See the `scripts` block in [package.json](https://github.com/dpuse/dpuse-tool-file-previewer/blob/main/package.json) for details.

<!-- USAGE_END -->

<!-- DEPENDENCY_LICENSES_START -->

## Dependency Licenses

License data is updated each time `npm run document` is run, using [license-checker](https://github.com/RSeidelsohn/license-checker-rseidelsohn). The following table lists every package whose code, styles or assets are included in this project's build, as recorded by the build itself. Modules loaded at run time are not included; each documents its own. These dependencies have been checked and confirmed to use MIT, all of which allow commercial use. All are used unmodified, so any licence conditions that apply only to modified versions are not triggered. Developers cloning this repository should independently verify development dependencies.

| Dependency                                                             | Version | License(s) | Document                                                              |
| :--------------------------------------------------------------------- | :-----: | :--------- | :-------------------------------------------------------------------- |
| [@borewit/text-codec](https://github.com/Borewit/text-codec)           |  0.2.2  | MIT        | [LICENSE](licenses/downloads/@borewit/text-codec@0.2.2-LICENSE.txt)   |
| [@dpuse/dpuse-shared](https://github.com/dpuse/dpuse-shared)           | 1.0.106 | MIT        | [LICENSE](licenses/downloads/@dpuse/dpuse-shared@1.0.106-LICENSE.txt) |
| [@tokenizer/inflate](https://github.com/Borewit/tokenizer-inflate)     |  0.4.1  | MIT        | [LICENSE](licenses/downloads/@tokenizer/inflate@0.4.1-LICENSE.txt)    |
| [chardet](https://github.com/runk/node-chardet)                        |  2.2.0  | MIT        | [LICENSE](licenses/downloads/chardet@2.2.0-LICENSE.txt)               |
| [debug](https://github.com/debug-js/debug)                             |  4.4.3  | MIT        | [LICENSE](licenses/downloads/debug@4.4.3-LICENSE.txt)                 |
| [file-type](https://github.com/sindresorhus/file-type)                 | 22.1.1  | MIT        | [LICENSE](licenses/downloads/file-type@22.1.1-LICENSE.txt)            |
| [ms](https://github.com/vercel/ms)                                     |  2.1.3  | MIT        | [LICENSE](licenses/downloads/ms@2.1.3-LICENSE.txt)                    |
| [strtok3](https://github.com/Borewit/strtok3)                          | 10.3.5  | MIT        | [LICENSE](licenses/downloads/strtok3@10.3.5-LICENSE.txt)              |
| [token-types](https://github.com/Borewit/token-types)                  |  6.1.2  | MIT        | [LICENSE](licenses/downloads/token-types@6.1.2-LICENSE.txt)           |
| [uint8array-extras](https://github.com/sindresorhus/uint8array-extras) |  1.5.0  | MIT        | [LICENSE](licenses/downloads/uint8array-extras@1.5.0-LICENSE.txt)     |
| [valibot](https://github.com/open-circle/valibot)                      |  1.5.0  | MIT        | [LICENSE](licenses/downloads/valibot@1.5.0-LICENSE.txt)               |

### Dependency Tree

The dependency tree below shows how each package in the table above is reached — direct and transitive — along with its installed version, release date, and update status. A package that does not ship itself, such as one whose parts are bundled separately, is left out and what ships beneath it is shown in its place. Packages flagged ❗ have a newer version available; ⚠️ indicates a package that hasn't been updated in the last 6 months or longer. Neither flag necessarily indicates a problem: we let new releases stabilise before upgrading, and some packages are mature and stable (have limited or no dependencies), so they require no active development.

- **[@dpuse/dpuse-shared](https://github.com/dpuse/dpuse-shared)** 1.0.106 — this month: 2026-10-04
    - **[file-type](https://github.com/sindresorhus/file-type)** 22.1.1 — this month: 2026-09-17
    - **[valibot](https://github.com/open-circle/valibot)** 1.5.0 — this month: 2026-09-09
- **[chardet](https://github.com/runk/node-chardet)** 2.2.0 — 3 mths ago: 2026-06-20
- **[file-type](https://github.com/sindresorhus/file-type)** 22.1.1 — this month: 2026-09-17
    - **[@tokenizer/inflate](https://github.com/Borewit/tokenizer-inflate)** 0.4.1 — 10 mths ago: 2025-11-18 ⚠️
        - **[debug](https://github.com/debug-js/debug)** 4.4.3 — 12 mths ago: 2025-09-13 ⚠️
        - **[token-types](https://github.com/Borewit/token-types)** 6.1.2 — 9 mths ago: 2026-01-01 ⚠️
    - **[strtok3](https://github.com/Borewit/strtok3)** 10.3.5 — 6 mths ago: 2026-03-21
    - **[token-types](https://github.com/Borewit/token-types)** 6.1.2 — 9 mths ago: 2026-01-01 ⚠️
        - **[@borewit/text-codec](https://github.com/Borewit/text-codec)** 0.2.2 — 6 mths ago: 2026-03-11
    - **[uint8array-extras](https://github.com/sindresorhus/uint8array-extras)** 1.5.0 — 13 mths ago: 2025-08-22 ⚠️ → latest: 1.6.0 — this month: 2026-09-26 ❗

<!-- DEPENDENCY_LICENSES_END -->

<!-- BUNDLE_START -->

## Bundle Analysis

This report is updated with each release, from the bundle the release builds, using [Sonda](https://sonda.dev/), which analyses final source maps to reveal the actual effects of tree-shaking and minification rather than relying on pre-build estimates.

_Note: Sonda's Vite reports currently exclude CSS files, since Vite does not generate source maps for CSS._

| Chunk/Module/File                                                         | Composition                                   |
| :------------------------------------------------------------------------ | :-------------------------------------------- |
| **dist/dpuse-tool-file-previewer.es.js**                                  | 172.2 kB · gzip 38.8 kB · 100.0% of the build |
| &nbsp;&nbsp;&nbsp;&nbsp;chardet                                           | `██████░░░░░░░░░░░░░░` 28.0% · 48.3 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ lib/encoding/sbcs.js    | `▒▒▒▒░░░░░░░░░░░░░░░░` 19.2% · 33.0 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ lib/encoding/mbcs.js    | `▒░░░░░░░░░░░░░░░░░░░` 4.1% · 7.0 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ 8 smaller files         | `▒░░░░░░░░░░░░░░░░░░░` 4.8% · 8.3 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;file-type                                         | `█████░░░░░░░░░░░░░░░` 26.4% · 45.5 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ source/index.js         | `▒▒▒░░░░░░░░░░░░░░░░░` 14.5% · 25.0 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ source/detectors/zip.js | `▒░░░░░░░░░░░░░░░░░░░` 6.2% · 10.7 kB         |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ source/supported.js     | `▒░░░░░░░░░░░░░░░░░░░` 2.8% · 4.8 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ 5 smaller files         | `▒░░░░░░░░░░░░░░░░░░░` 2.9% · 5.0 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;@dpuse/dpuse-shared → dist/dpuse-shared.es.js     | `██░░░░░░░░░░░░░░░░░░` 8.1% · 14.0 kB         |
| &nbsp;&nbsp;&nbsp;&nbsp;strtok3                                           | `█░░░░░░░░░░░░░░░░░░░` 4.1% · 7.0 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ 11 smaller files        | `▒░░░░░░░░░░░░░░░░░░░` 4.1% · 7.0 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;@tokenizer/inflate                                | `█░░░░░░░░░░░░░░░░░░░` 3.8% · 6.5 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ lib/ZipHandler.js       | `▒░░░░░░░░░░░░░░░░░░░` 2.9% · 4.9 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ 2 smaller files         | `░░░░░░░░░░░░░░░░░░░░` 0.9% · 1.6 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;debug                                             | `█░░░░░░░░░░░░░░░░░░░` 2.9% · 5.1 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ 2 smaller files         | `▒░░░░░░░░░░░░░░░░░░░` 2.9% · 5.1 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;src → index.ts                                    | `█░░░░░░░░░░░░░░░░░░░` 2.6% · 4.4 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;@borewit/text-codec → lib/index.js                | `░░░░░░░░░░░░░░░░░░░░` 1.9% · 3.4 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;ms → index.js                                     | `░░░░░░░░░░░░░░░░░░░░` 0.9% · 1.6 kB          |
| &nbsp;&nbsp;&nbsp;&nbsp;token-types → lib/index.js                        | `░░░░░░░░░░░░░░░░░░░░` 0.6% · 1017 B          |
| &nbsp;&nbsp;&nbsp;&nbsp;uint8array-extras → index.js                      | `░░░░░░░░░░░░░░░░░░░░` 0.6% · 987 B           |
| &nbsp;&nbsp;&nbsp;&nbsp;(bundler output, whitespace & JSON)               | `████░░░░░░░░░░░░░░░░` 20.0% · 34.5 kB        |

Bars show each row's share of its output file. ↳ rows are part of the row above.

(bundler output, whitespace & JSON) = bytes Sonda can't trace to a source file: whitespace (indentation and line breaks), code the bundler generates (region comments, the combined import/export lines, its small runtime helper and wrappers), and imported JSON such as `config.json`, which the bundler doesn't map. The JSON and the generated code are real bytes that ship; the whitespace mostly disappears once compressed.

<!-- BUNDLE_END -->

<!-- QUALITY_SECURITY_START -->

## Quality & Security

This section is updated each time `npm run document` is run. Settings come from the repository's workflow files and GitHub. Test coverage and the Fallow score are measured at the same time.

### Testing

| Check                | Status | What it does                                                                                                                                                                                       |
| :------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests           | ✅ On  | [Vitest](https://vitest.dev) runs the unit tests. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/ci.yml) on every push and pull request to `main`. |
| Property-based tests | ❌ Off | [fast-check](https://fast-check.dev) runs many random inputs per test to find edge cases, alongside the unit tests.                                                                                |

### Code Quality

| Check         | Status | What it does                                                                                                                                                                                                                 |
| :------------ | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code analysis | ❌ Off | [SonarCloud](https://sonarcloud.io) checks every push for bugs, code smells and vulnerabilities.                                                                                                                             |
| Linting       | ✅ On  | [ESLint](https://eslint.org) checks the code for errors and style problems. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/ci.yml) on every push and pull request to `main`. |

### Security Analysis

| Check           | Status | What it does                                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push protection | ✅ On  | [GitHub push protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations) blocks pushes that contain credentials.                                                                                                                                                                                                                |
| Static analysis | ✅ On  | [![CodeQL](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/codeql.yml/badge.svg)](https://github.com/dpuse/dpuse-tool-file-previewer/security/code-scanning) [CodeQL](https://codeql.github.com) scans GitHub Actions and JavaScript/TypeScript for security vulnerabilities, using the extended security queries, on every push and pull request to `main` and weekly. |
| Secret scanning | ✅ On  | [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning) detects credentials, such as API keys and tokens, committed to the repository.                                                                                                                                                                                                                            |

### Dependencies

| Check               | Status | What it does                                                                                                                                                                                                                                                                                                                     |
| :------------------ | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerability audit | ✅ On  | [npm audit](https://docs.npmjs.com/cli/commands/npm-audit) fails when a shipped dependency has any known vulnerability, or a development dependency has a high or critical one. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-file-previewer/actions/workflows/ci.yml) on every push and pull request to `main`. |
| Supply chain risk   | ✅ On  | [Socket](https://socket.dev) flags malicious packages, typosquatting and suspicious behaviour that may not yet have a CVE.                                                                                                                                                                                                       |
| Security alerts     | ✅ On  | [Dependabot](https://docs.github.com/en/code-security/dependabot) alerts when a dependency has a known vulnerability, using the GitHub Advisory Database.                                                                                                                                                                        |
| Security updates    | ❌ Off | [Dependabot](https://docs.github.com/en/code-security/dependabot) opens pull requests that update vulnerable dependencies. These are handled manually.                                                                                                                                                                           |
| Version updates     | ❌ Off | [Dependabot](https://docs.github.com/en/code-security/dependabot) opens pull requests for new dependency versions. These are handled manually.                                                                                                                                                                                   |

### OpenSSF 🚧

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/dpuse/dpuse-tool-file-previewer/badge)](https://scorecard.dev/viewer/?uri=github.com/dpuse/dpuse-tool-file-previewer)

This project is working towards the [OpenSSF Best Practices](https://www.bestpractices.dev) Passing badge, a self-certification covering security policy, vulnerability reporting, build processes, code quality, and more. Currently the [OpenSSF Scorecard](https://scorecard.dev) provides an independent automated assessment of the project's security practices and is an ongoing area of improvement.

### Reporting Vulnerabilities

Please do not open public GitHub issues for security vulnerabilities. Use [GitHub private vulnerability reporting](https://github.com/dpuse/dpuse-tool-file-previewer/security/advisories/new) instead. See [SECURITY.md](./SECURITY.md) for the full disclosure policy, contact details, and expected response times.

<!-- QUALITY_SECURITY_END -->

<!-- CONTRIBUTING_LICENSE_START -->

## Contributing

This repository is maintained solely by its owner and does not, at present, accept external contributions into the canonical repo. Its source is published openly under the MIT License — every DPUse project is fully open source except DPUse Engine, which remains closed and proprietary.

For security vulnerabilities, see [Reporting Vulnerabilities](#reporting-vulnerabilities). For bugs, inconsistencies, or other feedback, [open a GitHub issue](https://github.com/dpuse/dpuse-tool-file-previewer/issues) — feedback is read, but responses and fixes are at the maintainer's discretion.

## License

This project is licensed under the MIT License, permitting free use, modification, and distribution.

[MIT](./LICENSE) © 2026 Jonathan Terrell

<!-- CONTRIBUTING_LICENSE_END -->
