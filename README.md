# Notenblatt

Notenblatt is an offline Windows app for German teachers to grade exams. It replaces the familiar Excel grading sheet ("Notentabelle"): no formulas, no fixed number of rows or columns, no rounding errors. The app's user interface is German.

- Enter points per task; total and grade appear immediately.
- Grading in **Notenpunkte 0–15** or as **Noten 1,0–6,0 (linear)**, computed with exact integer arithmetic.
- Grade key, average, "Note 5 und 6" share, distribution and chart are calculated automatically.
- **Whole-class grade book:** written exams with points and oral marks ("Nur Note"), weighted by category (e.g. written : oral = 3 : 1), with a weighted overall average and final mark per student.
- Optional **AES-256 encryption** of the database and a **custom storage folder**, e.g. on a network share used by several devices (one at a time).
- Print and PDF in the layout of the grading sheet, anonymous grade distribution ("Notenspiegel") for the class, CSV export for Excel.
- Runs **offline**. All data stays on the device; the only network access is the optional update check against this repository's GitHub releases.
- Short first-start tour and **in-app updates** with the release notes shown before installing.

## Installation

Download the installer from the [GitHub Releases](../../releases) page:

- `Notenblatt-Setup-<version>-x64.exe` for regular Windows PCs and laptops
- `Notenblatt-Setup-<version>-arm64.exe` for ARM devices (Surface Pro X / Surface Pro 11)

The installer needs **no administrator rights** and installs for the current user only (default folder `%LOCALAPPDATA%\Programs\Notenblatt`). Nothing else needs to be installed.

The installer is not code-signed, so Windows SmartScreen shows "Der Computer wurde durch Windows geschützt" on first launch. Click **"Weitere Informationen"** and then **"Trotzdem ausführen"**.

## Documentation

| Document | Contents |
|---|---|
| [User guide](docs/user-guide.md) | First steps, oral marks and weighting, storage and encryption, privacy, backup, uninstalling, troubleshooting |
| [Development](docs/development.md) | Setup, running the app from source, scripts, conventions, releasing |
| [Architecture](docs/architecture.md) | Processes, data flow, storage modes, grading arithmetic, security invariants, adding a grading key |
| [Testing](docs/testing.md) | Test suites and what they cover, manual release checks |
| [Decisions](docs/decisions.md) | Design decisions and deviations from the specification, with reasons |
| [Specification](docs/specification.md) | The original product specification |

## Quick start for developers

Requires Node.js 26 LTS.

```bash
npm ci
npm run dev    # run the app from source with hot reload
npm test       # unit and integration tests
```

Installers are built by GitHub Actions when a release is published; see [Development → Releasing](docs/development.md#releasing).

## License

Copyright © 2026 Christian Häußler. Released under the [MIT License](LICENSE).

Notenblatt includes third-party software (Electron, React, SQLite and others); their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the app under Einstellungen → "Über Notenblatt".
