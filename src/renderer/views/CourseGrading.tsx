/** "Gewichtung" tab: grading system, final-mark rounding and categories of ONE course. */
import type { RoundingDigits, RoundingRule, Scheme } from '@shared/types';
import { call } from '../api';
import { CategoryEditor } from '../components/CategoryEditor';
import { Select } from '../components/ui';
import { refreshTree, saveOk, setExam, useStore } from '../store';
import s from './shell.module.css';

export const ROUNDING_OPTIONS: { value: RoundingRule; label: string }[] = [
  { value: 'half_up', label: 'Kaufmännisch runden (ab x,5 zur höheren Zahl)' },
  { value: 'half_favor', label: 'Bei genau x,5 zugunsten der Schülerin / des Schülers' },
  { value: 'none', label: 'Keine Endnote (nur Durchschnitt anzeigen)' },
];

export function CourseGrading({ courseId }: { courseId: number }): React.JSX.Element | null {
  const course = useStore((st) => st.tree.flatMap((c) => c.courses).find((k) => k.id === courseId));
  if (!course) return null;
  const used = (id: number): number => course.exams.filter((e) => e.categoryId === id).length;
  const run = async (p: Promise<unknown>): Promise<void> => {
    if (await saveOk(p)) {
      await refreshTree();
      // An open exam of this course may have changed its grading system.
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
        <label htmlFor="cls-system">Notensystem</label>
        <Select id="cls-system" value={course.gradingSystem} onChange={(e) => void run(call('courses.updateGrading', { id: courseId, gradingSystem: e.target.value as Scheme }))}>
          <option value="NP15">Notenpunkte 0–15</option>
          <option value="LIN6">Noten 1,0–6,0 (linear)</option>
        </Select>
        <label htmlFor="cls-rounding">Endnote</label>
        <Select
          id="cls-rounding"
          value={course.finalRounding}
          onChange={(e) => void run(call('courses.updateGrading', { id: courseId, finalRounding: e.target.value as RoundingRule }))}
        >
          {ROUNDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {course.gradingSystem === 'LIN6' && course.finalRounding !== 'none' && (
          <>
            <label htmlFor="cls-digits">Genauigkeit der Endnote</label>
            <Select
              id="cls-digits"
              value={course.finalDigits}
              onChange={(e) => void run(call('courses.updateGrading', { id: courseId, finalDigits: Number(e.target.value) as RoundingDigits }))}
            >
              <option value={0}>Ganze Note (z. B. 2)</option>
              <option value={1}>Eine Nachkommastelle (z. B. 2,3)</option>
            </Select>
          </>
        )}
      </div>
      <p className={s.muted} style={{ marginTop: -8 }}>
        Alle Prüfungen des Fachs werden im gewählten Notensystem bewertet. Der Gesamtdurchschnitt gewichtet jede Prüfung mit dem Gewicht ihrer Kategorie; die
        Endnote wird aus dem exakten Durchschnitt gerundet.
        {course.gradingSystem === 'NP15' && ' Bei Notenpunkten bedeuten beide Rundungsregeln dasselbe (x,5 wird aufgerundet).'}
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
