# Toolchain Maintenance: projen / jsii / typescript

**Last Updated:** 2026-07-21

This repo's own build (`.projenrc.ts`, a `cdk.JsiiProject`) pins several versions as literals. These pins exist for specific reasons — don't remove them without understanding why.

## Current Pins (`.projenrc.ts`)

| Setting | Value | Why pinned |
|---|---|---|
| `projenVersion` (const, top of file) | `0.101.17` | Source of truth for `package.json`'s `projen` entry — see below |
| `jsiiVersion` | `~5.9.0` | Compiler compatibility |
| `typescriptVersion` | `^6.0.2` | **Prevents drifting onto TypeScript 7** (see gotcha below) |

## Use Node 24 locally, matching `.nvmrc`

This repo's `.nvmrc` pins Node `24` — the version jsii's compiler actually supports (jsii's supported list: `^24.0.0`, `^22.0.0`, `^20.0.0` [deprecated]). Before running `npx projen`, `npm run build`, `npm install`, or any other repo command, switch to it: `nvm use` (reads `.nvmrc` automatically) or `nvm use 24`.

Running under a newer Node (e.g. Node 26, the current non-LTS release as of this writing) doesn't break the build, but every `jsii`/`jsii-pacmak` invocation prints an "untested node version" warning and clutters output — annoying to read through and easy to mistake for a real problem. If a shell's default Node is already 26+, run `nvm use 24` first rather than ignoring the warning.

## ⚠️ Gotcha: unpinned `typescript` devDependency drifts onto breaking majors

If `typescriptVersion` is ever removed from the `JsiiProject` options, projen adds `typescript` as a devDependency with **no version range** (`node_modules/projen/lib/typescript/typescript.js` — `tsDep = options.typescriptVersion ? "typescript@${...}" : "typescript"`). npm then resolves it to whatever is latest at synth time.

This broke the build on 2026-07-21: TypeScript 7.0.2 (the new Go-ported compiler) was published, npm picked it up as "latest," and `ts-node@10.9.2` (the newest available — ts-node has no TS7-compatible release) crashed trying to parse `.projenrc.ts` before the build could even start.

**Keep `typescriptVersion` pinned.** When bumping it, verify `npx projen && npm run build` still passes before committing — `ts-node` compatibility isn't guaranteed across major TS versions.

**Known gap:** `src/projects/cdk-construct.ts` (`MvcCdkConstructLibrary`, what this module scaffolds for *consumers*) does NOT set `typescriptVersion` in its own projen options. Generated consumer projects are exposed to the same drift/break. Worth fixing in `cdk-construct.ts` as a follow-up — not yet done.

## Keeping `projen` itself current

`projenVersion` is a hardcoded literal, not a normal devDependency range — it's the source of truth that regenerates `package.json`'s `projen` entry on every `npx projen` run. This is why `dependabotOptions.groups.default.excludePatterns` excludes `projen`: a Dependabot PR that only edits `package.json` would get silently reverted by the `self_mutation_happened` check in `.github/workflows/build.yml` (`npx projen` would just re-derive the old pinned version).

**`.github/workflows/upgrade-projen.yml`** automates this instead (weekly cron, Monday 06:00 UTC, + manual `workflow_dispatch`):

1. Compares `package.json`'s current `devDependencies.projen` against `npm view projen version`
2. If different: `sed`-updates the `projenVersion` const in `.projenrc.ts`, runs `npx projen` to re-synth everything, then `npm run build` as a gate
3. Only if the build passes: commits to a `chore/upgrade-projen-<version>` branch and opens a PR via `gh pr create` (labeled `dependencies`, `auto-approve`)

To bump manually instead of waiting for the cron (or to debug it):

```bash
npm view projen version                        # check latest
# edit the `projenVersion` const in .projenrc.ts
npx projen && npm run build                     # re-synth + verify
```

Same procedure applies to bumping `jsiiVersion` or `typescriptVersion` — always re-run the full build afterward; jsii/projen major bumps can change generated file layout (e.g. the 0.99→0.101 bump split `tsconfig.dev.json` into `tsconfig.json` + `test/tsconfig.json` + `projenrc/tsconfig.json`).
