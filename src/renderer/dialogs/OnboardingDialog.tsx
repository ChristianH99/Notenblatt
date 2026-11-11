import { useEffect, useState } from 'react';
import type { DirChoice } from '@shared/api';
import { call } from '../api';
import { Button, Checkbox, Dialog, Notice, TextInput, uiStyles } from '../components/ui';
import { errorText, hardReload, setSetting, setTemplateRules, templateRules, useStore } from '../store';
import { GradingRuleFields, WeightInput } from '../views/CourseGrading';
import g from './guide.module.css';

const STEPS = ['Willkommen bei Notenblatt', 'Notenvorgaben prüfen', 'Speicherort und Verschlüsselung', 'Updates', 'So geht es los'] as const;
const STORAGE = 2;

/** Re-reads the storage info shown in the tour and the settings after a move or encryption. */
async function refreshStorageInfo(): Promise<void> {
  const info = await call('storage.info');
  useStore.setState((s) => ({ startup: s.startup ? { ...s.startup, info } : s.startup }));
}

/**
 * First-start tour (about a minute): name and school, the grading template with the
 * category and error weights, the storage folder and encryption (encrypting is the
 * suggested choice), the update check, then how classes, subjects and exams fit together.
 * Shown until it is finished or skipped with "Nicht mehr anzeigen"; settings →
 * "Einführung anzeigen" opens it again.
 */
