# Build "Notenblatt": an offline Windows tool for grading exams

> **Note:** This is the original specification Notenblatt was built from, kept for reference. Later changes are recorded in [decisions.md](decisions.md), which takes precedence where the two differ. File names in §8–§10 refer to the original repository layout: `README.md` is now English with the teacher guide in [user-guide.md](user-guide.md), `DEVELOPMENT.md` became [development.md](development.md) and [architecture.md](architecture.md), `DECISIONS.md` is [decisions.md](decisions.md), `TESTREPORT.md` became [testing.md](testing.md), and installers are built by the release workflow.

You are building a complete, production-ready desktop app for German teachers. It replaces two Excel workbooks that teachers use today to grade exams. Everything you need is in this document. Where it makes a decision, follow it. Where it doesn't cover a detail, choose the simplest option that fits the principles in §1 and write it down in `DECISIONS.md`.

The app UI is **German only**. This document is in English, and German UI strings are given verbatim in quotes.

---

## 1. Goals and non-negotiables

1. **Correct grades.** Results must match the two reference spreadsheets to the last decimal (§3). Use exact integer arithmetic, never floating-point arithmetic, for anything that decides a grade (§3.4).
2. **No admin rights, no external dependencies.** Installs per user with no UAC prompt, works fully offline, and needs nothing preinstalled: no .NET, no VC++ runtime, no WebView2, no Node.
3. **Local data only, GDPR-compliant.** No network access at all. Classes, individual students and exams can be deleted completely and irrecoverably (§6).
4. **Usable right away.** A teacher who knows the Excel sheet should be able to grade an exam within two minutes without reading any help.
5. **Professional look.** It should feel like a calm, dense, purpose-built school tool, similar to good Windows line-of-business software. It must not look like a generated web template (§7.1).
6. **Target devices:** a 14" Windows laptop (typically 1920×1080 at 150 % scaling, so a 1280×720 CSS viewport) and a Microsoft Surface Pro (2880×1920 at 200 %, so 1440×960, with touch and pen). Both must work well with mouse/keyboard and with touch.
7. **Tested.** Automated unit, integration and end-to-end tests, including all edge cases listed in §9, must pass before you finish.

---

## 2. Source material: what the two workbooks do

### 2.1 `Notentabelle_Excel.xlsx` (main grading sheet, one exam per sheet)

**Header (row 1):** `<Nr.>` `<Art>` e.g. "2." "Kurzarbeit", "im Fach:" `<Fach>` (Biologie), "Klasse:" `<Klasse>` (F-A11a), "Datum:" `<Datum>` (19.03.2025), "Lehrkraft:" `<Name>`.

**Grid:**

| Row/col | Content |
|---|---|
| Row 3, D–V | Task labels (text): "1.", "2.", "3.1", "3.2", "4.", "5.1", "5.2", "6.", "7" … "15" (19 task columns available) |
| Row 4, D–V | Max points per task. W4 = total max = SUM(D4:V4) |
| Col A | Running number 1–32 |
| Col B / C | "Name" / "Vorname" (light-blue name columns) |
| D–V, rows 5–36 | Points per student and task, in 0.5 steps. Conditional formatting highlights a cell if its value is greater than that task's max |
| W | "Punkte gesamt" = SUM of the row, **blank if the row has no numeric entry at all** |
| X (hidden) | Integer grade 1–6 |
| Y | "Note" = Notenpunkte 0–15 (the visible result) |
| Row 37 "Durchschnitte:" | Per task: ROUNDDOWN(AVERAGE(col), 1), averaging only over cells that have a value. Also for W (1 decimal) and Y (2 decimals) |
| Row 38 "Anteile in %:" | Per task: (truncated average from row 37) / task max × 100, shown as an integer (rounded for display) |

**Right-hand panel "Notenpunkte":** a key table with columns Note | max | – | min | Anzahl | %. It has 16 rows for 15…0 NP. The % column is merged in blocks of three: 15–13, 12–10, 9–7, 6–4, 3–1, and 0 on its own. Below the table:

- "Durchschnitt:" = ROUNDDOWN(AVERAGE(NP), 2)
- "Note 5 und 6: x %"
- "mitgeschrieben: x / y", where x = rows with a result and y = rows with a name
- a column chart "Notenpunkteverteilung" (x-axis 15→0, y-axis count)

A hidden second panel holds the same thing for integer grades 1–6.

**Known flaws in the workbook. Do not copy them:**

- The per-task averages in row 37 only have formulas for task columns D–M and V. Columns N–U have none. The app computes them for every task.
- The sheet is fixed at 32 students and 19 tasks. The app has no fixed limits (see §5.3).
- "mitgeschrieben" uses COUNTA(names). With anonymised rows this shows "17 / 0". The app counts real class members.
- Values above the task max are only coloured, not prevented. The app rejects them (§5.4).

### 2.2 `Notenschlüssel_linear.xls` (decimal grade key)

The teacher enters the max points (the sheet limits this to 100, but that limit is only a table-size restriction and the app ignores it). The sheet then prints a table for every 0.5 step from 0 to max: points → decimal grade → verbal grade. Hidden sheet "Finger weg!" holds the formula `Note = ROUNDDOWN(6 − 5 · Punkte / Max, 1)`, blank if the result is < 1 (which only happens when points > max). 0 points always gives 6,0.

