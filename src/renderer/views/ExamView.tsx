import { useId, useMemo } from 'react';
import { buildExamModel, hasErrorGrading } from '@shared/examModel';
import type { StepQp } from '@shared/grading/units';
import { EXAM_KINDS } from '@shared/labels';
import { formatDateDe, parseDateDe } from '@shared/parse/number';
import type { ExamData, ExamPatch, PrintMode } from '@shared/types';
import { call } from '../api';
import { ComboBox } from '../components/ComboBox';
import { Button, MenuButton, Select, TextInput } from '../components/ui';
import { MarkGrid } from '../grid/MarkGrid';
import { useEditField } from '../hooks';
import { ScoreGrid } from '../grid/ScoreGrid';
import { formatWeight } from '@shared/overview';
import { examWrite, flash, navigate, openExam, refreshTree, save, setSetting, undoRedo, useStore } from '../store';
import { Chart, KeyFigures, KeyTable } from './keyTables';
import e from './exam.module.css';

function MetaText({
  label,
  value,
  width,
  onCommit,
  options,
  validate,
}: {
  label: string;
  value: string;
  width: number;
  onCommit: (v: string) => void;
  /** Suggestions (shown as a combo box). */
  options?: readonly string[];
  validate?: (v: string) => string | null;
}): React.JSX.Element {
  const id = useId();
  const field = useEditField(value, (raw) => {
    const t = raw.trim();
    const err = validate?.(t) ?? null;
    if (err) {
      flash(err);
      return false;
    }
    onCommit(t);
    return true;
  });
  return (
    <span className={e.metaField}>
      <label htmlFor={id}>{label}</label>
      {options ? (
        <ComboBox
          id={id}
          width={width}
          options={options}
          value={field.value}
          onChange={(v) => field.onChange({ target: { value: v } } as React.ChangeEvent<HTMLInputElement>)}
          onPick={(v) => {
            if (v.trim() !== value.trim()) onCommit(v.trim());
          }}
          onBlur={field.onBlur}
          onKeyDown={field.onKeyDown}
        />
      ) : (
        <TextInput id={id} style={{ width }} {...field} />
      )}
    </span>
  );
}

function MetaBar({ exam }: { exam: ExamData }): React.JSX.Element {
  const ex = exam.exam;
  const categories = useStore((s) => s.tree.flatMap((c) => c.courses).find((k) => k.id === ex.courseId)?.categories ?? []);
  const patch = async (p: ExamPatch): Promise<void> => {
    const d = await examWrite(call('exams.update', { id: ex.id, patch: p }));
    if (d && (p.kind !== undefined || p.number !== undefined || p.examDate !== undefined || p.categoryId !== undefined)) await refreshTree();
  };
  return (
    <div className={e.meta} role="group" aria-label="Angaben zur Prüfung">
      <MetaText
        label="Art"
        value={ex.kind}
        width={150}
        options={EXAM_KINDS}
        onCommit={(v) => void patch({ kind: v })}
        validate={(v) => (v ? null : 'Die Art darf nicht leer sein.')}
      />
      <MetaText label="Nr." value={ex.number} width={48} onCommit={(v) => void patch({ number: v })} />
      <MetaText
        label="Datum"
        value={formatDateDe(ex.examDate)}
        width={96}
        validate={(v) => (parseDateDe(v) ? null : 'Bitte ein Datum im Format TT.MM.JJJJ eingeben.')}
        onCommit={(v) => void patch({ examDate: parseDateDe(v) as string })}
      />
      <MetaText label="Lehrkraft" value={ex.teacher} width={120} onCommit={(v) => void patch({ teacher: v })} />
      {ex.entryMode === 'points' && (
        <span className={e.metaField}>
          <label htmlFor="meta-step">Punkteschritt</label>
          <Select id="meta-step" value={ex.stepQp} onChange={(ev) => void patch({ stepQp: Number(ev.target.value) as StepQp })}>
            <option value={4}>1</option>
            <option value={2}>0,5</option>
            <option value={1}>0,25</option>
          </Select>
        </span>
      )}
      {ex.entryMode === 'points' && (
        <label className={e.checkInline} title="Aus: je Schüler/in wird nur die Gesamtpunktzahl eingetragen">
          <input type="checkbox" id="meta-pertask" checked={ex.perTask} onChange={(ev) => void patch({ perTask: ev.target.checked })} />
          Punkte je Aufgabe
        </label>
      )}
      {ex.entryMode === 'points' && ex.scheme === 'LIN6' && (
        <label className={e.checkInline} title="Zusätzlich die Anzahl der Fehler je Schüler/in erfassen; die Note ergibt sich aus Punkten und Fehlern">
          <input type="checkbox" id="meta-errors" checked={ex.errorGrading} onChange={(ev) => void patch({ errorGrading: ev.target.checked })} />
          Fehlerbewertung
        </label>
      )}
      <span className={e.metaField}>
        <label htmlFor="meta-cat">Kategorie</label>
        <Select id="meta-cat" value={ex.categoryId ?? ''} onChange={(ev) => void patch({ categoryId: Number(ev.target.value) })}>
          {ex.categoryId === null && <option value="">–</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ×{formatWeight(c.weightC)}
            </option>
          ))}
        </Select>
      </span>
    </div>
  );
}

