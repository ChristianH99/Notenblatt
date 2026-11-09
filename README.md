# Notenblatt

Notenblatt ist ein Programm für Windows, mit dem Sie Prüfungen bewerten – so wie mit der bekannten Excel-Notentabelle, nur ohne Formeln, ohne feste Zeilen- und Spaltenzahl und ohne Rundungsfehler.

- Punkte je Aufgabe eintragen, Summe und Note erscheinen sofort.
- Bewertung wahlweise in **Notenpunkten 0–15** oder als **Note 1,0–6,0 (linear)**.
- Notenschlüssel, Durchschnitt, „Note 5 und 6“, Verteilung und Diagramm werden automatisch berechnet.
- **Ganze Notenführung einer Klasse:** schriftliche Prüfungen mit Punkten und mündliche Noten („Nur Note“), gewichtet nach Kategorien (z. B. schriftlich : mündlich = 3 : 1), mit **Gesamtdurchschnitt je Schüler/in** in der Notenübersicht.
- Datenbank wahlweise **verschlüsselt (AES-256)** und/oder in einem **eigenen Ordner**, z. B. auf einem Netzlaufwerk für mehrere Geräte.
- Druck und PDF im Layout der Notentabelle, anonymer Notenspiegel für die Klasse, CSV-Export für Excel.
- Läuft vollständig **offline**. Alle Daten bleiben auf Ihrem Gerät.

---

## Installation

1. Laden Sie die Datei **`Notenblatt-Setup-<Version>-x64.exe`** herunter.
   Für Surface Pro X / Surface Pro 11 (ARM) gibt es `Notenblatt-Setup-<Version>-arm64.exe`.
2. Starten Sie die Datei mit Doppelklick.
3. **Windows-SmartScreen-Hinweis:** Das Installationsprogramm ist nicht digital signiert. Windows zeigt deshalb beim ersten Start „Der Computer wurde durch Windows geschützt“.
   Klicken Sie auf **„Weitere Informationen“** und dann auf **„Trotzdem ausführen“**.
   *Hintergrund:* Eine Signatur kostet Geld und sagt nichts über den Inhalt aus. Notenblatt baut keine Internetverbindung auf und benötigt keine Administratorrechte.
4. Folgen Sie dem Assistenten. Sie brauchen **keine Administratorrechte**; Notenblatt wird nur für Ihr Benutzerkonto installiert (Standardordner `%LOCALAPPDATA%\Programs\Notenblatt`). Den Ordner können Sie ändern.
5. Notenblatt erscheint im Startmenü und auf dem Desktop.

Es muss nichts zusätzlich installiert werden (kein .NET, keine Laufzeitumgebung, kein Internet).

---

## Erste Schritte (ca. 2 Minuten)

1. **Klasse anlegen** – Name (z. B. `F-A11a`) und Schuljahr eingeben.
2. **Namen einfügen** – In der Klasse auf „Namen einfügen…“ klicken und die Namensliste einfügen, z. B. aus Excel oder ASV kopiert. Eine Zeile pro Schüler/in:
   - `Müller, Anna`
   - `Müller⇥Anna` (zwei Spalten aus Excel/ASV)
   - `Müller Anna`

   Falls Vor- und Nachname vertauscht sind: „Spalten tauschen“ anhaken.
3. **Prüfung anlegen** – Art (z. B. Kurzarbeit), Nr., Fach, Datum, Bewertung und Anzahl der Aufgaben wählen. Alternativ „Struktur übernehmen von…“, um Aufgaben und Höchstpunkte einer anderen Prüfung (z. B. Parallelklasse) zu übernehmen.
4. **Höchstpunkte eintragen** – In der Tabelle die grüne Zeile „max. Punkte“ ausfüllen. Die Aufgabenbezeichnungen in der Zeile darüber können Sie überschreiben (z. B. `3.1`).
5. **Punkte eintragen** – Zahl tippen und **Eingabetaste** drücken: Der Cursor springt nach unten zur nächsten Schülerin bzw. zum nächsten Schüler. So bewerten Sie eine Aufgabe für die ganze Klasse am Stück.

Es gibt keine Schaltfläche „Speichern“ – jede Eingabe wird sofort gespeichert. Unten links steht dann „Gespeichert“.

### Mündliche Noten und Gesamtdurchschnitt

1. In der Klasse unter **„Gewichtung“** prüfen Sie die Kategorien und Gewichte, z. B. „Schriftlich ×3“ und „Mündlich ×1“. Sie können Kategorien umbenennen, hinzufügen (z. B. „Referat“) und die Gewichte ändern.
2. Mündliche Note eintragen: In der **„Notenübersicht“** auf **„Note „Mündlich“ eintragen“** klicken (oder „Neue Prüfung“ mit Eingabe „Nur Note“). Dann die Noten direkt eintippen – in Notenpunkten (0–15) oder als Note (1,0–6,0), je nach Bewertung.
3. Die **Notenübersicht** zeigt alle Noten der Klasse, den Durchschnitt je Kategorie, den gewichteten **Gesamtdurchschnitt** und die **Endnote** jeder Schülerin bzw. jedes Schülers. Jede Prüfung zählt mit dem Gewicht ihrer Kategorie. Mit „CSV“ exportieren Sie die Übersicht für Excel.

**Notensystem** (Notenpunkte oder Noten 1–6), **Rundung der Endnote** (kaufmännisch oder bei x,5 zugunsten der Schülerin/des Schülers, bei Noten 1–6 auf ganze Noten oder eine Nachkommastelle) und **Gewichte** gelten **je Klasse** (Klasse → „Gewichtung“). Alle Prüfungen einer Klasse verwenden ihr Notensystem. In den Einstellungen unter „Vorlage für neue Klassen“ legen Sie fest, womit neue Klassen starten; bestehende Klassen ändern sich dadurch nicht.

