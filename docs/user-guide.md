# User guide

This guide is for teachers using Notenblatt. The app's interface is German; labels of buttons, menus and dialogs are quoted here exactly as they appear on screen.

For installation see the [README](../README.md#installation).

## First steps (about 2 minutes)

On the first start a short tour (five steps, about a minute) asks for your name and school, shows the grading defaults for new subjects, where your data is stored and how to encrypt it, and explains classes, subjects and the kinds of exams. "Überspringen" shows it again on the next start; tick "Nicht mehr anzeigen" to skip it for good. Settings → "Einführung anzeigen" opens it again.

1. **Create a class** – enter a name (e.g. `F-A11a`) and the school year.
2. **Paste names** – in the class, click "Namen einfügen…" and paste the name list, e.g. copied from Excel or ASV. One line per student:
   - `Müller, Anna`
   - `Müller⇥Anna` (two columns from Excel/ASV)
   - `Müller Anna`

   If first and last names are swapped, tick "Spalten tauschen".
3. **Add a subject** – in the class, click "Neues Fach" and enter the subject you teach there (e.g. Mathematik). Add one subject for each subject you teach in this class. All students of the class take part at first; under "Prüfungen und Schüler/innen" you can untick students who do not take the subject (e.g. elective subjects or split groups).
4. **Create an exam** – choose the class and subject, the kind (e.g. Kurzarbeit), number, date and number of tasks. Alternatively use "Struktur übernehmen von…" to copy the tasks and max points of another exam (e.g. a parallel class).
5. **Enter max points** – fill in the green "max. Punkte" row of the grid. You can overwrite the task labels in the row above (e.g. `3.1`).
6. **Enter points** – type a number and press **Enter**: the cursor moves down to the next student. This way you grade one task for the whole class in one go.

There is no "Save" button – every entry is saved immediately, and the status bar shows "Gespeichert".

## Oral marks and the overall average

Grades are always calculated **per subject**: exams of different subjects of one class are never averaged together, and each subject has its own weighting.

1. In the subject, open the **"Gewichtung"** tab to check categories and weights, e.g. "Schriftlich ×3" and "Mündlich ×1". You can rename categories, add new ones (e.g. "Referat") and change the weights.
2. To enter an oral mark, click **"Note „Mündlich“ eintragen"** in the **"Notenübersicht"** (or create a new exam with entry mode "Nur Note"). Then type the marks directly – as Notenpunkte (0–15) or grades (1,0–6,0), depending on the subject's grading system.
3. The **"Notenübersicht"** of the subject shows all its grades, the average per category, the weighted **overall average** and the **final mark** of every student. Every exam counts with the weight of its category. "CSV" exports the overview for Excel.

The **grading system** (Notenpunkte or grades 1–6), the **rounding** (half up, at exactly x,5 in the student's favour, or truncate — used for all averages, the grade of exams with error grading and the final mark), the **final mark** (for grades 1–6 to whole grades or one decimal, or none), the **error weighting** (points : errors, default 1 : 1) and the **weights** are set **per subject** (subject → "Gewichtung"). All exams of a subject use its grading system. Under "Vorlage für neue Fächer" in the settings you define what new subjects start with; existing subjects are not affected.

**Points per task or total only:** a new points exam asks only for the maximum and takes one total per student. Tick "Punkte je Aufgabe eingeben" to enter points per task (number of tasks, or the structure of an earlier exam). In the grid, white cells are entries and grey cells are calculated.

**Error grading:** in subjects graded 1–6, tick "Fehlerbewertung" when creating a points exam (or later in the exam's header). The grid gets a "Fehler" column (half errors allowed) and the part grades "Note P." (points) and "Note F." (errors, fixed table: 0,3 per error up to 9 errors, 0,5 from the 10th, half an error half of that truncated, 6,0 from 14). The exam grade is the weighted mean of both, rounded to one decimal by the subject's rule; only it appears in the subject's overview. "Vollständigen Schlüssel anzeigen" also shows the error table.

**Updating from an earlier version:** the subject used to be a field of each exam, and all exams of a class were averaged together. When you first start the new version, every class gets one subject for each subject name its exams used (upper/lower case is ignored), with the class's previous weighting, grading system and rounding. A class without exams gets no subject; add its subjects yourself.

**Only the total known?** Type the points directly into the "Summe" cell. The task cells of that row turn grey and are locked until you clear the total again (Del).

## Tips

- `3,5`, `3.5` and `,5` are all accepted.
- Values above the max points or off the point step are rejected; a message appears at the bottom.
- Absent students: click the number on the left → "Fehlt". The row turns grey and is not counted.
- Rows without any entry count as "noch nicht erfasst" (not yet entered) and are not counted either.
- A yellow corner on the total means entries are still missing in that row (they count as 0).
- Add tasks with "+" to the right of the last task. Insert, move or delete tasks via "⋯" in the task header.
- Undo: **Ctrl+Z**, redo: **Ctrl+Y**.
- Copying a range from Excel and pasting it with **Ctrl+V** works. If any value is invalid, nothing is pasted.
- On a Surface: in touch mode, rows and buttons are larger and tapping a cell starts editing.

The in-app **"Hilfe"** page explains both grading formulas with examples and lists all keyboard shortcuts.

## Storage location and encryption

- **Custom location** (settings → "Speicherort ändern…"): choose a folder, e.g. on a network drive or in a synced folder. Notenblatt moves the data there. On a second device, choose the same folder and click "Diese Datenbank verwenden".
  Only **one device at a time** can work with the database. If it is open on another device, Notenblatt says so. If the network drive is briefly unavailable, your entries stay in the app and are saved as soon as the drive is reachable again.
- **Encryption** (settings → "Mit Passwort verschlüsseln…"): the database is encrypted with AES-256 and Notenblatt asks for the password on start. Strongly recommended for network drives. **If you forget the password, the data is lost** – there is no backdoor.

## Privacy

- Notenblatt's **only network connection is the update check** (see below). There is no telemetry and there are no error reports; everything else is blocked inside the app.
- By default the data lives in your user profile (`%APPDATA%\Notenblatt`), or in a folder of your choice (settings → "Ordner öffnen").
- **Deleting is final:** when you delete a student, a class, a subject or an exam, the data is also physically removed from the file.
- **"Alle Daten löschen…"** (settings) removes all classes, grades and settings from this device.
- **Retention period:** Notenblatt points out classes from school years that ended more than 12 months ago (configurable: 6/12/24 months or off).
- **Backup** (settings → "Datensicherung…") creates a `.notenblatt` file that is **always encrypted with your password** (AES-256). It cannot be restored without the password. Keep the file safe – it contains personal data.
- Data only leaves your device when you export something yourself (PDF, CSV, backup).

## Updates

On every start Notenblatt asks GitHub whether a new version is available (settings → "Updates" to turn this off, or to check by hand). No data from Notenblatt is sent; GitHub sees your IP address. If there is a new version, Notenblatt shows what is new and offers:

- **Jetzt installieren** – downloads the installer, checks that it is unchanged, closes Notenblatt, installs the update and starts Notenblatt again. Your data is kept.
- **Später** – asks again on the next start.
- **Diese Version überspringen** – does not ask again for this version, only when a newer one is released.

Test versions (pre-releases) are never offered.

## Backup and moving to another device

1. Settings → "Datensicherung…" → enter a password twice → save the file (e.g. on a USB stick).
2. On the new device install Notenblatt → settings → "Wiederherstellen…" → choose the file → password → "Prüfen" → "Alle Daten ersetzen".

## Uninstalling

Windows settings → Apps → Notenblatt → Uninstall.
In the uninstaller, the checkbox **"Alle gespeicherten Daten (Klassen, Noten) ebenfalls löschen"** also removes your data. Without the tick the data is kept and is available again after reinstalling.

## Troubleshooting

- **"Neuere Notenblatt-Version erforderlich" on start:** the database was last used with a newer version of Notenblatt, e.g. on your other device. Install the current version; the data is unchanged. When several devices share a folder, keep Notenblatt at the same version on all of them.
- **"Datenbank beschädigt" on start:** Notenblatt renames the damaged file (`notenblatt.db.defekt-<timestamp>`) and offers to start fresh or restore a backup. The renamed file is kept.
- **"Speichern fehlgeschlagen"** in the status bar: the last change was not saved. Check whether the drive is full and restart Notenblatt.