Verbal grade by decimal grade (VLOOKUP table K11:L61):

| Decimal grade | Text |
|---|---|
| 1,0 – 1,4 | "sehr gut" |
| 1,5 – 2,4 | "gut" |
| 2,5 – 3,4 | "befriedigend" |
| 3,5 – 4,4 | "ausreichend" |
| 4,5 – 5,4 | "mangelhaft" |
| 5,5 – 6,0 | "ungenügend" |

Reference values for max = 30: 0 → 6,0 ungenügend · 3 → 5,5 ungenügend · 3,5 → 5,4 mangelhaft · 12 → 4,0 ausreichend · 21 → 2,5 befriedigend · 21,5 → 2,4 gut · 27 → 1,5 gut · 27,5 → 1,4 sehr gut · 30 → 1,0 sehr gut.

---

## 3. Grading engine (exact specification)

Put the engine in a pure TypeScript module, `src/shared/grading/`. It has no dependencies, no I/O and no DOM access. The UI, the print view and the tests all use it.

### 3.1 Units

All point values are stored and calculated as **integers in quarter points** (`qp`): 1 point = 4 qp, so 3,5 points = 14 qp. Per exam, the teacher chooses a **point step** of 1, 0,5 (default) or 0,25. Every max value and every entry must be a multiple of the step.

Notation below: `M` = total max points of the exam, `P` = a student's total points, `Mq`/`Pq` = the same in qp. `floor` is mathematical floor on integers or exact rationals.

### 3.2 Scheme A: "Notenpunkte 0–15" (from Notentabelle)

For NP grade g = 14 … 0, the upper bound in points is `U(g) = floor(M · k_g / 120)`, with:

| g | 14 | 13 | 12 | 11 | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| k_g | 114 | 108 | 102 | 96 | 90 | 84 | 78 | 72 | 66 | 60 | 54 | 48 | 40 | 32 | 24 |
| ≈ % | 95 | 90 | 85 | 80 | 75 | 70 | 65 | 60 | 55 | 50 | 45 | 40 | 33,3 | 26,7 | 20 |

Also `U(15) = M`.

**Grade rule:** the student gets the highest g in 15…1 for which `P > U(g−1)`, otherwise 0.

In integers: `Pq > 4 · floor(Mq · k / 480)`.

With a 0,5 step this is exactly the Excel logic (min of g = U(g−1) + 0,5). The strict ">" form generalises it correctly to 1 and 0,25 steps.

**Key table display:** for each g, show "max" = U(g) and "min" = the smallest valid step value greater than U(g−1) (0 for g = 0). If min > max, the grade can't be reached at this M. Show "–" for both values and grey out the row. This happens for small M, e.g. M = 5: NP 14, 13 and 12 can't be reached.

**Grade groups** (used for the % blocks, the 5/6 share and the optional "Note" column):

| NP | Note |
|---|---|
| 15–13 | 1 |
| 12–10 | 2 |
| 9–7 | 3 |
| 6–4 | 4 |
| 3–1 | 5 |
| 0 | 6 |

The hidden integer 1–6 key in the workbook (thresholds 85/70/55/40/20 %) is mathematically identical to this grouping, so no separate integer scheme is needed.

### 3.3 Scheme B: "Noten 1,0–6,0 (linear)" (from Notenschlüssel linear)

`grade×10 = floor((60 · Mq − 50 · Pq) / Mq)`, using integer division on non-negative integers. The result lies in 10…60 and is shown as "x,y". P = 0 gives 6,0 and P = M gives 1,0. The verbal grade follows the table in §2.2. For statistics, "Note 5 und 6" means a grade ≥ 4,5.

### 3.4 Floating point is forbidden for grade decisions

Naive `Math.floor((6 - 5*p/m)*10)/10` gives wrong grades. For max ≤ 200 at 0,5 steps there are 24 wrong results, e.g. 22/25 → 1,5 instead of 1,6, 44/50 and 66/75 likewise. Use integer arithmetic as specified (JS `number` is exact for these integer sizes, or use BigInt) and add a regression test for these cases.

### 3.5 Statistics (both schemes)

- **Participant:** a student whose status in this exam is "teilgenommen" and who has **at least one** entered value. Rows with no entries count as "noch nicht erfasst". They get no sum and no grade and are excluded from all statistics. This matches the Excel behaviour.
- **Partially filled row:** empty cells count as 0 for the sum. The sum cell gets a small amber marker with the tooltip "Unvollständig: 2 von 8 Aufgaben ohne Eintrag". It still counts in the statistics.
- **Per-task average:** truncate (ROUNDDOWN) to 1 decimal, averaging over participants who have a value in that task. Show empty if there are none.
- **Per-task share:** (truncated average) / task max × 100, displayed rounded to an integer, with "%" in the header.
- **Average of the sums:** truncated to 1 decimal.
- **Average grade:** NP truncated to 2 decimals. Linear grade truncated to 2 decimals.
- **Distribution:** NP shows the count per NP 15…0 plus the % per grade group (1 decimal). Linear shows the count per verbal band 1–6 plus %.
- **"Note 5 und 6"** in % (1 decimal): NP = share of 0–3 NP. Linear = share of grades ≥ 4,5.
- **"mitgeschrieben: x / y":** x = participants, y = all students of the class listed in the exam (excluding none). Also show "fehlt: z" when z > 0.
- All truncations operate on exact rationals (sum and count as integers), never on rounded floats.

