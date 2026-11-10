# Testing

Notenblatt has three automated test layers plus a short manual checklist for releases. All automated tests run locally from the repository (no installer needed) and in CI on every push and pull request.

| Layer | Command | Location |
|---|---|---|
| Unit (engine, statistics, parsing) | `npm test` / `npm run test:unit` | `tests/unit/` |
| Integration (real SQLite file in a temp dir) | `npm test` / `npm run test:db` | `tests/integration/` |
| Coverage of `src/shared` (≥ 95 % lines, branches, functions, statements) | `npm run coverage` | |
| End-to-end (Playwright `_electron` against the production bundles) | `npm run e2e` | `tests/e2e/` |

Shared golden data (the reference exam from the original spreadsheet, see [specification §3.6](specification.md)) lives in `tests/fixtures/golden.ts`. All tests use temporary data directories via `NOTENBLATT_USER_DATA` and never touch `%APPDATA%\Notenblatt`.

For manual testing, run the app from source with `npm run dev` (see [development.md](development.md#running-the-app-from-source)).

## Unit tests

| File | Covers |
|---|---|
| `engine.test.ts` | All golden values (NP keys for M = 55, 30, 37,5, 1, 0,5, 5, 999; linear M = 30, 7, 18,75); float regressions (22/25, 44/50, 66/75 → 1,6); the naive-float error count (24 for integer M ≤ 200, 32 incl. half-point M); **exhaustive comparison** with the independent BigInt reference in `reference.ts` for every M = 0,5…150 / P = 0…M at 0,5 steps and every M = 0,25…150 at 0,25 steps; key tables vs. direct grading; fast-check properties (monotonic, P = 0 → 0 NP / 6,0, P = M → 15 NP / 1,0, NP group ↔ grade, linear ∈ [1,0; 6,0]) |
| `stats.test.ts` | Golden exam in both schemes (participants, task averages/shares, distribution, "Note 5 und 6" share, averages); zero participants (no NaN/Infinity), all absent, one participant, partial rows, unanswered tasks, all 0, all max, single task, 40 tasks; exam model texts; CSV (BOM, `;`, decimal comma, quoting) |
| `parse.test.ts` | Number input (`"3,5" "3.5" " 3 " ",5"`, invalid values, step and max checks, empty deletes); format round-trip (property); dates; name-list parsing (comma/TAB/space, swap, duplicates); German collation; school year and retention; labels and file names |
| `errors.test.ts` | Error table against the teacher's table and its rule; error parsing; rounding rules (property test against a nearest-value search); combined grade (bounds property); statistics with error grading (part grades, incomplete rows, averages); exam model and CSV |
| `overall.test.ts` | Mark parsing and formatting (NP 0–15, grades 1,0–6,0); mark statistics; weighted average per category and per exam, ignored/zero categories; **property test against an independent fraction computation**; final-mark rounding (half up vs. in the student's favour); weights format/parse; overview builder (column order, sorting, absent, excluded exams with reasons); overview CSV; mark-only exam model and CSV |

## Integration tests

| File | Covers |
|---|---|
| `db.test.ts` | Migrations on an empty DB and pragmas (WAL, foreign keys, secure_delete); cascades for student/exam/class delete; late-joining students; coarser step refused naming the first cell; task add/move/delete/restore; validation; **secure erasure** (a deleted name is absent from `.db`, `-wal`, `-shm` in UTF-8, UTF-16LE and UTF-16BE after student delete, class delete and "Alle Daten löschen"); **backup round-trip**; wrong password / damaged / wrong version / non-SQLite payload change nothing; corrupted DB renamed to `*.defekt-<timestamp>` |
| `storage.test.ts` | Default WAL mode; moving to a folder and back; refusing to overwrite / opening an existing DB instead; unreachable folder and missing DB; lock held by another device ("in use", takeover, detection of a takeover); foreign file change detected before overwrite; folder temporarily gone (change kept, retried by heartbeat); stale locks; **encryption** (no plaintext on disk, password on start, wrong password, change password, disable); backup import and wipe in snapshot mode; damaged plain snapshot renamed; **database from a newer version** (local, shared folder, encrypted) and a **failing migration**: state `incompatible`, file byte-for-byte unchanged, nothing renamed, lock released |
| `grading.test.ts` | Migrations v1 → v6; total-only exams (single task "Gesamt", switching back and forth); error grading (only for grades 1–6, validation, weighting, protection of entered errors); template applies to new subjects only; category rules (in use, last one, other subject or class); copying a class keeps the weighting of each subject; grading system per subject (switching re-grades all exams of that subject only, refused while oral marks exist); directly entered sums lock the task cells; **overview with 3 : 1 weighting** and final-mark rounding |

## End-to-end tests

Every E2E test ends by asserting that the main-process network log (`__nbNetLog`, filled by `session.webRequest.onBeforeRequest`) is empty. Screenshots of the main views are written to `test-results/screenshots/` (in CI: the `e2e-screenshots` artifact) and should be reviewed against the design rules in [specification §7.1](specification.md) after UI changes.

| Test | Covers |
|---|---|
| `courses.test.ts` | Subjects of one class are graded separately (overview, averages, categories, grading system); members (all students by default, removal refused while they have results in the subject, re-adding puts them into existing exams, only students of the class, new class students join every subject); rename/duplicate rules; deleting a subject keeps students and other subjects; **migration v3 → v4** on a realistic database (one course per subject case-insensitively, settings and categories copied per course and remapped, all scores/marks/sums/statuses kept, class without exams, cascades on the rebuilt tables) and a failing migration leaving the file at v3 |
| `workflow.spec.ts` › complete workflow | Empty start; class with 20 pasted names (German sort order); subject "Biologie"; breadcrumb Klasse › Fach › Prüfung; exam with 17 tasks entered by keyboard; all golden scores entered **by keyboard only**; absent students; every grid, footer, panel and key value asserted; linear scheme; task add/rename/move/delete with undo/redo; block paste and rejected invalid paste; out-of-range values rejected; PDF (1 page for 20 students); CSV compared byte by byte; restart persistence; duplicate exam; delete student and class; DB files contain no deleted names |
| `layout.spec.ts` › 1280×720 laptop | 32 students × 10 tasks: 30 px rows, no overflow outside the grid's scroll area, sticky name column / result columns / header and footer rows after scrolling; keyboard navigation keeps the cell visible; linear scheme; navigation overlay closes after a pick; class view; subject overview and member list; settings; info page (version, copyright, all third-party licenses with full text) |
| `layout.spec.ts` › 1440×960 Surface, touch mode | 40 px rows, "⋯" always visible, toolbar hit targets ≥ 40 px, `inputmode="decimal"`, no overflow, sticky columns |
| `grading.spec.ts` | Class and subject from the UI with template categories; a second subject with one student unticked whose marks never reach the first subject and which keeps its own weighting; written exam by keyboard; direct sum entry; oral marks (invalid value rejected, undo/redo); overview averages and final marks; weight change; template change affects only new subjects; **encryption** (file starts with `NBLTDB1`, no names in it); **moving to another folder** (lock file while open, removed on quit, old copy gone); restart with password prompt; folder offline → "Speicherort nicht verfügbar" → retry |
| `errors.spec.ts` | "Art" combo box (all options via the arrow despite typed text, filtering while typing, Enter/Esc inside the list); total-only exam (default) with its single "Punkte" column; error grading from the new-exam dialog (checkbox off by default); points and errors by keyboard; part grades, combined grade and footer averages; invalid error count rejected; undo/redo of the error column; points : errors weighting changed in the subject; overview shows the combined grade |
| `print.spec.ts` | Exam sheet, Notenspiegel and key as PDF for an exam with error grading, and the exam sheet of a total-only exam; the files stay in `test-results/pdf/` for review |
| `onboarding.spec.ts` | Tour on a new installation (name, school, grading template saved; database path and encryption status shown; back/next; finished → not shown after restart); "Überspringen" without the checkbox → shown again, with checkbox (also via Esc) → never again; settings → "Einführung anzeigen"; existing installation with classes → no tour |
| `update.spec.ts` | Against a local stand-in for the releases API: offer on start with release notes rendered as text (no links); "Später" stores nothing; "Diese Version überspringen" → not offered on start, still found by the manual check; download through a redirect with size/SHA-256 check (dry run); tampered download rejected; pre-release not offered; check on start switched off → no request; server unreachable → message |
| `data.spec.ts` | Corrupted DB on start ("Datenbank beschädigt", file renamed, "Neu beginnen"); database from a newer version ("Neuere Notenblatt-Version erforderlich", file unchanged, not renamed); backup (warning, minimum password length, encrypted file); "Alle Daten löschen" (no names left in DB files); import with wrong and correct password |

## Manual release checks

These need a real Windows installation of a release build and cannot be automated in CI. Run them on the installers attached to a release (ideally a pre-release) before announcing it.

| Check | Expected result |
|---|---|
| Install as a **standard user** with the interactive wizard | No UAC prompt; uninstall key in HKCU only; Start-menu and desktop shortcuts created |
| Start with all network adapters disabled | App starts and works normally; no update message on start; "Nach Updates suchen" says GitHub is not reachable |
| Update from the previous release (installed via the wizard, ideally into a custom folder) | Offer with the release notes on start; "Jetzt installieren" closes the app, installs silently into the same folder without UAC and restarts it; data and shortcuts kept; version in settings updated |
| Uninstall with the data checkbox **unchecked** | Program removed; `%APPDATA%\Notenblatt` kept |
| Uninstall with the data checkbox **checked** | `%APPDATA%\Notenblatt` removed |
| Surface / touch walkthrough (or DevTools touch emulation in `npm run dev`) | Touch mode active, tapping a cell starts editing |
| arm64 installer on an ARM device | Installs and starts |
| Einstellungen → "Über Notenblatt" | Shows the release version (not "Entwicklungsversion") and the third-party licenses |

Known gaps (from the last manual review): the checked-checkbox uninstall, the offline start and the arm64 installer had not yet been verified on real hardware, and the automated tests do not cover a real SMB share, two physical devices at once, or sleep/resume of a device holding the lock.