export function OnboardingDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const st = useStore((x) => x.settings);
  const storage = useStore((x) => x.startup?.info);
  const [step, setStep] = useState(0);
  const [teacher, setTeacher] = useState(st.teacher);
  const [school, setSchool] = useState(st.school);
  const [autoCheck, setAutoCheck] = useState<boolean | null>(null);
  const [dontShow, setDontShow] = useState(false);
  // storage step
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<DirChoice | null>(null);
  const last = step === STEPS.length - 1;
  const encrypting = step === STORAGE && !storage?.encrypted;
  const short = pw.length < 8;
  const mismatch = pw !== pw2;

  useEffect(() => {
    void call('update.prefs').then((p) => setAutoCheck(p.autoCheck));
  }, []);

  const run = async (p: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await p();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveNames = async (): Promise<void> => {
    if (teacher.trim() !== st.teacher) await setSetting('teacher', teacher.trim());
    if (school.trim() !== st.school) await setSetting('school', school.trim());
  };

  const finish = async (done: boolean): Promise<void> => {
    await saveNames();
    await call('onboarding.finish', { done });
    onClose();
  };

  const go = (to: number): void => {
    setError('');
    setStep(to);
  };

  const next = async (): Promise<void> => {
    if (busy) return;
    if (step === 0) await saveNames();
    if (encrypting) {
      setTried(true);
      if (short || mismatch) return;
      if (!(await run(() => call('storage.enableEncryption', { password: pw }).then(refreshStorageInfo)))) return;
      setPw('');
      setPw2('');
    }
    if (last) await finish(true);
    else go(step + 1);
  };

  const chooseDir = async (): Promise<void> => {
    setFound(null);
    let unwritable = false;
    await run(async () => {
      const c = await call('storage.chooseDir');
      if (!c) return;
      if (!c.writable) unwritable = true;
      else if (c.exists) setFound(c);
      else {
        await call('storage.relocate', { dir: c.dir, overwrite: false });
        await refreshStorageInfo();
      }
    });
    if (unwritable) setError('In diesen Ordner kann nicht geschrieben werden.');
  };

  /** A database from another device: use it and end the tour (that database is set up already). */
  const openFound = async (dir: string): Promise<void> => {
    if (await run(() => call('storage.openOther', { dir }))) {
      await call('onboarding.finish', { done: true });
      onClose();
      hardReload();
    }
  };

  const saveTemplateWeight = (i: number, weightC: number): void =>
    void setSetting('categoryTemplate', JSON.stringify(st.categoryTemplate.map((c, k) => (k === i ? { ...c, weightC } : c))));

  return (
    <Dialog
      title={STEPS[step] ?? STEPS[0]}
      wide
      onClose={() => void finish(dontShow)}
      onSubmit={() => void next()}
      footer={
        <>
          <div className={g.footerStart}>
            {!last && (
              <>
                <Checkbox id="onb-dontshow" label="Nicht mehr anzeigen" checked={dontShow} onChange={setDontShow} />
                <Button variant="quiet" onClick={() => void finish(dontShow)}>
                  Überspringen
                </Button>
              </>
            )}
          </div>
          {step > 0 && (
            <Button onClick={() => go(step - 1)} disabled={busy}>
              Zurück
            </Button>
          )}
          {encrypting && (
            <Button onClick={() => go(step + 1)} disabled={busy}>
              Unverschlüsselt speichern
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {last ? 'Fertig' : encrypting ? 'Verschlüsseln' : 'Weiter'}
          </Button>
        </>
      }
    >
      <span className={g.stepCount}>
        Schritt {step + 1} von {STEPS.length}
      </span>
      {step === 0 && (
        <>
          <p className={g.lead}>In fünf kurzen Schritten ist Notenblatt eingerichtet.</p>
          <div className={g.formGrid}>
            <label htmlFor="onb-teacher">Lehrkraft</label>
            <TextInput id="onb-teacher" autoFocus value={teacher} placeholder="z. B. Fr. Muster" onChange={(e) => setTeacher(e.target.value)} />
            <label htmlFor="onb-school">Schule</label>
            <TextInput id="onb-school" value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>
          <p className={g.summary}>Beides erscheint auf Ausdrucken und PDFs. Alle Einstellungen können Sie später im Menü „Einstellungen“ ändern.</p>
        </>
      )}

      {step === 1 && (
        <>
          <p className={g.lead}>Diese Vorgaben übernimmt jedes neue Fach.</p>
          <div className={g.formGrid}>
            <GradingRuleFields
              idPrefix="onb"
              showErrorWeights
              value={templateRules(st)}
              onChange={(p) => void setTemplateRules(p)}
              beforeErrorWeights={
                <>
                  <span>Gewichtung</span>
                  <span className={g.weights}>
                    {st.categoryTemplate.map((c, i) => (
                      <span key={`${i}-${c.name}`} className={g.weight}>
                        {c.name} ×
                        <WeightInput id={`onb-cat-${i}`} label={`Gewicht ${c.name}`} value={c.weightC} onCommit={(w) => saveTemplateWeight(i, w)} />
                      </span>
                    ))}
                  </span>
                </>
              }
            />
          </div>
          <p className={g.summary}>
            Gewichtung: Anteil der Kategorien am Gesamtdurchschnitt, z. B. schriftlich : mündlich = 3 : 1. Fehlerbewertung: Verhältnis der Note aus den Punkten zur
            Note aus der Fehlerzahl (nur bei Noten 1–6).
          </p>
        </>
      )}

      {step === STORAGE && (
        <>
          <div className={g.formGrid}>
            <span>Speicherort</span>
            <span className={g.pathRow}>
              <span className={g.path} data-testid="onb-storage-dir">
                {storage?.dir}
                {storage?.isDefault ? ' (Standardordner)' : ''}
              </span>
              <Button onClick={() => void chooseDir()} disabled={busy}>
                Ordner ändern…
              </Button>
            </span>
            {storage?.encrypted && (
              <>
                <span>Verschlüsselung</span>
                <span data-testid="onb-encrypted">An – AES-256, Passwort beim Start</span>
              </>
            )}
          </div>
          {found && (
            <>
              <Notice>
                In diesem Ordner liegt bereits eine Notenblatt-Datenbank{found.encrypted ? ' (verschlüsselt)' : ''}, z. B. von einem anderen Gerät.
              </Notice>
              <div>
                <Button onClick={() => void openFound(found.dir)} disabled={busy}>
                  Diese Datenbank verwenden
                </Button>
              </div>
            </>
          )}
          {encrypting && (
            <>
              <p className={g.lead}>
                Schützen Sie die Noten mit einem Passwort: Die Datenbank wird mit AES-256 verschlüsselt, beim Start fragt Notenblatt nach dem Passwort.
              </p>
              <div className={g.formGrid}>
                <label htmlFor="onb-pw">Passwort</label>
                <span className={g.fieldCol}>
                  <TextInput id="onb-pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} invalid={tried && short} />
                  {tried && short && <span className={uiStyles.error}>Mindestens 8 Zeichen.</span>}
                </span>
                <label htmlFor="onb-pw2">Wiederholen</label>
                <span className={g.fieldCol}>
                  <TextInput id="onb-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={tried && !short && mismatch} />
                  {tried && !short && mismatch && <span className={uiStyles.error}>Die Passwörter stimmen nicht überein.</span>}
                </span>
              </div>
              <p className={g.summary}>
                <strong>Ohne das Passwort lassen sich die Daten nicht wiederherstellen.</strong> Notieren Sie es an einem sicheren Ort.
              </p>
            </>
          )}
          {error && <Notice error>{error}</Notice>}
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