### 3.6 Golden test data (taken from the original workbook; must reproduce exactly)

The exam has 17 tasks. Labels and max points:

| Label | 1. | 2. | 3.1 | 3.2 | 4. | 5.1 | 5.2 | 6. | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Max | 6 | 2 | 3 | 2 | 2 | 2 | 3 | 6 | 3 | 4 | 5 | 2 | 3 | 4 | 5 | 1 | 2 |

So **M = 55**. Tasks 7–15 have no entries.

Entries for tasks 1. … 6. (students 10, 17 and 18 have no entries):

```
 1: 3,5 0,5 1   0 0 0   0   3       sum  8,0 -> NP 0  | linear 5,2
 2: 4,5 1,5 2,5 0 0 2   1   5,5     sum 17,0 -> NP 2  | 4,4
 3: 3,5 0,5 2   2 0 1   1   4,5     sum 14,5 -> NP 2  | 4,6
 4: 3,5 1,5 0,5 2 1 0,5 1   3,5     sum 13,5 -> NP 1  | 4,7
 5: 0   1   1   1 0 1,5 1,5 5,5     sum 11,5 -> NP 1  | 4,9
 6: 5   0,5 1   2 0 0,5 0,5 3,5     sum 13,0 -> NP 1  | 4,8
 7: 4,5 1   2,5 2 0 2   1   2,5     sum 15,5 -> NP 2  | 4,5
 8: 4   0,5 2   2 0 0   0   5,5     sum 14,0 -> NP 1  | 4,7
 9: 4,5 1,5 1,5 2 1 2   1   5,5     sum 19,0 -> NP 3  | 4,2
11: 3   0,5 2   2 0 1   0   6       sum 14,5 -> NP 2  | 4,6
12: 5,5 1,5 1   2 1 2   0,5 6       sum 19,5 -> NP 3  | 4,2
13: 6   1,5 2   2 0 2   1   4,5     sum 19,0 -> NP 3  | 4,2
14: 3,5 1,5 1,5 2 0 1   1   4,5     sum 15,0 -> NP 2  | 4,6
15: 5,5 2   3   2 1 0,5 1   5       sum 20,0 -> NP 3  | 4,1
16: 5   2   2   1 0 2   1   6       sum 19,0 -> NP 3  | 4,2
19: 3,5 1,5 0,5 2 0 0   2,5 5,5     sum 15,5 -> NP 2  | 4,5
20: 4   1,5 1   2 2 1,5 0   5,5     sum 17,5 -> NP 2  | 4,4
```

Note: these rows are only partially filled (tasks 7–15 are empty), so they will show the "unvollständig" marker. That is correct.

Expected results:

- **Participants:** 17.
- **Per-task averages** (tasks 1.–6.): 4 · 1,2 · 1,5 · 1,6 · 0,3 · 1,1 · 0,8 · 4,8.
- **Per-task shares:** 67 · 60 · 50 · 80 · 15 · 55 · 27 · 80 %. Tasks 7–15 are empty.
- **Average sum:** 15,6.
- **NP key for M = 55** (max–min):

  | NP | max – min |
  |---|---|
  | 15 | 55–52,5 |
  | 14 | 52–49,5 |
  | 13 | 49–46,5 |
  | 12 | 46–44,5 |
  | 11 | 44–41,5 |
  | 10 | 41–38,5 |
  | 9 | 38–35,5 |
  | 8 | 35–33,5 |
  | 7 | 33–30,5 |
  | 6 | 30–27,5 |
  | 5 | 27–24,5 |
  | 4 | 24–22,5 |
  | 3 | 22–18,5 |
  | 2 | 18–14,5 |
  | 1 | 14–11,5 |
  | 0 | 11–0 |

- **NP distribution:** 3 → 5, 2 → 7, 1 → 4, 0 → 1. Group %: 3–1 = 94,1 %, 0 = 5,9 %. Average NP 1,94. "Note 5 und 6" 100 %.
- **Linear scheme on the same data:** average 4,51. 10 × mangelhaft, 7 × ausreichend. "Note 5 und 6" 58,8 %.

More engine golden values:

- NP key, M = 30: 15: 30–28,5 · 14: 28–27,5 · 13: 27–25,5 · 12: 25–24,5 · 11: 24–22,5 · 10: 22–21,5 · 9: 21–19,5 · 8: 19–18,5 · 7: 18–16,5 · 6: 16–15,5 · 5: 15–13,5 · 4: 13–12,5 · 3: 12–10,5 · 2: 10–8,5 · 1: 8–6,5 · 0: 6–0.
- NP key, M = 37,5: 15 min 35,5 · 3 is 15–12,5 · 0 is 7–0.
- NP key, M = 1: only 15 (1–0,5) and 0 (0–0) can be reached.
- Linear, M = 7: 0→6,0 · 0,5→5,6 · 1→5,2 · 2→4,5 · 3,5→3,5 · 5,5→2,0 · 6,5→1,3 · 7→1,0.
- Linear, M = 18,75 with step 0,25: 0,25→5,9 · 9,25→3,5 · 18,5→1,0.