function Toolbar({ exam }: { exam: ExamData }): React.JSX.Element {
  const enterDir = useStore((s) => s.settings.enterDirection);
  const showEq = useStore((s) => s.settings.showGradeEquivalent);
  const panelHidden = useStore((s) => s.panelHidden);
  const undoN = useStore((s) => s.undo[exam.exam.id]?.length ?? 0);
  const redoN = useStore((s) => s.redo[exam.exam.id]?.length ?? 0);
  const id = exam.exam.id;
  const np = exam.exam.scheme === 'NP15';
  const out = (mode: PrintMode, pdf: boolean): void => {
    void (async () => {
      if (pdf) {
        const f = await save(call('output.pdf', { examId: id, mode }));
        if (f) flash('PDF gespeichert', 'info');
      } else await save(call('output.print', { examId: id, mode }));
    })();
  };
  return (
    <div className={e.toolbar} role="toolbar" aria-label="Werkzeuge">
      <Button variant="quiet" icon="arrowUndo" tip="Rückgängig (Strg+Z)" disabled={undoN === 0} onClick={() => void undoRedo('undo')} />
      <Button variant="quiet" icon="arrowRedo" tip="Wiederholen (Strg+Y)" disabled={redoN === 0} onClick={() => void undoRedo('redo')} />
      <span className={e.sep} />
      <Button
        variant="quiet"
        icon={enterDir === 'down' ? 'arrowDown' : 'arrowRight'}
        tip="Richtung der Eingabetaste umschalten"
        onClick={() => void setSetting('enterDirection', enterDir === 'down' ? 'right' : 'down')}
        data-testid="enter-toggle"
      >
        Eingabe: {enterDir === 'down' ? '↓' : '→'}
      </Button>
      {np && exam.exam.entryMode === 'points' && (
        <label className={e.checkInline}>
          <input type="checkbox" checked={showEq} onChange={(ev) => void setSetting('showGradeEquivalent', ev.target.checked ? '1' : '0')} />
          Notenäquivalent anzeigen
        </label>
      )}
      <span className={e.spacer} />
      <Button variant="quiet" icon="print" onClick={() => out('exam', false)}>
        Drucken…
      </Button>
      <Button variant="quiet" icon="documentPdf" onClick={() => out('exam', true)}>
        Als PDF speichern…
      </Button>
      <Button
        variant="quiet"
        icon="arrowDownload"
        onClick={() =>
          void (async () => {
            const f = await save(call('output.csv', { examId: id }));
            if (f) flash('CSV-Datei gespeichert', 'info');
          })()
        }
      >
        CSV
      </Button>
      <MenuButton
        variant="quiet"
        label="Weitere Aktionen"
        items={[
          { label: 'Notenspiegel drucken…', icon: 'print', onSelect: () => out('spiegel', false) },
          { label: 'Notenspiegel als PDF…', icon: 'documentPdf', onSelect: () => out('spiegel', true) },
          ...(exam.exam.entryMode === 'points'
            ? [
                { label: 'Schlüssel drucken…', icon: 'table' as const, onSelect: () => out('key', false) },
                {
                  label: 'Vollständigen Schlüssel anzeigen',
                  icon: 'table' as const,
                  onSelect: () => useStore.setState({ dialog: { kind: 'fullKey', examId: id } }),
                },
              ]
            : []),
          {
            label: 'Prüfung duplizieren',
            icon: 'copy',
            separatorBefore: true,
            onSelect: () =>
              void (async () => {
                const nid = await save(call('exams.duplicate', { id }));
                if (nid !== undefined) {
                  await refreshTree();
                  await openExam(nid);
                  flash('Prüfung dupliziert (nur Aufgaben, ohne Punkte)', 'info');
                }
              })(),
          },
          { label: 'Prüfung löschen…', icon: 'delete', danger: true, onSelect: () => useStore.setState({ dialog: { kind: 'deleteExam', examId: id } }) },
        ]}
      />
      <Button
        variant="quiet"
        icon="panelRight"
        tip={panelHidden ? 'Auswertung einblenden (Strg+J)' : 'Auswertung ausblenden (Strg+J)'}
        pressed={!panelHidden}
        onClick={() => useStore.setState({ panelHidden: !panelHidden })}
      />
    </div>
  );
}