**Nur die Gesamtpunktzahl bekannt?** Tippen Sie die Punkte direkt in die Zelle „Summe“. Die Aufgabenzellen dieser Zeile werden grau und gesperrt, bis Sie die Summe wieder leeren (Entf).

### Tipps

- `3,5`, `3.5` und `,5` werden gleichermaßen akzeptiert.
- Werte über der Höchstpunktzahl oder außerhalb des Punkteschritts werden abgelehnt; unten erscheint ein Hinweis.
- Fehlende Schüler/innen: auf die Nummer links klicken → „Fehlt“. Die Zeile wird grau und zählt in der Auswertung nicht mit.
- Zeilen ohne jeden Eintrag gelten als „noch nicht erfasst“ und zählen ebenfalls nicht mit.
- Eine gelbe Ecke an der Summe bedeutet: In dieser Zeile fehlen noch Einträge (sie zählen als 0).
- Aufgaben hinzufügen: „+“ rechts neben der letzten Aufgabe. Einfügen, verschieben oder löschen: „⋯“ im Aufgabenkopf.
- Rückgängig: **Strg+Z**, Wiederholen: **Strg+Y**.
- Bereiche aus Excel kopieren und mit **Strg+V** einfügen funktioniert. Ist ein Wert ungültig, wird gar nichts übernommen.
- Auf dem Surface: Im Touch-Modus werden Zeilen und Schaltflächen größer; Antippen einer Zelle startet die Eingabe.

Weitere Hinweise, beide Notenformeln mit Beispiel und alle Tastenkürzel finden Sie im Programm unter **Hilfe**.

---

## Speicherort und Verschlüsselung

- **Eigener Speicherort** (Einstellungen → „Speicherort ändern…“): Wählen Sie einen Ordner, z. B. auf einem Netzlaufwerk oder in einem synchronisierten Ordner. Notenblatt verschiebt die Daten dorthin. Auf einem zweiten Gerät wählen Sie denselben Ordner und klicken „Diese Datenbank verwenden“.
  Es kann immer **nur ein Gerät gleichzeitig** mit der Datenbank arbeiten. Ist sie auf einem anderen Gerät geöffnet, zeigt Notenblatt das an. Ist das Netzlaufwerk kurz weg, bleiben Ihre Eingaben im Programm erhalten und werden gespeichert, sobald es wieder erreichbar ist.
- **Verschlüsselung** (Einstellungen → „Mit Passwort verschlüsseln…“): Die Datenbank wird mit AES-256 verschlüsselt; beim Start fragt Notenblatt das Passwort ab. Für Netzlaufwerke dringend empfohlen. **Wenn Sie das Passwort vergessen, sind die Daten verloren** – es gibt keine Hintertür.

## Datenschutz

- Notenblatt baut **keine Netzwerkverbindung** auf: keine Updates, keine Telemetrie, keine Fehlerberichte. Das Programm blockiert intern jeden Netzwerkzugriff.
- Die Daten liegen standardmäßig in Ihrem Benutzerprofil (`%APPDATA%\Notenblatt`), auf Wunsch in einem Ordner Ihrer Wahl (Einstellungen → „Ordner öffnen“).
- **Löschen ist endgültig:** Wenn Sie eine Schülerin/einen Schüler, eine Klasse oder eine Prüfung löschen, werden die Daten auch physisch aus der Datei entfernt.
- **„Alle Daten löschen…“** (Einstellungen) entfernt alle Klassen, Noten und Einstellungen von diesem Gerät.
- **Aufbewahrungsfrist:** Notenblatt weist Sie auf Klassen aus Schuljahren hin, die seit mehr als 12 Monaten (einstellbar: 6/12/24 Monate oder aus) beendet sind.
- **Datensicherung** (Einstellungen → „Datensicherung…“) erzeugt eine `.notenblatt`-Datei, die **immer mit Ihrem Passwort verschlüsselt** ist (AES-256). Ohne Passwort ist keine Wiederherstellung möglich. Bewahren Sie die Datei sicher auf – sie enthält personenbezogene Daten.
- Daten verlassen Ihr Gerät nur, wenn Sie selbst etwas exportieren (PDF, CSV, Datensicherung).

## Datensicherung und Umzug auf ein anderes Gerät

1. Einstellungen → „Datensicherung…“ → Passwort zweimal eingeben → Datei speichern (z. B. auf einem USB-Stick).
2. Auf dem neuen Gerät Notenblatt installieren → Einstellungen → „Wiederherstellen…“ → Datei wählen → Passwort → „Prüfen“ → „Alle Daten ersetzen“.

## Deinstallation

Windows-Einstellungen → Apps → Notenblatt → Deinstallieren.
Im Deinstallationsassistenten können Sie mit dem Kästchen **„Alle gespeicherten Daten (Klassen, Noten) ebenfalls löschen“** auch Ihre Daten entfernen. Ohne Haken bleiben die Daten erhalten und stehen nach einer Neuinstallation wieder zur Verfügung.

## Wenn etwas nicht stimmt

- **„Datenbank beschädigt“ beim Start:** Notenblatt benennt die beschädigte Datei um (`notenblatt.db.defekt-<Zeitstempel>`) und bietet an, neu zu beginnen oder eine Datensicherung wiederherzustellen. Die umbenannte Datei bleibt erhalten.
- **„Speichern fehlgeschlagen“** in der Statusleiste: Die letzte Änderung wurde nicht übernommen. Prüfen Sie, ob der Datenträger voll ist, und starten Sie Notenblatt neu.