---

## 4. Tech stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Shell | **Electron** (latest stable at implementation time, exact version pinned) | Ships its own Chromium and Node, so it has zero system dependencies. WebView2-based options can't be guaranteed without admin rights. |
| Build | **electron-vite**, **TypeScript strict**, Node 22 LTS for tooling | |
| UI | **React 19**, plain CSS with design tokens (CSS custom properties, CSS Modules) | **No UI component kit** (no MUI, shadcn, Chakra, Bootstrap, Tailwind UI). Every component is written in-house so it matches §7. |
| State | Zustand (renderer). The DB is the source of truth, and every edit is persisted immediately. | |
| Database | **SQLite via `better-sqlite3`**, compiled for Electron with `electron-builder install-app-deps`, in the main process only | |
| IPC | `contextBridge` preload exposing a typed API. Every payload is validated in main with **zod**. | |
| Charts | Hand-written SVG component, no chart library | |
| Icons | ~15 SVGs copied from **Fluent UI System Icons** (MIT, 20px regular) into `src/renderer/icons/`. No icon font, no runtime icon package. | |
| Fonts | System font: `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` with `font-variant-numeric: tabular-nums` in grids. No web fonts. | |
| PDF/print | `webContents.printToPDF` and `webContents.print` from a dedicated print route | |
| Packaging | **electron-builder, NSIS** with `oneClick: false`, `perMachine: false`, `allowElevation: false`, `allowToChangeInstallationDirectory: true`, target x64 (also arm64 if the build succeeds, for Surface Pro X/11). Installs to `%LOCALAPPDATA%\Programs\Notenblatt`. Creates start-menu and optional desktop shortcuts. | |
| Tests | **Vitest** (engine, stats, parser, DB), **fast-check** (property tests), **Playwright `_electron`** (E2E) | |
| CI | GitHub Actions `windows-latest`: lint, typecheck, all tests, build installer, upload artifact | |

Project layout:

```
src/main/        app lifecycle, window, db/ (schema, migrations, repositories), ipc/, print/, backup/
src/preload/     typed bridge
src/shared/      grading/ (engine, stats, keys), parse/ (number parsing/formatting), types
src/renderer/    React app: views/, components/, grid/, styles/tokens.css
tests/           unit/, integration/ (db), e2e/
```

**Electron hardening:**

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP (`default-src 'self'`).
- Block all non-`file:`/app-protocol requests via `session.webRequest.onBeforeRequest`.
- No auto-updater, no telemetry, no crash reporter upload.
- `spellcheck: false`, because the spellchecker's custom dictionary would otherwise store student names.
- Navigation and `window.open` disabled.
- Single-instance lock: a second launch focuses the existing window.
- Window size and position remembered. Minimum window size 1024×680.

---

## 5. Functional requirements

### 5.1 Data model (SQLite, migrations via `PRAGMA user_version`)

```sql
school_class(id INTEGER PK, name TEXT NOT NULL, school_year TEXT NOT NULL,   -- e.g. "2025/26"
             created_at, updated_at)
student(id INTEGER PK, class_id INTEGER NOT NULL REFERENCES school_class ON DELETE CASCADE,
        last_name TEXT NOT NULL, first_name TEXT NOT NULL DEFAULT '', created_at)
exam(id INTEGER PK, class_id INTEGER NOT NULL REFERENCES school_class ON DELETE CASCADE,
     kind TEXT NOT NULL,            -- "Schulaufgabe", "Kurzarbeit", "Stegreifaufgabe", "Test", "Klausur", or free text
     number TEXT,                   -- "2."
     subject TEXT NOT NULL, exam_date TEXT NOT NULL /* ISO */, teacher TEXT,
     scheme TEXT NOT NULL CHECK (scheme IN ('NP15','LIN6')),
     step_qp INTEGER NOT NULL CHECK (step_qp IN (1,2,4)) DEFAULT 2,
     notes TEXT, created_at, updated_at)
task(id INTEGER PK, exam_id INTEGER NOT NULL REFERENCES exam ON DELETE CASCADE,
     position INTEGER NOT NULL, label TEXT NOT NULL, max_qp INTEGER NOT NULL CHECK (max_qp > 0))
participation(exam_id REFERENCES exam ON DELETE CASCADE, student_id REFERENCES student ON DELETE CASCADE,
              status TEXT NOT NULL CHECK (status IN ('present','absent')) DEFAULT 'present',
              PRIMARY KEY (exam_id, student_id))
score(task_id REFERENCES task ON DELETE CASCADE, student_id REFERENCES student ON DELETE CASCADE,
      points_qp INTEGER NOT NULL CHECK (points_qp >= 0), PRIMARY KEY (task_id, student_id))
setting(key TEXT PK, value TEXT)
```

