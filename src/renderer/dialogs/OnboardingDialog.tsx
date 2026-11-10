import { useEffect, useState } from 'react';
import { formatWeight } from '@shared/overview';
import { call } from '../api';
import { Button, Checkbox, Dialog, TextInput } from '../components/ui';
import { setSetting, setTemplateRules, templateRules, useStore } from '../store';
import { GradingRuleFields } from '../views/CourseGrading';
import g from './guide.module.css';

const STEPS = ['Willkommen bei Notenblatt', 'Notenvorgaben prüfen', 'Speicherort und Verschlüsselung', 'Updates', 'So geht es los'] as const;

/**
 * First-start tour (about a minute): name and school, the grading template, where the
 * data is stored and how to encrypt it, the update check, then how classes, subjects and
 * exams fit together. Shown until it is finished or
 * skipped with "Nicht mehr anzeigen"; settings → "Einführung anzeigen" opens it again.
 */
export function OnboardingDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const st = useStore((x) => x.settings);
  const storage = useStore((x) => x.startup?.info);
  const [step, setStep] = useState(0);
  const [teacher, setTeacher] = useState(st.teacher);
  const [school, setSchool] = useState(st.school);
  const [autoCheck, setAutoCheck] = useState<boolean | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    void call('update.prefs').then((p) => setAutoCheck(p.autoCheck));
  }, []);

  const saveNames = async (): Promise<void> => {
    if (teacher.trim() !== st.teacher) await setSetting('teacher', teacher.trim());
    if (school.trim() !== st.school) await setSetting('school', school.trim());
  };

  const finish = async (done: boolean): Promise<void> => {
    await saveNames();
    await call('onboarding.finish', { done });
    onClose();
  };

  const next = async (): Promise<void> => {
    if (step === 0) await saveNames();
    if (last) await finish(true);
    else setStep(step + 1);
  };

  const categories = st.categoryTemplate.map((c) => `${c.name} ×${formatWeight(c.weightC)}`).join(', ');

  return (
    <Dialog
      title={STEPS[step] ?? STEPS[0]}
      wide
      onClose={() => void finish(dontShow)}
      onSubmit={() => void next()}
      footer={
        <>
          <div className={g.footerStart}>
            <span className={g.stepCount}>
              Schritt {step + 1} von {STEPS.length}
            </span>
            {!last && (
              <>
                <Checkbox id="onb-dontshow" label="Nicht mehr anzeigen" checked={dontShow} onChange={setDontShow} />
                <Button variant="quiet" onClick={() => void finish(dontShow)}>
                  Überspringen
                </Button>
              </>
            )}
          </div>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Zurück</Button>}
          <Button type="submit" variant="primary">
            {last ? 'Fertig' : 'Weiter'}
          </Button>
        </>
      }
    >
      {step === 0 && (
        <>
          <p className={g.lead}>In fünf kurzen Schritten ist Notenblatt eingerichtet. Alles lässt sich später unter „Einstellungen“ ändern.</p>
          <div className={g.formGrid}>
            <label htmlFor="onb-teacher">Lehrkraft</label>
            <TextInput id="onb-teacher" autoFocus value={teacher} placeholder="z. B. Fr. Muster" onChange={(e) => setTeacher(e.target.value)} />
            <label htmlFor="onb-school">Schule</label>
            <TextInput id="onb-school" value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>
          <p className={g.summary}>Beides erscheint auf Ausdrucken und PDFs. Ihre Daten bleiben auf diesem Gerät.</p>
        </>
      )}

      {step === 1 && (
        <>
          <p className={g.lead}>Diese Vorgaben übernimmt jedes neue Fach. Jedes Fach lässt sich danach unter „Gewichtung“ einzeln anpassen.</p>
          <div className={g.formGrid}>
            <GradingRuleFields idPrefix="onb" showErrorWeights value={templateRules(st)} onChange={(p) => void setTemplateRules(p)} />
          </div>
          <p className={g.summary}>
            Kategorien: {categories}. Ändern unter „Einstellungen“ → „Vorlage für neue Fächer“.
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <p className={g.lead}>Ihre Daten liegen in einer Datei auf diesem Gerät:</p>
          <div className={g.formGrid}>
            <span>Speicherort</span>
            <span className={g.path} data-testid="onb-storage-dir">
              {storage?.dir}
              {storage?.isDefault ? ' (Standardordner)' : ''}
            </span>
            <span>Verschlüsselung</span>
            <span>{storage?.encrypted ? 'An – AES-256, Passwort beim Start' : 'Aus'}</span>
          </div>
          <p className={g.summary}>
            Mit einem Passwort wird die Datenbank verschlüsselt (AES-256) – empfohlen für Laptops und Netzlaufwerke. Ohne das Passwort lassen sich die Daten nicht
            wiederherstellen. Das Passwort und einen anderen Ordner, z. B. ein Netzlaufwerk für mehrere Geräte, richten Sie unter „Einstellungen“ → „Speicherort und
            Verschlüsselung“ ein.
          </p>
        </>
      )}

      {step === 3 && (
        <>
          <p className={g.lead}>Notenblatt kann beim Start prüfen, ob es eine neue Version gibt. Vor der Installation sehen Sie, was sich geändert hat.</p>
          {autoCheck !== null && (
            <Checkbox
              id="onb-autoupdate"
              label="Beim Start nach Updates suchen"
              checked={autoCheck}
              onChange={(v) => {
                setAutoCheck(v);
                void call('update.setAutoCheck', { on: v });
              }}
            />
          )}
          <p className={g.summary}>
            Dazu fragt Notenblatt bei GitHub die neueste Version ab. Es werden keine Daten aus Notenblatt übertragen; GitHub sieht nur Ihre IP-Adresse. Sie können
            jederzeit auch von Hand unter „Einstellungen“ → „Updates“ suchen.
          </p>
        </>
      )}

      {step === 4 && (
        <>
          <ol className={g.list}>
            <li>
              <span className={g.no}>1</span>
              <span>
                <strong>Klasse anlegen</strong> und die Namen einfügen, z. B. aus Excel oder ASV.
              </span>
            </li>
            <li>
              <span className={g.no}>2</span>
              <span>
                <strong>Fach anlegen</strong> – in der Klasse für jedes Fach, das Sie dort unterrichten. Noten und Gewichtung zählen je Fach.
              </span>
            </li>
            <li>
              <span className={g.no}>3</span>
              <span>
                <strong>Prüfung anlegen</strong> – Fach, Datum und Art wählen, dann die Ergebnisse in die Tabelle eintragen.
              </span>
            </li>
          </ol>
          <h3 className={g.heading}>Arten von Prüfungen</h3>
          <dl className={g.kinds}>
            <dt>Punkte je Aufgabe</dt>
            <dd>Punkte für jede Aufgabe; Summe, Note und Notenspiegel rechnet Notenblatt aus.</dd>
            <dt>Nur Gesamtpunkte</dt>
            <dd>Je Schüler/in nur die erreichte Gesamtpunktzahl.</dd>
            <dt>Nur Note</dt>
            <dd>Für mündliche Noten und Ähnliches, ohne Punkte.</dd>
            <dt>Fehlerbewertung</dt>
            <dd>Zusätzlich die Anzahl der Fehler, z. B. in Sprachen (nur bei Noten 1–6).</dd>
          </dl>
          <p className={g.summary}>„Hilfe“ oben rechts erklärt alles Weitere.</p>
        </>
      )}
    </Dialog>
  );
}
