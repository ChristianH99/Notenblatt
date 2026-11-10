/** "Gewichtung" tab: grading system, rounding, final mark, error weights and categories of ONE course. */
import { formatWeight, parseWeight } from '@shared/overview';
import type { RoundingDigits, RoundingRule, Scheme } from '@shared/types';
import { call } from '../api';
import { CategoryEditor } from '../components/CategoryEditor';
import { Select, TextInput } from '../components/ui';
import { useEditField } from '../hooks';
import { flash, refreshTree, saveOk, setExam, useStore } from '../store';
import s from './shell.module.css';

export const ROUNDING_OPTIONS: { value: RoundingRule; label: string }[] = [
  { value: 'half_up', label: 'Kaufmännisch runden (ab x,5 zur höheren Zahl)' },
  { value: 'half_favor', label: 'Bei genau x,5 zugunsten der Schülerin / des Schülers' },
  { value: 'truncate', label: 'Abschneiden (nicht runden)' },
];

/** Grading rules of a course, or of the template for new courses. */
export interface GradingRules {
  gradingSystem: Scheme;
  rounding: RoundingRule;
  showFinal: boolean;
  finalDigits: RoundingDigits;
  pointsWeightC: number;
  errorsWeightC: number;
}

function WeightInput({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (weightC: number) => void }): React.JSX.Element {
  const field = useEditField(formatWeight(value), (raw) => {
    const w = parseWeight(raw);
    if (w === null) {
      flash('Gewicht: Zahl von 0,01 bis 100 eingeben (z. B. 1 oder 1,5).');
      return false;
    }
    onCommit(w);
    return true;
  });
  return <TextInput id={id} aria-label={label} style={{ width: 60 }} spellCheck={false} autoComplete="off" {...field} />;
}

/**
 * Form rows (for a formGrid) for grading system, rounding, final mark and the error weights.
 * Ids are `${idPrefix}-system`, `-rounding`, `-final`, `-wpoints`, `-werrors`.
 */
export function GradingRuleFields({
  idPrefix,
  value,
  onChange,
  showErrorWeights,
}: {
  idPrefix: string;
  value: GradingRules;
  onChange: (patch: Partial<GradingRules>) => void;
  showErrorWeights: boolean;
}): React.JSX.Element {
  const np = value.gradingSystem === 'NP15';
  return (
    <>
      <label htmlFor={`${idPrefix}-system`}>Notensystem</label>
      <Select id={`${idPrefix}-system`} value={value.gradingSystem} onChange={(e) => onChange({ gradingSystem: e.target.value as Scheme })}>
        <option value="NP15">Notenpunkte 0–15</option>
        <option value="LIN6">Noten 1,0–6,0 (linear)</option>
      </Select>
      <label htmlFor={`${idPrefix}-rounding`}>Rundung</label>
      <Select id={`${idPrefix}-rounding`} value={value.rounding} onChange={(e) => onChange({ rounding: e.target.value as RoundingRule })}>
        {ROUNDING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <label htmlFor={`${idPrefix}-final`}>Endnote</label>
      <Select
        id={`${idPrefix}-final`}
        value={value.showFinal ? String(value.finalDigits) : 'none'}
        onChange={(e) =>
          onChange(e.target.value === 'none' ? { showFinal: false } : { showFinal: true, finalDigits: Number(e.target.value) as RoundingDigits })
        }
      >
        {np ? (
          // NP final marks are always whole; the stored precision (for grades 1–6) is kept.
          <option value={String(value.finalDigits)}>Ganze Notenpunkte</option>
        ) : (
          <>
            <option value="0">Ganze Note (z. B. 2)</option>
            <option value="1">Eine Nachkommastelle (z. B. 2,3)</option>
          </>
        )}
        <option value="none">Keine Endnote (nur Durchschnitt anzeigen)</option>
      </Select>
      {showErrorWeights && (
        <>
          <label htmlFor={`${idPrefix}-wpoints`}>Fehlerbewertung</label>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Punkte ×
            <WeightInput id={`${idPrefix}-wpoints`} label="Gewicht der Note aus den Punkten" value={value.pointsWeightC} onCommit={(w) => onChange({ pointsWeightC: w })} />
            : Fehler ×
            <WeightInput id={`${idPrefix}-werrors`} label="Gewicht der Note aus den Fehlern" value={value.errorsWeightC} onCommit={(w) => onChange({ errorsWeightC: w })} />
          </span>
        </>
      )}
    </>
  );
}

export function CourseGrading({ courseId }: { courseId: number }): React.JSX.Element | null {
  const course = useStore((st) => st.tree.flatMap((c) => c.courses).find((k) => k.id === courseId));
  if (!course) return null;
  const used = (id: number): number => course.exams.filter((e) => e.categoryId === id).length;
  const run = async (p: Promise<unknown>): Promise<void> => {
    if (await saveOk(p)) {
      await refreshTree();
      // An open exam of this course may have changed its grading system, rounding or weights.
      const ex = useStore.getState().exam;
      if (ex && ex.exam.courseId === courseId) setExam((await call('exams.get', { id: ex.exam.id })) ?? undefined);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <p className={s.muted}>
        Diese Einstellungen gelten nur für das Fach {course.subject} dieser Klasse und wirken sofort auf alle Noten und Durchschnitte des Fachs. Die Vorlage
        für neue Fächer ändern Sie unter Einstellungen.
      </p>
      <div className={s.formGrid}>
        <GradingRuleFields
          idPrefix="cls"
          value={course}
          showErrorWeights={course.gradingSystem === 'LIN6'}
          onChange={(patch) => void run(call('courses.updateGrading', { id: courseId, ...patch }))}
        />
      </div>
      <p className={s.muted} style={{ marginTop: -8 }}>
        Alle Prüfungen des Fachs werden im gewählten Notensystem bewertet. Der Gesamtdurchschnitt gewichtet jede Prüfung mit dem Gewicht ihrer Kategorie. Die
        Rundung gilt für alle Durchschnitte (zwei Nachkommastellen), die Note von Prüfungen mit Fehlerbewertung und die Endnote; gerundet wird immer aus dem
        exakten Wert.
        {course.gradingSystem === 'NP15' && ' Bei Notenpunkten bedeuten beide Rundungsregeln dasselbe (x,5 wird aufgerundet).'}
        {course.gradingSystem === 'LIN6' &&
          ' Bei Prüfungen mit Fehlerbewertung ergibt sich die Note aus der Note der Punkte und der Note der Fehler im angegebenen Verhältnis.'}
      </p>
      <CategoryEditor
        label="Kategorien des Fachs"
        items={course.categories.map((c) => ({ ...c, used: used(c.id) }))}
        onUpdate={(id, patch) => void run(call('categories.update', { id, ...patch }))}
        onAdd={() => void run(call('categories.add', { courseId, name: 'Neue Kategorie', weightC: 100, defaultMode: 'grade' }))}
        onDelete={(id) => void run(call('categories.delete', { id }))}
        onMove={(id, position) => void run(call('categories.move', { id, position }))}
      />
    </div>
  );
}