- `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `secure_delete = ON`.
- The database file lives at `%APPDATA%\Notenblatt\notenblatt.db`.
- No personal data in log files. Log only IDs and error codes.
- A student who joins the class later appears in every existing exam of that class with status "present" and no entries.
- Every write is a single transaction. There is no "Speichern" button. A quiet status text in the status bar reads "Gespeichert" or "Speichern fehlgeschlagen – …".

### 5.2 Classes and students ("Klassen")

- Create a class with a name and a school year (default: the current one, where the school year switches on 1 August).
- Rename, or "Klasse kopieren…", which copies the names into a new class, e.g. for the next school year, **without** any exams.
- **Add students:** inline new row (Name, Vorname), or "Namen einfügen…" from the clipboard. Accept one student per line as "Nachname, Vorname", "Nachname<TAB>Vorname" (Excel/ASV paste) or "Nachname Vorname". Show a preview table with a "Spalten tauschen" toggle, trim whitespace, skip empty lines, and flag duplicates (allowed after confirmation).
- Sorting: by last name, then first name, using German collation (`Intl.Collator('de')`), so Ä sorts with A, and so on. The number in the grid is the position in this order.
- Edit names inline.
- Delete is covered in §6.

### 5.3 Exams ("Prüfungen")

- Dialog "Neue Prüfung" with these fields:
  - Klasse (preselected)
  - Art: combobox with the presets above plus free text
  - Nr.
  - Fach: free text, autocomplete from earlier exams
  - Datum: default today, displayed `TT.MM.JJJJ`
  - Lehrkraft: default from settings
  - Bewertung: radio "Notenpunkte 0–15" / "Noten 1,0–6,0 (linear)"
  - Punkteschritt: 1 / 0,5 / 0,25
  - Aufgaben: either "Anzahl" (default 5, labels "1"…"n", max points entered afterwards in the grid) or "Struktur übernehmen von…", which copies labels and max points from any existing exam, e.g. a parallel class.
- All exam metadata stays editable in the exam header bar.
- **Changing the scheme** after scores have been entered is allowed and only recomputes results.
- **Changing to a coarser step** is refused if existing values don't fit, with a message naming the first conflicting cell.
- **Tasks are flexible columns:**
  - add a task with the "+" header at the end of the task columns
  - each task header has a "⋯" button (visible on hover/focus, always visible in touch mode) with "Links einfügen", "Rechts einfügen", "Nach links", "Nach rechts", "Löschen"
  - edit the label and max points inline in the two header rows
  - deleting a task that has entries asks for confirmation and states how many entries will be removed
  - no upper limit on the number of tasks (test up to 40), at least 1 task
- "Prüfung duplizieren" (structure only) and "Prüfung löschen".

### 5.4 Score grid (main screen, modelled on the Notentabelle layout)

Columns from left to right:

| Column | Behaviour |
|---|---|
| Nr | sticky left |
| Name | sticky left, light tinted background like the original |
| Vorname | sticky left |
| Task columns | one per task |
| Summe | sticky right; header shows the total max |
| NP or Note | sticky right; linear shows "2,4" plus the verbal grade in a narrow secondary column |
| Note (1–6) | optional, NP scheme only, via toggle "Notenäquivalent anzeigen" |

- **Two sticky header rows:** row 1 has the task labels with "Aufgabe" on the left. Row 2 has the max points with "max. Punkte" on the left. The max row has a subtle tint, echoing the green header in the original.
- **Two sticky footer rows:** "Durchschnitt" and "Anteil in %" (§3.5).
- **Absent students:** row menu or a status toggle in the Nr cell with "Fehlt" / "Teilgenommen". The row is greyed out, its results show "–", it can't be edited and it is excluded from statistics.

**Input:**

- Accept "3,5", "3.5", ",5", "3,50" and leading/trailing spaces.
- Reject negative values, non-numbers, values above the task max and values that aren't multiples of the step.
- A rejected value is not stored. The cell reverts and an inline message appears for 4 s in the status area, e.g. "Aufgabe 3.1: höchstens 3 Punkte" or "Nur Schritte von 0,5 erlaubt".
- An empty value deletes the entry.
- Display: points with a comma and no trailing ",0" ("3,5", "1", "0"). Grades use one decimal place ("2,0"). Numbers are right-aligned with tabular figures.

**Keyboard (spreadsheet-like):**

- Arrow keys move the cell focus.
- Typing a number overwrites the cell; F2 or a double-click edits it.
- Enter commits and moves **down** by default, which suits grading one task across all students. A toolbar toggle "Enter: ↓ / →" switches this and is persisted.
- Tab and Shift+Tab move right and left.
- Esc cancels the edit. Del clears the cell.
- Ctrl+Z / Ctrl+Y undo and redo the last 100 cell edits per exam. The undo history is cleared when a student is deleted.
- Ctrl+C / Ctrl+V copy and paste rectangular blocks (tab-separated, compatible with Excel). A paste validates every cell and is applied as one undo step only if all cells are valid. Otherwise nothing is applied and the first error is shown.

**Touch (Surface):**

- Detect `(pointer: coarse)` and offer "Touch-Modus" (Auto/An/Aus) in settings.
- Touch mode uses a row height of 40 px instead of 30 px, hit targets of at least 40 px, and always-visible "⋯" buttons.
- Inputs use `inputmode="decimal"` so the Windows touch keyboard shows its number layout.
- Tapping a cell starts editing.
- No hover-only functionality anywhere.

**Highlighting (restrained):**

- The focused cell gets a 2 px accent outline.
- The current row and column headers get a light tint.
- NP 0–3 or grade ≥ 4,5 is shown in dark red text. No other result colouring.

### 5.5 Evaluation panel ("Auswertung") on the right, about 300 px wide

1. **Key table ("Notenschlüssel"):**
   - NP scheme: NP | von | bis | Anzahl | % per group of three (merged cells as in the original). Unreachable grades are greyed out with "–".
   - Linear scheme: Note | Notenbereich (e.g. "1,0–1,4") | Punkte von–bis | Anzahl | %.
   - Point ranges are computed by evaluating every step value from 0 to M.
2. **Key figures:** "Durchschnitt", "Note 5 und 6", "mitgeschrieben x / y", "fehlt".
3. **Distribution chart:** SVG column chart. NP uses 16 columns from 15 to 0. Linear uses 6 columns, one per verbal band. Flat fills in one neutral colour, with the bars for grades 5/6 in the muted red. Thin axis, integer y ticks, no gradients, no animation.
4. Button "Vollständigen Schlüssel anzeigen". It opens a dialog or print view with the full point→grade table for every step from 0 to M, like the linear workbook: points | grade | verbal grade (linear), or points | NP | Note (NP).

On viewports narrower than 1366 px, the left navigation collapses to a 48 px icon rail. The panel stays visible and can be toggled with Ctrl+J.

### 5.6 Navigation and screens

- **Left navigation (220 px, collapsible with Ctrl+B):** classes grouped by school year (newest first). Under each class are its exams, sorted by date with the newest first, shown as "Kurzarbeit 2 · Biologie · 19.03.2025".
- **Buttons:** "Neue Klasse" and "Neue Prüfung".
- **Toolbar:** "Einstellungen" and "Hilfe".
- **First start with an empty database:** a plain page with two numbered steps, "1 Klasse anlegen" and "2 Prüfung anlegen", each with a short sentence and one button. No illustration and no welcome slogan.
- **Later starts:** the app opens the last opened exam.
- **Class view:** student table plus a list of the class's exams.
- **Settings ("Einstellungen"):**
  - Lehrkraft (default name)
  - Schule (optional, appears on printouts)
  - Enter direction
  - Touch mode
  - Retention reminder (§6)
  - "Speicherort öffnen"
  - "Datensicherung…"
  - "Alle Daten löschen…"
- **Help ("Hilfe"):** a single static page in German. It covers both grading formulas as in §3 with one example each, the keyboard shortcuts and a privacy note.

### 5.7 Output

- **Print / PDF ("Drucken…", "Als PDF speichern…"):** one A4 landscape page per exam. It mirrors the original layout: header line, grid with sums and grades, footer rows, and the key table plus figures plus chart on the right. If there are more than about 32 students, the grid continues on page 2 with the headers repeated. Black and white must stay readable. Use only hairlines and grey tints.
- **"Notenspiegel drucken":** anonymised. It contains exam header, distribution, average and the 5/6 share, but no names. This is for announcing results to the class.
- **"Schlüssel drucken":** the full key table from §5.5.4.
- **CSV export:** one exam per file. Use `;` as separator, UTF-8 with BOM and a decimal comma, so it opens correctly in German Excel. Columns: Nr; Name; Vorname; each task; Summe; Note; Status.
- **Default file names:** `2025-03-19_F-A11a_Biologie_Kurzarbeit-2.pdf/.csv`, with invalid characters stripped.

### 5.8 Backup ("Datensicherung")

- **Export** writes a consistent SQLite snapshot (`db.backup()`) to a `.notenblatt` file the user picks. It is **always encrypted**: the user enters a password twice (minimum 8 characters). Use AES-256-GCM, with the key derived via scrypt from Node `crypto` (no extra dependency), a random salt and nonce, and a file header with a format version.
- A dialog warns that the file contains personal data.
- **Import** replaces all data after a confirmation that names the counts, e.g. "4 Klassen, 112 Schüler, 23 Prüfungen".
- **Wrong password or a damaged file:** show a clear error and change nothing.

---

## 6. Data protection and deletion (GDPR)

1. **Delete a student:** removes the student row and, by cascade, all their scores and participations.
   - Confirmation dialog: "Schüler/in **Name, Vorname** und alle zugehörigen Ergebnisse (n Einträge in m Prüfungen) endgültig löschen? Dies kann nicht rückgängig gemacht werden."
   - Multi-select delete in the class view.
2. **Delete a class:** removes the class, its students, exams, tasks, participations and scores.
   - The dialog lists the counts.
   - The user must type the class name to confirm.
3. **Delete an exam:** removes the exam with its tasks, scores and participations.
4. **Physical erasure:** after every delete, run the transaction, then `PRAGMA wal_checkpoint(TRUNCATE)`. After deleting a student, class or exam, also run `VACUUM`. With `secure_delete = ON`, no deleted name or score may remain in `notenblatt.db`, `-wal` or `-shm`. Test this (§9).
5. **In-memory traces:** clear the undo history, any renderer caches and the clipboard copy made by the app if it contains the deleted person (best effort). Never write names to logs, `localStorage`, IndexedDB or Electron caches. Renderer storage is not used at all; window state goes in the settings table.
6. **"Alle Daten löschen…":** closes the DB, deletes the DB, WAL, SHM and settings, clears the Electron session data (`session.clearStorageData`, `clearCache`) and restarts with an empty database. The user must type "LÖSCHEN" to confirm.
7. **Uninstaller:** shows a checkbox "Alle gespeicherten Daten (Klassen, Noten) ebenfalls löschen", unchecked by default. When checked, the uninstaller deletes `%APPDATA%\Notenblatt`. Implement this via a custom NSIS include.
8. **Retention reminder:**
   - Setting "Hinweis auf alte Klassen nach … Monaten" with values 6/12/24/Aus, default 12.
   - On start, if a class's school year ended more than that long ago (school year ends 31 July), show one dismissible notice bar: "3 Klassen aus abgelaufenen Schuljahren gespeichert – Prüfen", which opens a list with delete actions.
   - No other nagging.
9. **No network:** no data ever leaves the device unless the user explicitly exports it. State this in the help page.

---

## 7. UI and visual design

### 7.1 Character

The app should look like a well-made Windows tool (think Excel, Outlook settings or a good school administration program): dense, aligned, quiet and predictable.

**Explicitly forbidden:**

- gradients, glassmorphism, blur, glow and large drop shadows
- emoji, illustrations, mascots and "sparkle" or AI icons
- oversized rounded cards and dashboard tiles, pill badges everywhere
- centred hero sections and marketing or chatty copy ("Willkommen zurück! 🎉")
- purple, indigo or teal "startup" accents
- skeleton shimmer and decorative animations
- floating action buttons and toasts stacked in a corner

### 7.2 Tokens (`styles/tokens.css`)

**Colours:**

| Token | Value |
|---|---|
| Window background | `#F3F4F6` |
| Surface | `#FFFFFF` |
| Grid lines | `#D5D9DE` |
| Header cells | `#EDEFF2` |
| Name columns | `#F0F5FA` (echoes the original's blue) |
| Max-points row | `#F1F5EC` (echoes the original's green) |
| Text | `#1E2329` |
| Secondary text | `#5B6570` |
| Disabled text | `#9AA3AD` |
| Accent | `#245B85` (focus, selection, primary button, links) |
| Accent tint | `#E3EDF5` |
| Error | `#A8261B` on `#FBEAE8` |
| Warning | `#8A5A00` on `#FFF3D6` |
| Low-grade text | `#A8261B` |

**Other tokens:**

- Font sizes 12 / 13 (grid) / 14 (UI) / 16 (view titles) / 20 (page title, rarely used). Weights 400/600 only.
- Spacing scale 4/8/12/16/24.
- Border radius 3 px for controls, 4 px for dialogs, 0 for grid cells.
- One shadow level, for menus and dialogs only: `0 4px 12px rgba(0,0,0,.12)`.
- Focus ring: 2 px accent, always visible on keyboard focus.

### 7.3 Components and copy

- **Buttons:** primary (accent fill, used at most once per view), secondary (white with border) and quiet text buttons. Icons are 20 px with labels next to them. Icon-only buttons need a tooltip.
- **Dialogs:**
  - Modal and max 560 px wide, with the title in plain German ("Prüfung löschen").
  - Buttons sit bottom right in Windows order (primary, then "Abbrechen").
  - Destructive actions use a red primary button with an explicit verb ("Endgültig löschen").
- **Wording:** plain, formal German addressing the user as "Sie" in sentences, with infinitive labels for actions ("Prüfung anlegen", "Namen einfügen").
- **Number formatting:** `Intl.NumberFormat('de-DE')`.
- **Empty states:** one line of grey text plus one button. No pictures.
- **Contrast:** WCAG AA everywhere. All functions are reachable by keyboard, and grid cells have proper ARIA grid roles.

### 7.4 Layout checks

- At 1280×720 a class of 32 with 10 tasks must be fully usable. Rows may scroll, but headers, footers, the name columns and the result columns stay visible.
- At 1440×960 (Surface, touch mode) the same applies with 40 px rows.
- Nothing may overflow horizontally outside the grid's own scroll area.

---

## 8. Packaging and delivery

- `npm run dist:win` produces `Notenblatt-Setup-<version>-x64.exe` (and the arm64 build if possible). The installer is fully self-contained, has no download step and needs no admin rights.
- Use the app ID `de.notenblatt.app`, the product name "Notenblatt" and a plain monochrome app icon: a simple grid symbol, no gradients. Provide `.ico` and `.png`.
- The installer is unsigned. Document the SmartScreen "Weitere Informationen → Trotzdem ausführen" step in the README, with a short German explanation.
- If you're on Linux or macOS, build and test there. The Windows installer is then produced by the GitHub Actions workflow on `windows-latest`. Make sure the workflow is green.

**Deliverables:**

1. The source repository with lockfile.
2. `README.md` in German for teachers: installation, first steps, privacy.
3. `DEVELOPMENT.md`: build, test, architecture, how to add a new grading key.
4. `DECISIONS.md`.
5. The CI workflow.
6. The installer artifact.
7. `TESTREPORT.md`: test counts, coverage of `src/shared` (at least 95 % lines/branches), and screenshots at 1280×720 and 1440×960 (touch).

---

## 9. Tests (all must pass)

### 9.1 Engine (Vitest plus fast-check)

- Every golden value in §2.2 and §3.6.
- **Exhaustive check:** for every M from 0,5 to 150 in 0,5 steps and every P from 0 to M in 0,5 steps, compare the engine against an **independent reference implementation in the test folder** that uses BigInt rationals and the literal Excel formulation (min = U + 0,5, ≥ comparison). It must match 100 %. Repeat with 0,25 steps using the strict ">" formulation.
- **Properties:**
  - more points never give a worse grade
  - P = 0 gives 0 NP / 6,0
  - P = M gives 15 NP / 1,0
  - the NP grade group is consistent with the Note column
  - linear grades always lie in [1,0; 6,0]
- **Float regression:** 22/25 → 1,6, 44/50 → 1,6 and 66/75 → 1,6 in the linear scheme.
- **Small-M edge cases:**
  - M = 0,5, 1 and 5 produce correct unreachable key rows
  - M with a fractional part (37,5; 18,75)
  - a single task
  - 40 tasks
  - very large M (999)
- **Statistics edge cases:**
  - zero participants: all statistics are empty, with no division by zero and no NaN anywhere
  - one participant
  - all participants absent
  - a partially filled row
  - a task nobody answered
  - all scores 0
  - all scores at max

### 9.2 Parser and formatter

- Valid: "3,5" "3.5" " 3 " ",5" "3,50" "0".
- Invalid: "-1" "abc" "1e2" "3,,5" "3,25" when the step is 0,5, and "7" when the max is 6.
- Empty input deletes the entry.
- Formatting round-trips.

### 9.3 Database (integration, using a temporary file)

- Migrations on an empty DB.
- The cascades from §6.1–6.3, with exact counts afterwards.
- A student added later appears in existing exams.
- A coarser step is refused when values conflict.
- **Secure erasure test:**
  1. Create a student "Zqxwvy Testperson" with scores.
  2. Delete the student.
  3. Read the raw bytes of `.db`, `-wal` and `-shm` and assert that the string occurs in neither UTF-8 nor UTF-16.
  4. Repeat the same check for class deletion and "Alle Daten löschen".
- **Backup round-trip:** export, wipe, import, and the data is identical. A wrong password changes nothing.
- **Corrupted DB file on start:** the app shows the dialog "Datenbank beschädigt", renames the file to `*.defekt-<timestamp>` and offers "Neu beginnen" or "Datensicherung wiederherstellen". It must never crash.

### 9.4 End-to-end (Playwright with Electron)

1. Start on an empty database.
2. Create a class and paste 20 names in the format "Nachname, Vorname" with tab variants.
3. Create an exam with 8 tasks and enter the max points from §3.6 (tasks 1.–6.).
4. Enter the §3.6 scores **using only the keyboard**, with Enter moving down within a task column.
5. Mark three students as absent. Assert that every value in the grid, the footer and the panel matches §3.6.
6. Switch to the linear scheme and assert the §3.6 linear values. Switch back.
7. Add, rename, move and delete tasks. Undo and redo.
8. Paste a 3×4 block from the clipboard, then paste an invalid block and check that it is rejected completely.
9. Enter a value above the max and check that it is rejected with a message.
10. Restart the app and check that the data persists and the last exam reopens.
11. Delete a student and check that the student is gone from every exam and that the statistics are updated.
12. Delete the class.
13. Print to PDF and check that the file exists and is non-empty, with one page for a class of 20.
14. Export CSV and check the content byte by byte, including the BOM, `;` and decimal commas.
15. Viewport tests at 1280×720 and 1440×960 with touch mode: no element overflows the window and the sticky columns stay visible after horizontal scrolling.
16. Network guard: assert that no request other than the app protocol is made during the whole run.

### 9.5 Manual Windows check (document the results in TESTREPORT.md)

- Install as a **standard user** with no UAC prompt.
- Start with network adapters disabled.
- Do the Surface touch walkthrough, or emulate it with Chrome DevTools touch emulation in dev mode if no device is available.
- Uninstall twice: once with the data checkbox unchecked (data remains) and once with it checked (the `%APPDATA%\Notenblatt` folder is gone).

---

## 10. Definition of done

- Every requirement in §3–§8 is implemented, and every test in §9 is green locally and in CI.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run e2e` all pass with zero warnings in strict mode.
- The installer was built by CI and installs without admin rights.
- The UI follows §7. Review your own screenshots against the forbidden list in §7.1 before finishing.
- The README, DEVELOPMENT.md, DECISIONS.md and TESTREPORT.md are written.
