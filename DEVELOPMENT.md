# Notenblatt – Development

## Prerequisites

- **Node.js 22 LTS** (≥ 22.12). Nothing else: `better-sqlite3` 13 ships N-API prebuilds for win32-x64/arm64 (and Linux/macOS), so no C++ toolchain or Python is needed and no native rebuild for Electron.
- Windows 10/11 for packaging locally. On Linux/macOS everything except `dist:win` runs; the Windows installers are built by CI.

> **VS Code / Claude Code terminals:** these may export `ELECTRON_RUN_AS_NODE=1`, which turns `electron.exe` into plain Node and breaks `npm run dev` and `npm run e2e` (`Cannot read properties of undefined (reading 'isPackaged')`). Run `unset ELECTRON_RUN_AS_NODE` (bash) or `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) first. The E2E helper strips it automatically.

```bash
npm ci
npm run dev          # electron-vite dev server + Electron with hot reload
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development mode (relaxed CSP for Vite HMR, localhost allowed by the request filter) |
| `npm run build` | Production bundles in `out/` (main, preload, renderer) |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm run typecheck` | `tsc --noEmit` for main/shared/tests (`tsconfig.node.json`), renderer (`tsconfig.web.json`) and E2E (`tsconfig.e2e.json`) — all `strict` + `noUncheckedIndexedAccess` |
| `npm test` | Vitest: unit (`tests/unit`) and DB integration (`tests/integration`) |
| `npm run coverage` | Unit tests with V8 coverage of `src/shared`; fails below 95 % lines/branches/functions/statements |
| `npm run e2e` | Production build, then Playwright `_electron` tests in `tests/e2e` (also writes `docs/screenshots/*.png`) |
| `npm run dist:win` | Build + NSIS installers `dist/Notenblatt-Setup-<version>-x64.exe` and `-arm64.exe` |
| `npm run icons` | Regenerates `build/icon.png` / `build/icon.ico` (dependency-free script) |

Environment variables (development/testing only):

- `NOTENBLATT_USER_DATA=<dir>` – use another data directory instead of `%APPDATA%\Notenblatt` (all tests use temp dirs).
- `NOTENBLATT_E2E=1` – enables DevTools in production builds (used by Playwright).

## Architecture

```
src/main/        Electron main process
  index.ts         lifecycle, hardening (CSP, request filter, permissions, navigation lock,
                   single-instance), window state, in-memory session partition
  db/schema.ts     migrations via PRAGMA user_version
  db/files.ts      open + configure (WAL, foreign_keys, secure_delete), corrupt-file recovery, shredding
  db/repo.ts       all SQL; every write is one transaction; UserError = German message for the user
  db/manager.ts    owns the connection and the storage mode (see below): start/unlock, persist,
                   relocate, enable/disable encryption, wipe, backup export/import
  storage/lock.ts  lock file with heartbeat (one device at a time on a shared folder)
  storage/config.ts config.json: database folder + window position (readable before the DB opens)
  backup/crypto.ts AES-256-GCM container (backups and encrypted DB), key via scrypt (Node crypto only)
  ipc/schemas.ts   zod schema for every IPC payload
  ipc/handlers.ts  one "api" channel → typed method table; secure cleanup after deletes
  print/print.ts   hidden window renders #print/<mode>/<examId>, then printToPDF / print
src/preload/     contextBridge: window.notenblatt.invoke(method, arg)
src/shared/      pure TypeScript, no I/O, no DOM — used by main, renderer, print and tests
  grading/         units (quarter points), np15, lin6, stats, keys, marks (mark-only exams),
                   overall (weighted average per student, BigInt rationals)
  overview.ts      class overview model (students × exams, Ø per category, Ø gesamt) + CSV
  parse/           number parsing/formatting (German), name-list parsing, collation
  examModel.ts     aligns ExamData into a grid model + statistics
  csv.ts, labels.ts, schoolYear.ts, api.ts (IPC contract), types.ts
src/renderer/    React 19 + Zustand, CSS Modules + tokens.css, no UI kit
  store.ts         app state, undo/redo stacks, serialised exam writes (optimistic updates)
  grid/ScoreGrid   spreadsheet-like grid (roving focus, keyboard, clipboard, task menu)
  grid/MarkGrid    single-column grid for mark-only exams
  views/           Shell (nav, status bar), StartupGate (password / unreachable / in use),
                   Class (tabs: Notenübersicht, Schüler/innen und Prüfungen, Gewichtung),
                   Exam (meta bar, toolbar, panel), Settings, Help
  dialogs/         all modal dialogs (native <dialog>)
  print/           print route (A4 landscape pages)
tests/           unit/, integration/ (temp-file DB), e2e/ (Playwright + Electron), fixtures/golden.ts
```

### Data flow

The SQLite DB is the source of truth. The renderer calls `call(method, arg)` → preload → `ipcMain.handle('api')` → zod validation → `Repo` → result `{ ok, value } | { ok: false, error, user }`. Mutations on an exam return fresh `ExamData`; the renderer applies optimistic changes first and only applies server data when no other write is in flight (`examWrite` in `store.ts`).

### Storage modes

`DbManager` (`src/main/db/manager.ts`) decides how the database is stored:

| Folder | Password | Mode | File |
|---|---|---|---|
| default (`%APPDATA%\Notenblatt`) | no | **wal** — SQLite file, WAL, secure_delete | `notenblatt.db` |
| default | yes | **snapshot** | `notenblatt.nbdb` (encrypted) |
| custom (e.g. network share) | no / yes | **snapshot** | `<folder>\notenblatt.nbdb` (plain SQLite / encrypted) + `.lock` |

In snapshot mode the DB lives in memory (`new Database(buffer)`); `persist()` serializes it, optionally seals it with the cached key (`sealWithKey`, magic `NBLTDB1\0`), writes `<file>.neu` and renames it over the file. The IPC layer calls `mgr.persist()` after every mutating method (see `NO_PERSIST` in `ipc/handlers.ts`); in WAL mode it is a no-op. Before writing, `persist()` checks the lock and the file's size/mtime and refuses on a conflict. A 30-s heartbeat refreshes the lock and retries pending saves. The renderer shows `StartupGate` while `startupInfo.storage.state !== 'ready'`.

### Grading arithmetic

All points are integers in quarter points (`qp`, 1 point = 4 qp). Grade decisions use integer division only (`idiv`, `idivRound` in `grading/units.ts`). Never introduce floating point into `src/shared/grading`. The exhaustive tests compare against an independent BigInt implementation in `tests/unit/reference.ts`.

### Security / privacy invariants

- No network: `session.webRequest.onBeforeRequest` cancels everything that is not `file:`, `devtools:`, `data:` or `blob:` (plus localhost in dev). Blocked URLs are recorded in `globalThis.__nbNetLog`; every E2E test asserts it is empty.
- Renderer storage is never used (ESLint forbids `localStorage`/`sessionStorage`/`indexedDB` in `src/renderer`). The window session is an in-memory partition.
- Logs (`src/main/log.ts`) accept only numbers and identifier-like strings, go to stderr only, never to a file.
- After deleting a student, class or exam: transaction → `wal_checkpoint(TRUNCATE)` → `VACUUM` → `wal_checkpoint(TRUNCATE)`. `secure_delete = ON`. The integration test checks the raw bytes of `.db`, `-wal`, `-shm`.

### Overall average

`studentAverage()` in `grading/overall.ts` takes the class's grading system, the category weights (hundredths) and the student's grades (NP or grade × 10) and returns per-category means, the weighted overall average Σ w·g / Σ w truncated to hundredths, and the exact fraction. `finalMark()` rounds that exact fraction according to the class's rule (`half_up` | `half_favor` | `none`) and precision (whole / one decimal for grades 1–6). `buildOverview()` collects the grades from `ExamData` via `buildExamModel()` (point exams → NP/grade from the score sum or the directly entered sum in `score_total`; mark-only exams → the entered mark) and excludes exams without category or in another grading system. A fast-check property compares it with an independent fraction computation.

## How to add a new grading key

Example: a scheme "Noten 1–6 (ganzzahlig, 50 %-Grenze)".

1. **Engine** – add `src/shared/grading/<name>.ts` with pure integer functions, e.g. `xGrade(pointsQp, maxQp): number`, `xKey(maxQp, stepQp)` and `xIsLow(grade)`. Export it from `grading/index.ts`.
2. **Type** – extend `Scheme` in `src/shared/types.ts` (`'NP15' | 'LIN6' | 'X'`).
3. **DB** – add a migration to `MIGRATIONS` in `src/main/db/schema.ts` that rebuilds the `CHECK (scheme IN (...))` constraint (SQLite cannot alter a CHECK in place: create new table, copy, drop, rename — inside the migration transaction). Never edit an existing migration.
4. **IPC** – add the value to the `scheme` enum in `src/main/ipc/schemas.ts`.
5. **Statistics** – handle the scheme in `rowResult()` and `computeStats()` (`grading/stats.ts`): grade, group 1–6, `low`, counts, average.
6. **UI** – add the option to the "Bewertung" selects (`NewExamDialog.tsx`, `ExamView.tsx`), the key table and chart bars (`views/keyTables.tsx`), result text (`examModel.ts`), full key (`grading/keys.ts`) and the print view.
7. **Tests** – golden values from the source spreadsheet in `tests/unit/engine.test.ts`, an independent reference in `tests/unit/reference.ts` plus an exhaustive comparison over all M and P, properties (monotonic, bounds), and a stats edge-case test. Keep `src/shared` coverage ≥ 95 %.
8. Document the formula in the help page (`views/HelpView.tsx`).

## Packaging

`electron-builder` (config in `package.json → build`): NSIS, `oneClick: false`, `perMachine: false`, `allowElevation: false` (installer manifest is `asInvoker`), default directory `%LOCALAPPDATA%\Programs\Notenblatt`. `build/installer.nsh` adds the uninstaller page with the "Alle gespeicherten Daten … löschen" checkbox. `better-sqlite3` is unpacked from the asar (`asarUnpack`); `npmRebuild` is off because the module is N-API.

The installers are unsigned; see the README for the SmartScreen note.

## CI

`.github/workflows/ci.yml` on `windows-latest`: `npm ci` → lint → typecheck → test → coverage → e2e → `dist:win` → uploads both installers and the screenshots as artifacts.
