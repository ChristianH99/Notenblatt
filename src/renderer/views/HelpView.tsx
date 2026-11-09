import s from './shell.module.css';

function K({ children }: { children: string }): React.JSX.Element {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function HelpView(): React.JSX.Element {
  return (
    <div className={s.page}>
      <div className={`${s.pageInner} ${s.help}`}>
        <h1 className={s.pageTitle}>Hilfe</h1>

        <h2>Ablauf</h2>
        <ol>
          <li>Klasse anlegen und Namen einfügen (eine Zeile pro Schüler/in: „Nachname, Vorname“, „Nachname⇥Vorname“ aus Excel/ASV oder „Nachname Vorname“).</li>
          <li>Prüfung anlegen: Art, Fach, Datum, Bewertung und Anzahl der Aufgaben wählen.</li>
          <li>In der Tabelle zuerst die Zeile „max. Punkte“ ausfüllen, dann die erreichten Punkte eintragen. Summe, Note und Auswertung werden sofort berechnet.</li>
        </ol>
        <p>Alle Eingaben werden sofort gespeichert. Es gibt keine Schaltfläche „Speichern“.</p>

        <h2>Bewertung „Notenpunkte 0–15“</h2>
        <p>
          Für jede Notenpunktzahl g gibt es eine Obergrenze U(g) = abrunden(M · Prozentsatz), wobei M die Gesamtpunktzahl ist. Die Prozentsätze sind 95, 90, 85,
          80, 75, 70, 65, 60, 55, 50, 45, 40, 33⅓, 26⅔ und 20 % für 14 … 0 Notenpunkte. Eine Schülerin bzw. ein Schüler erhält die höchste Notenpunktzahl g, für die die
          erreichte Punktzahl P größer als U(g − 1) ist.
        </p>
        <p>
          Beispiel: M = 55. U(2) = abrunden(55 · 33⅓ %) = 18, U(3) = abrunden(55 · 40 %) = 22. Mit P = 19 Punkten gilt 19 &gt; 18, aber nicht 19 &gt; 22, also <b>3 Notenpunkte</b>.
        </p>
        <p>Die Zusammenfassung zu Noten: 15–13 = 1, 12–10 = 2, 9–7 = 3, 6–4 = 4, 3–1 = 5, 0 = 6.</p>

        <h2>Bewertung „Noten 1,0–6,0 (linear)“</h2>
        <p>
          Note = abrunden(6 − 5 · P / M) auf eine Nachkommastelle. 0 Punkte ergeben 6,0, volle Punktzahl 1,0. Wortnoten: 1,0–1,4 sehr gut, 1,5–2,4 gut, 2,5–3,4 befriedigend,
          3,5–4,4 ausreichend, 4,5–5,4 mangelhaft, 5,5–6,0 ungenügend.
        </p>
        <p>
          Beispiel: M = 30, P = 21,5. 6 − 5 · 21,5 / 30 = 2,41… → <b>2,4 (gut)</b>.
        </p>
        <p>Alle Berechnungen erfolgen exakt mit ganzen Zahlen, Rundungsfehler wie in Tabellenkalkulationen treten nicht auf.</p>

        <h2>Auswertung</h2>
        <p>
          Gewertet werden nur Schüler/innen mit Status „teilgenommen“ und mindestens einem Eintrag. Leere Zellen zählen in einer begonnenen Zeile als 0 Punkte; die Summe
          erhält dann eine gelbe Markierung. Durchschnitte werden abgeschnitten (nicht gerundet), wie in der Excel-Vorlage.
        </p>

        <h2>Mündliche Noten, Kategorien und Gesamtdurchschnitt</h2>
        <p>
          Jede Prüfung gehört zu einer <b>Kategorie</b> der Klasse, z. B. „Schriftlich“ oder „Mündlich“. Jede Kategorie hat ein <b>Gewicht</b>, z. B. 3 : 1. Prüfungen
          können mit Punkten je Aufgabe bewertet werden oder als „Nur Note“ (z. B. Abfragen, Referate): Dann tragen Sie die Note direkt ein.
        </p>
        <p>
          Die <b>Notenübersicht</b> der Klasse zeigt alle Noten jeder Schülerin bzw. jedes Schülers, den Durchschnitt je Kategorie, den gewichteten
          Gesamtdurchschnitt und die Endnote. Jede Prüfung zählt mit dem Gewicht ihrer Kategorie: Beispiel schriftlich 15 NP (×3), mündlich 9 und 13 NP (je ×1)
          → (3 · 15 + 9 + 13) / 5 = 13,40. Durchschnitte werden auf zwei Nachkommastellen abgeschnitten angezeigt.
        </p>
        <p>
          Die <b>Endnote</b> wird aus dem exakten Durchschnitt gerundet – je Klasse wählbar: kaufmännisch (ab x,5 zur höheren Zahl) oder bei genau x,5 zugunsten
          der Schülerin bzw. des Schülers (bei Noten 1–6 also 2,5 → 2), wahlweise auf ganze Noten oder eine Nachkommastelle. Bei Notenpunkten wird x,5 immer
          aufgerundet.
        </p>
        <p>
          Notensystem (Notenpunkte oder Noten 1–6), Rundung, Gewichte und Kategorien legen Sie je Klasse unter „Gewichtung“ fest; alle Prüfungen der Klasse
          verwenden dieses Notensystem. Die Vorlage in den Einstellungen gilt nur für neu angelegte Klassen – bereits bestehende Klassen ändern sich dadurch nicht.
        </p>
        <p>
          <b>Nur die Gesamtpunktzahl bekannt?</b> Tragen Sie die Punkte direkt in die Zelle „Summe“ ein. Die Aufgabenzellen dieser Zeile werden dann grau und
          gesperrt; erst wenn Sie die Summe wieder leeren (Entf), können die Aufgaben wieder bearbeitet werden.
        </p>

        <h2>Speicherort und Verschlüsselung</h2>
        <p>
          Unter Einstellungen → „Speicherort ändern…“ können Sie die Datenbank in einen anderen Ordner legen, z. B. ein Netzlaufwerk, um sie auf mehreren Geräten
          zu nutzen. Es kann immer nur ein Gerät gleichzeitig damit arbeiten; ein zweites Gerät erhält einen Hinweis. Ist der Ordner kurz nicht erreichbar, bleiben
          Ihre Änderungen im Programm erhalten und werden gespeichert, sobald die Verbindung wieder besteht.
        </p>
        <p>
          „Mit Passwort verschlüsseln…“ schützt die Datenbank mit AES-256. Beim Start wird das Passwort abgefragt. <b>Ohne Passwort sind die Daten verloren.</b>
        </p>

        <h2>Tastatur</h2>
        <ul>
          <li><K>←</K> <K>→</K> <K>↑</K> <K>↓</K> Zelle wechseln, <K>Umschalt</K>+Pfeil markiert einen Bereich</li>
          <li>Zahl tippen überschreibt die Zelle; <K>F2</K> oder Doppelklick bearbeitet sie</li>
          <li><K>Eingabe</K> übernimmt und geht nach unten (umschaltbar: „Eingabe: ↓ / →“)</li>
          <li><K>Tab</K> / <K>Umschalt</K>+<K>Tab</K> nach rechts / links, <K>Esc</K> verwirft die Eingabe, <K>Entf</K> leert die Zelle</li>
          <li><K>Strg</K>+<K>Z</K> / <K>Strg</K>+<K>Y</K> rückgängig / wiederholen (letzte 100 Änderungen je Prüfung)</li>
          <li><K>Strg</K>+<K>C</K> / <K>Strg</K>+<K>V</K> Bereiche kopieren und einfügen (kompatibel mit Excel)</li>
          <li><K>Strg</K>+<K>B</K> Navigation ein-/ausblenden, <K>Strg</K>+<K>J</K> Auswertung ein-/ausblenden</li>
        </ul>

        <h2>Datenschutz</h2>
        <p>
          Notenblatt arbeitet vollständig offline. Das Programm baut keine Netzwerkverbindungen auf; es gibt keine Updates, keine Telemetrie und keine Fehlerberichte.
          Daten verlassen das Gerät nur, wenn Sie selbst exportieren (PDF, CSV oder Datensicherung).
        </p>
        <p>
          Die Daten liegen in einer Datei im Benutzerprofil (Einstellungen → Speicherort). Gelöschte Schüler/innen, Klassen und Prüfungen werden auch physisch aus der
          Datei entfernt. Datensicherungen sind immer mit Ihrem Passwort verschlüsselt (AES-256). Bewahren Sie das Passwort sicher auf – ohne Passwort ist keine
          Wiederherstellung möglich.
        </p>
        <p>
          Löschen Sie Klassen, deren Aufbewahrungsfrist abgelaufen ist. Notenblatt weist Sie nach der in den Einstellungen gewählten Frist auf alte Klassen hin.
        </p>
      </div>
    </div>
  );
}