function Panel({ exam }: { exam: ExamData }): React.JSX.Element {
  const stats = useMemo(() => buildExamModel(exam).stats, [exam]);
  return (
    <aside className={e.panel} aria-label="Auswertung" data-testid="panel">
      <h2 className={e.panelTitle}>Auswertung</h2>
      {exam.exam.entryMode === 'points' && (
        <div>
          <div className={e.panelSub}>
            {exam.exam.scheme === 'NP15' ? 'Notenschlüssel (Notenpunkte)' : hasErrorGrading(exam) ? 'Notenschlüssel der Punkte (linear)' : 'Notenschlüssel (linear)'}
          </div>
          <KeyTable exam={exam} stats={stats} />
        </div>
      )}
      <KeyFigures exam={exam} stats={stats} />
      <div>
        <div className={e.panelSub}>{exam.exam.scheme === 'NP15' ? 'Notenpunkteverteilung' : 'Notenverteilung'}</div>
        <Chart exam={exam} stats={stats} />
      </div>
      {exam.exam.entryMode === 'points' && (
        <Button icon="table" onClick={() => useStore.setState({ dialog: { kind: 'fullKey', examId: exam.exam.id } })}>
          Vollständigen Schlüssel anzeigen
        </Button>
      )}
    </aside>
  );
}

export function ExamView(): React.JSX.Element | null {
  const exam = useStore((s) => s.exam);
  const panelHidden = useStore((s) => s.panelHidden);
  if (!exam) return null;
  return (
    <div className={e.view}>
      <MetaBar exam={exam} />
      <Toolbar exam={exam} />
      <div className={e.body}>
        {exam.students.length === 0 ? (
          <div className={e.empty} style={{ flex: 1 }}>
            Dieses Fach hat noch keine Schüler/innen.{' '}
            <Button onClick={() => navigate({ view: 'course', courseId: exam.exam.courseId, tab: 'exams' })}>Schüler/innen wählen</Button>
          </div>
        ) : exam.exam.entryMode === 'grade' ? (
          <MarkGrid exam={exam} />
        ) : (
          <ScoreGrid exam={exam} />
        )}
        {!panelHidden && <Panel exam={exam} />}
      </div>
    </div>
  );
}
