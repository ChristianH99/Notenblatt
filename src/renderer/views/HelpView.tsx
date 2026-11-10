import { ERROR_GRADES10, errorGrade10 } from '@shared/grading/errors';
import { formatGrade10 } from '@shared/parse/number';
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
          <li>
            Fach anlegen: In der Klasse jedes Fach anlegen, das Sie dort unterrichten (z. B. „Mathematik“ und „Physik“). Alle Schüler/innen der Klasse nehmen
            zunächst teil; unter „Prüfungen und Schüler/innen“ können Sie Einzelne abwählen, z. B. bei Wahlfächern.
          </li>
          <li>
            Prüfung anlegen: Fach, Art und Datum wählen. Bei Prüfungen mit Punkten entweder nur die Höchstpunktzahl angeben (je Schüler/in wird dann nur die
            Gesamtpunktzahl eingetragen) oder „Punkte je Aufgabe eingeben“ ankreuzen und die Anzahl der Aufgaben wählen.
          </li>
          <li>
            In der Tabelle die erreichten Punkte eintragen (bei Aufgaben zuerst die Zeile „max. Punkte“ ausfüllen). Weiße Zellen sind Eingaben, grau hinterlegte
            werden berechnet. Summe, Note und Auswertung erscheinen sofort.
          </li>
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

        <h2>Fehlerbewertung</h2>
        <p>
          In Fächern mit Noten 1–6 kann eine Prüfung mit Punkten zusätzlich die <b>Anzahl der Fehler</b> erfassen (Häkchen „Fehlerbewertung“ beim Anlegen
          oder im Kopf der Prüfung). Die Tabelle erhält dann die Spalte „Fehler“ (halbe Fehler möglich, z. B. 3,5) sowie die Teilnoten „Note P.“ (aus den
          Punkten) und „Note F.“ (aus den Fehlern). Die Note der Prüfung ist der gewichtete Mittelwert beider Teilnoten, auf eine Nachkommastelle gerundet nach
          der Rundung des Fachs; nur sie erscheint in der Notenübersicht. Das Verhältnis Punkte : Fehler (Standard 1 : 1) legen Sie je Fach unter „Gewichtung“
          fest.
        </p>
        <p>
          Bis 9 Fehler kostet jeder Fehler 0,3 Noten, ab dem 10. Fehler 0,5 Noten. Ein halber Fehler kostet die Hälfte davon, auf eine Nachkommastelle
          abgeschnitten (z. B. 3,5 Fehler: 1,9 + 0,15 → 2,0):
        </p>
        <table className={s.helpTable}>
          <thead>
            <tr>
              <th>Fehler</th>
              {ERROR_GRADES10.filter((_, i) => i % 2 === 0).map((_, i) => (
                <th key={i}>{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Note</th>
              {ERROR_GRADES10.filter((_, i) => i % 2 === 0).map((g, i) => (
                <td key={i}>{formatGrade10(g)}</td>
              ))}
            </tr>
            <tr>
              <th>+ 0,5 F.</th>
              {ERROR_GRADES10.filter((_, i) => i % 2 === 0).map((_, i) => (
                <td key={i}>{formatGrade10(errorGrade10(2 * i + 1))}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p>
          Ab 14 Fehlern ergibt sich 6,0. Beispiel: Note aus den Punkten 2,3, 4 Fehler (2,2), Verhältnis 1 : 1 → (2,3 + 2,2) / 2 = 2,25 → abgeschnitten <b>2,2</b>
          (kaufmännisch 2,3). „Vollständigen Schlüssel anzeigen“ zeigt neben dem Punkteschlüssel auch den Fehlerschlüssel.
          Eine Zeile wird erst gewertet, wenn Punkte und Fehler eingetragen sind.
        </p>

        <h2>Auswertung</h2>
        <p>
          Gewertet werden nur Schüler/innen mit Status „teilgenommen“ und mindestens einem Eintrag. Leere Zellen zählen in einer begonnenen Zeile als 0 Punkte; die Summe
          erhält dann eine gelbe Markierung. Durchschnitte werden auf zwei Nachkommastellen nach der Rundung des Fachs angezeigt (kaufmännisch, zugunsten der
          Schülerin bzw. des Schülers oder abgeschnitten).
        </p>

        <h2>Mündliche Noten, Kategorien und Gesamtdurchschnitt</h2>
        <p>
          Noten werden immer <b>je Fach</b> berechnet: Prüfungen verschiedener Fächer einer Klasse werden nie miteinander verrechnet. Jede Prüfung gehört zu
          einer <b>Kategorie</b> ihres Fachs, z. B. „Schriftlich“ oder „Mündlich“. Jede Kategorie hat ein <b>Gewicht</b>, z. B. 3 : 1. Prüfungen
          können mit Punkten je Aufgabe bewertet werden oder als „Nur Note“ (z. B. Abfragen, Referate): Dann tragen Sie die Note direkt ein.
        </p>
        <p>
          Die <b>Notenübersicht</b> des Fachs zeigt alle Noten jeder Schülerin bzw. jedes Schülers, den Durchschnitt je Kategorie, den gewichteten
          Gesamtdurchschnitt und die Endnote. Jede Prüfung zählt mit dem Gewicht ihrer Kategorie: Beispiel schriftlich 15 NP (×3), mündlich 9 und 13 NP (je ×1)
          → (3 · 15 + 9 + 13) / 5 = 13,40.
        </p>
        <p>
          Die <b>Rundung</b> ist je Fach wählbar und gilt für die Durchschnitte (zwei Nachkommastellen), die Note von Prüfungen mit Fehlerbewertung und die
          Endnote: kaufmännisch (ab x,5 zur höheren Zahl), bei genau x,5 zugunsten der Schülerin bzw. des Schülers (bei Noten 1–6 also 2,5 → 2) oder
          abgeschnitten. Gerundet wird immer aus dem exakten Wert. Die <b>Endnote</b> kann auf ganze Noten oder eine Nachkommastelle gerundet oder ganz
          ausgeblendet werden. Bei Notenpunkten wird x,5 bei beiden Rundungsregeln aufgerundet.
        </p>
        <p>
          Notensystem (Notenpunkte oder Noten 1–6), Rundung, Gewichte und Kategorien legen Sie je Fach unter „Gewichtung“ fest; alle Prüfungen des Fachs
          verwenden dieses Notensystem. Die Vorlage in den Einstellungen gilt nur für neu angelegte Fächer – bereits bestehende Fächer ändern sich dadurch nicht.
        </p>
        <p>
          <b>Nur die Gesamtpunktzahl erfassen?</b> Schalten Sie „Punkte je Aufgabe“ aus (beim Anlegen oder im Kopf der Prüfung, solange es nur eine Aufgabe
          gibt): Die Tabelle hat dann nur die Spalte „Punkte“. <b>Bei einzelnen Schüler/innen nur die Summe bekannt?</b> Tragen Sie die Punkte direkt in die Zelle „Summe“ ein. Die Aufgabenzellen dieser Zeile werden dann grau und
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
          Die Daten liegen in einer Datei im Benutzerprofil (Einstellungen → Speicherort). Gelöschte Schüler/innen, Klassen, Fächer und Prüfungen werden auch physisch aus der
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
