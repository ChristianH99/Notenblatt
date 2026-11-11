# Development

How to set up, run, test and release Notenblatt. The code structure is described in [architecture.md](architecture.md).

## Prerequisites

- **Node.js 26 LTS**. Nothing else: `better-sqlite3` 13 ships N-API prebuilds for win32-x64/arm64 (and Linux/macOS), so no C++ toolchain or Python is needed and no native rebuild for Electron. The project `.npmrc` sets `ignore-scripts=true` because npm would otherwise run an implicit `node-gyp rebuild` for better-sqlite3, which needs Visual Studio on Windows even though it builds nothing. No dependency needs an install script; if one ever does, run it explicitly (`npm rebuild <package> --ignore-scripts=false`).
- Everything runs on Windows, Linux and macOS. Windows installers are only built by GitHub Actions (see [Releasing](#releasing)).

> **VS Code / Claude Code terminals** may export `ELECTRON_RUN_AS_NODE=1`, which turns `electron.exe` into plain Node and breaks `npm run dev` and `npm run e2e` (`Cannot read properties of undefined (reading 'isPackaged')`). Run `unset ELECTRON_RUN_AS_NODE` (bash) or `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) first. The E2E helper strips it automatically.

## Running the app from source

```bash
npm ci
npm run dev
```

`npm run dev` starts the electron-vite dev server and Electron with hot reload. This is the way to try out changes manually; no installer is needed. Dev mode uses a relaxed CSP for Vite HMR and allows localhost in the request filter.

To keep test data away from your real data in `%APPDATA%\Notenblatt`, point the app at another folder:

```bash
NOTENBLATT_USER_DATA=./.dev-data npm run dev                     # bash
$env:NOTENBLATT_USER_DATA = "$PWD\.dev-data"; npm run dev        # PowerShell
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the app from source with hot reload |
| `npm run build` | Production bundles in `out/` (main, preload, renderer); used by the E2E tests |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm run typecheck` | `tsc --noEmit` for main/shared/tests (`tsconfig.node.json`), renderer (`tsconfig.web.json`) and E2E (`tsconfig.e2e.json`), all `strict` + `noUncheckedIndexedAccess` |
| `npm test` | Vitest: unit (`tests/unit`) and DB integration (`tests/integration`) |
| `npm run coverage` | Unit tests with V8 coverage of `src/shared`; fails below 95 % lines/branches/functions/statements |
| `npm run e2e` | Production bundles, then Playwright `_electron` tests in `tests/e2e`; screenshots go to `test-results/screenshots/` |
| `npm run icons` | Regenerates `resources/icon.png` / `resources/icon.ico` (dependency-free script) |
| `npm run licenses` | Regenerates `THIRD_PARTY_NOTICES.md` from the shipped dependencies (see [Licenses](#licenses-and-third-party-notices)) |
| `npm run licenses:check` | Fails if `THIRD_PARTY_NOTICES.md` is out of date (run in CI) |
| `npm run dist` | Windows installers in `dist/`; normally run only by the release workflow |

See [testing.md](testing.md) for what the test suites cover.

Environment variables for development and testing. They only work when the app runs from source (`npm run dev`, `npm run e2e`); the installed app ignores them:

- `NOTENBLATT_USER_DATA=<dir>` – use another data directory instead of `%APPDATA%\Notenblatt` (all tests use temp dirs).
- `NOTENBLATT_E2E=1` – enables DevTools in production bundles (used by Playwright).
- `NOTENBLATT_E2E_HIDDEN=1` – keeps the window hidden.
- `NOTENBLATT_UPDATE_URL=<url>` – check this URL (localhost) instead of the GitHub API; also enables the update check in a 0.0.0 build. Used by `update.spec.ts`.
- `NOTENBLATT_UPDATE_DRY_RUN=1` – download and verify an update but do not start the installer.

Generated folders (`out/`, `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `.e2e-data/`) are gitignored; never commit them.

## Conventions

- **Language:** code, comments, tests and docs are English. Only user-facing text is German: UI strings, `UserError` messages and the installer/uninstaller pages.
- Exact dependency versions are pinned in `package.json` (see [Dependencies](#dependencies)).
- No floating point in `src/shared/grading` (see [architecture.md](architecture.md#grading-arithmetic)).
- Record design decisions that the specification leaves open in [decisions.md](decisions.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request (`windows-latest`): `npm ci` → lint → typecheck → third-party notices check → test → coverage → e2e. The E2E screenshots are uploaded as the `e2e-screenshots` artifact. CI does not build installers. A newer push to the same branch or pull request cancels the older run (`concurrency`); release builds for the same tag queue instead and are never cancelled.

## Dependencies

- **Dependabot** (`.github/dependabot.yml`) opens weekly PRs: patch and minor npm updates grouped into one PR, every major update separately, plus GitHub Actions updates. CI runs the full suite on each PR.
- **Electron** supports only its three latest major versions (a new major roughly every 8 weeks), so each Electron major gets about six months of security fixes. Take Electron major PRs at least every few months and before a release: run the full suite including E2E, check the [breaking changes](https://www.electronjs.org/docs/latest/breaking-changes), and smoke-test an installer from a pre-release.
- **`@types/node`** matches the Node.js version bundled with Electron (Electron 45 → Node 24), not the tooling's Node; update it together with Electron. Dependabot ignores its majors.
- **TypeScript** stays below 7 until typescript-eslint supports it ([decisions.md](decisions.md), entry 2); Dependabot ignores its majors.
- **`overrides`** in `package.json` lifts `minimatch` 9.x/10.x (used by ESLint and electron-builder) to 11.0.5 for a moderate advisory (GHSA-g3hv-75wg-m249) that their version ranges cannot pick up. Remove the override once those packages depend on a fixed `minimatch` themselves; `npm audit` must stay clean.
- **New runtime dependency?** Run `npm run licenses` and commit `THIRD_PARTY_NOTICES.md`; CI fails otherwise. The script stops with an error if a shipped package has no license file.

## Licenses and third-party notices

Notenblatt is MIT-licensed ([LICENSE](../LICENSE)). The licenses of everything shipped with the app are shown in two places, both produced by `scripts/licenses.mjs`:

- **In the app:** Einstellungen → "Über Notenblatt" shows the version, copyright, the app's own license and every third-party component with its exact version and full license text. The data comes from the `virtual:about` module, generated by `aboutPlugin()` in `electron.vite.config.ts` on every build, so it always matches what was bundled.
- **In the repository:** [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), the same list without version numbers, so routine updates do not change it.

The script finds shipped npm packages by scanning the non-type imports in `src/` and following their runtime `dependencies`. Electron (the runtime), SQLite (compiled into better-sqlite3) and the copied Fluent UI icons (`src/renderer/icons/LICENSE.md`) are added explicitly. The licenses of Chromium and the other parts of Electron are installed by electron-builder as `LICENSES.chromium.html` next to the exe; the info page points to that file.

## Releasing

Installers are built only by `.github/workflows/release.yml`, which runs when a GitHub release is **published** (directly, or by publishing a draft):

1. Create a release on GitHub with a tag like `v0.1.0` (the `v` is optional). Mark it as a pre-release for tags like `v0.2.0-beta.1` if you like.
2. The workflow sets the app version from the tag (`npm version`, not committed), runs the unit and integration tests, builds both installers with `npm run dist` and attaches them to the release:
   - `Notenblatt-Setup-<version>-x64.exe`
   - `Notenblatt-Setup-<version>-arm64.exe`

**Versioning:** Notenblatt has not been released yet; the first release will be `v0.1.0`. The version in `package.json` is the placeholder `0.0.0` and is never bumped by hand: the release tag is the only source of a version number. Builds from source therefore report `0.0.0`.

Re-running the workflow replaces the attached installers (`--clobber`). A tag that is not a semantic version fails the workflow before anything is built.

Before publishing a release, go through the manual checks in [testing.md](testing.md#manual-release-checks).

### Packaging details

`electron-builder` (config in `package.json → build`, resources in `resources/`): NSIS, `oneClick: false`, `perMachine: false`, `allowElevation: false` (installer manifest is `asInvoker`), default directory `%LOCALAPPDATA%\Programs\Notenblatt`. `resources/installer.nsh` adds the uninstaller page with the "Alle gespeicherten Daten … löschen" checkbox. `better-sqlite3` is unpacked from the asar (`asarUnpack`); `npmRebuild` is off because the module is N-API. x64 and arm64 are built in two separate runs so no combined multi-arch installer is produced.

**Electron fuses** (`build.electronFuses`) are set when packaging: `runAsNode`, `NODE_OPTIONS` and `--inspect` are disabled, the app loads only from `app.asar`, and the asar's integrity is validated. `grantFileProtocolExtraPrivileges` stays enabled because the UI is loaded as ES modules from `file://`. To inspect a build: `npx @electron/fuses read --app dist/win-unpacked/Notenblatt.exe`. Because the inspector is disabled, Playwright cannot drive a packaged build; E2E tests run against the unpackaged bundles.

The installers are not code-signed; the README explains the SmartScreen prompt.

**Releases and in-app updates.** The app offers the latest non-pre-release GitHub release whose tag (`vX.Y.Z`) is newer than its own version, once the release workflow has uploaded `Notenblatt-Setup-<version>-<arch>.exe`. Keep the asset names (`build.win.artifactName`) and the tag format unchanged, or installed copies stop finding updates. The release notes (release body, Markdown) are shown in the app before installing, so write them for teachers, in German. Mark test builds as **pre-release**: they are never offered.
