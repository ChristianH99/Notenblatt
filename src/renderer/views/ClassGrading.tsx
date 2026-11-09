/** "Gewichtung" tab: grading system, final-mark rounding and categories of ONE class. */
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

export function ClassGrading({ classId }: { classId: number }): React.JSX.Element | null {
  const cls = useStore((st) => st.tree.find((c) => c.id === classId));
  if (!cls) return null;
  const used = (id: number): number => cls.exams.filter((e) => e.categoryId === id).length;
  const run = async (p: Promise<unknown>): Promise<void> => {
    if (await saveOk(p)) {
      await refreshTree();
      // An open exam of this class may have changed its grading system.
      const ex = useStore.getState().exam;
      if (ex && ex.exam.classId === classId) setExam((await call('exams.get', { id: ex.exam.id })) ?? undefined);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <p className={s.muted}>
        Diese Einstellungen gelten nur für die Klasse {cls.name} und wirken sofort auf alle Noten und Durchschnitte dieser Klasse. Die Vorlage für neue Klassen
        ändern Sie unter Einstellungen.
      </p>
      <div className={s.formGrid}>
        <label htmlFor="cls-system">Notensystem</label>
        <Select id="cls-system" value={cls.gradingSystem} onChange={(e) => void run(call('classes.updateGrading', { id: classId, gradingSystem: e.target.value as Scheme }))}>
          <option value="NP15">Notenpunkte 0–15</option>
          <option value="LIN6">Noten 1,0–6,0 (linear)</option>
        </Select>
        <label htmlFor="cls-rounding">Endnote</label>
        <Select
          id="cls-rounding"
          value={cls.finalRounding}
          onChange={(e) => void run(call('classes.updateGrading', { id: classId, finalRounding: e.target.value as RoundingRule }))}
        >
          {ROUNDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {cls.gradingSystem === 'LIN6' && cls.finalRounding !== 'none' && (
          <>
            <label htmlFor="cls-digits">Genauigkeit der Endnote</label>
            <Select
              id="cls-digits"
              value={cls.finalDigits}
              onChange={(e) => void run(call('classes.updateGrading', { id: classId, finalDigits: Number(e.target.value) as RoundingDigits }))}
            >
              <option value={0}>Ganze Note (z. B. 2)</option>
              <option value={1}>Eine Nachkommastelle (z. B. 2,3)</option>
            </Select>
          </>
        )}
      </div>
      <p className={s.muted} style={{ marginTop: -8 }}>
        Alle Prüfungen der Klasse werden im gewählten Notensystem bewertet. Der Gesamtdurchschnitt gewichtet jede Prüfung mit dem Gewicht ihrer Kategorie; die
        Endnote wird aus dem exakten Durchschnitt gerundet.
        {cls.gradingSystem === 'NP15' && ' Bei Notenpunkten bedeuten beide Rundungsregeln dasselbe (x,5 wird aufgerundet).'}
      </p>
      <CategoryEditor
        label="Kategorien der Klasse"
        items={cls.categories.map((c) => ({ ...c, used: used(c.id) }))}
        onUpdate={(id, patch) => void run(call('categories.update', { id, ...patch }))}
        onAdd={() => void run(call('categories.add', { classId, name: 'Neue Kategorie', weightC: 100, defaultMode: 'grade' }))}
        onDelete={(id) => void run(call('categories.delete', { id }))}
        onMove={(id, position) => void run(call('categories.move', { id, position }))}
      />
    </div>
  );
}
