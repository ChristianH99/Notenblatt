import { useEffect, useState } from 'react';
import type { ExamPick } from '@shared/api';
import type { StepQp } from '@shared/grading/units';
import { EXAM_KINDS } from '@shared/labels';
import { formatDateDe, parsePoints, parseDateDe, todayIso } from '@shared/parse/number';
import { call } from '../api';
import { formatWeight } from '@shared/overview';
import type { EntryMode } from '@shared/types';
import { ComboBox } from '../components/ComboBox';
import { Button, Checkbox, Dialog, Field, RadioGroup, Select, TextInput } from '../components/ui';
import { openExam, refreshTree, save, useStore } from '../store';

export function NewExamDialog({ courseId, categoryId, onClose }: { courseId: number | null; categoryId: number | null; onClose: () => void }): React.JSX.Element {
  const tree = useStore((s) => s.tree);
  const settings = useStore((s) => s.settings);
  const courses = tree.flatMap((c) => c.courses);
  const [course, setCourse] = useState<number>(courseId ?? courses[0]?.id ?? 0);
  const courseItem = courses.find((k) => k.id === course);
  const firstCat = courseItem?.categories.find((c) => c.id === categoryId) ?? courseItem?.categories[0];
  const [cat, setCat] = useState<number | null>(firstCat?.id ?? null);
  const [entry, setEntry] = useState<EntryMode>(firstCat?.defaultMode ?? 'points');
  const [kind, setKind] = useState(firstCat?.defaultMode === 'grade' ? 'Mündliche Note' : 'Klassenarbeit');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(formatDateDe(todayIso()));
  const [teacher, setTeacher] = useState(settings.teacher);

  const pickCourse = (id: number): void => {
    setCourse(id);
    const c = courses.find((x) => x.id === id);
    const k = c?.categories[0];
    setCat(k?.id ?? null);
    if (k) setEntry(k.defaultMode);
  };
  const pickCategory = (id: number): void => {
    setCat(id);
    const k = courseItem?.categories.find((x) => x.id === id);
    if (k) {
      setEntry(k.defaultMode);
      if (k.defaultMode === 'grade' && kind === 'Klassenarbeit') setKind('Mündliche Note');
      if (k.defaultMode === 'points' && kind === 'Mündliche Note') setKind('Klassenarbeit');
    }
  };
  const [step, setStep] = useState<StepQp>(2);
  const [errorGrading, setErrorGrading] = useState(false);
  /** Error grading exists only for points exams in subjects graded 1–6. */
  const errorsPossible = entry === 'points' && courseItem?.gradingSystem === 'LIN6';
  /** Points per task (tasks, structure) or only the total per student. */
  const [perTask, setPerTask] = useState(false);
  const [maxPoints, setMaxPoints] = useState('');
  const [mode, setMode] = useState<'count' | 'copy'>('count');
  const [count, setCount] = useState('5');
  const [source, setSource] = useState<number | null>(null);
  const [exams, setExams] = useState<ExamPick[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    void call('exams.all').then(setExams);
  }, []);

  const iso = parseDateDe(date);
  const n = Number(count);
  const countOk = /^\d+$/.test(count.trim()) && n >= 1 && n <= 200;
  const maxParsed = parsePoints(maxPoints, { stepQp: step, positive: true });
  const maxOk = maxParsed.ok && maxParsed.qp !== null;
  const tasksMode = entry === 'points' && perTask;
  const errs = {
    kind: tried && !kind.trim() ? 'Bitte die Art angeben.' : undefined,
    date: tried && !iso ? 'Bitte ein Datum im Format TT.MM.JJJJ eingeben.' : undefined,
    count: tried && tasksMode && mode === 'count' && !countOk ? 'Bitte eine Zahl von 1 bis 200 eingeben.' : undefined,
    source: tried && tasksMode && mode === 'copy' && source === null ? 'Bitte eine Prüfung auswählen.' : undefined,
    max:
      tried && entry === 'points' && !perTask && !maxOk
        ? maxParsed.ok
          ? 'Bitte die Höchstpunktzahl eingeben.'
          : maxParsed.error
        : undefined,
  };

  const submit = async (): Promise<void> => {
    setTried(true);
    if (!kind.trim() || !iso || !course) return;
    if (tasksMode && mode === 'count' && !countOk) return;
    if (tasksMode && mode === 'copy' && source === null) return;
    if (entry === 'points' && !perTask && !maxOk) return;
    const id = await save(
      call('exams.create', {
        courseId: course,
        kind,
        number,
        examDate: iso,
        teacher,
        stepQp: step,
        taskCount: tasksMode && mode === 'count' ? n : 0,
        copyFromExamId: tasksMode && mode === 'copy' ? source : null,
        perTask: entry === 'points' ? perTask : true,
        totalMaxQp: entry === 'points' && !perTask && maxOk ? (maxParsed.qp as number) : undefined,
        categoryId: cat,
        entryMode: entry,
        errorGrading: errorsPossible && errorGrading,
      }),
    );
    if (id === undefined) return;
    await refreshTree();
    onClose();
    await openExam(id);
  };

  return (
    <Dialog
      title="Neue Prüfung"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary">
            Prüfung anlegen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Klasse und Fach" htmlFor="ex-course">
          <Select id="ex-course" value={course} onChange={(e) => pickCourse(Number(e.target.value))}>
            {tree
              .filter((c) => c.courses.length > 0)
              .map((c) => (
                <optgroup key={c.id} label={`${c.name} (${c.schoolYear})`}>
                  {c.courses.map((k) => (
                    <option key={k.id} value={k.id}>
                      {c.name} · {k.subject}
                    </option>
                  ))}
                </optgroup>
              ))}
          </Select>
        </Field>
        <Field label="Datum" htmlFor="ex-date" error={errs.date}>
          <TextInput id="ex-date" value={date} onChange={(e) => setDate(e.target.value)} placeholder="TT.MM.JJJJ" invalid={!!errs.date} />
        </Field>
        <Field label="Kategorie (Gewichtung)" htmlFor="ex-cat">
          <Select id="ex-cat" value={cat ?? ''} onChange={(e) => pickCategory(Number(e.target.value))}>
            {courseItem?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (×{formatWeight(c.weightC)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Art" htmlFor="ex-kind" error={errs.kind}>
          <ComboBox id="ex-kind" options={EXAM_KINDS} value={kind} onChange={setKind} invalid={!!errs.kind} autoFocus />
        </Field>
        <Field label="Nr." htmlFor="ex-nr">
          <TextInput id="ex-nr" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="z. B. 2." />
        </Field>
        <Field label="Lehrkraft" htmlFor="ex-teacher">
          <TextInput id="ex-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </Field>
      </div>
      <RadioGroup
        legend="Eingabe"
        row
        value={entry}
        onChange={setEntry}
        options={[
          { value: 'points', label: 'Punkte (z. B. schriftlich)' },
          { value: 'grade', label: 'Nur Note (z. B. mündlich)' },
        ]}
      />
      {entry === 'points' && (
      <>
      {errorsPossible && (
        <Checkbox
          id="ex-errors"
          label="Fehlerbewertung (zusätzlich Anzahl der Fehler je Schüler/in)"
          checked={errorGrading}
          onChange={setErrorGrading}
        />
      )}
      <RadioGroup
        legend="Punkteschritt"
        row
        value={String(step) as '1' | '2' | '4'}
        onChange={(v) => setStep(Number(v) as StepQp)}
        options={[
          { value: '4', label: '1' },
          { value: '2', label: '0,5' },
          { value: '1', label: '0,25' },
        ]}
      />
      <Checkbox id="ex-pertask" label="Punkte je Aufgabe eingeben (sonst nur die Gesamtpunktzahl)" checked={perTask} onChange={setPerTask} />
      {!perTask && (
        <Field label="Höchstpunktzahl" htmlFor="ex-max" error={errs.max} hint="Je Schüler/in wird nur die erreichte Gesamtpunktzahl eingetragen.">
          <TextInput id="ex-max" inputMode="decimal" value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} invalid={!!errs.max} style={{ width: 100 }} />
        </Field>
      )}
      {perTask && (
      <>
      <RadioGroup
        legend="Aufgaben"
        row
        value={mode}
        onChange={setMode}
        options={[
          { value: 'count', label: 'Anzahl' },
          { value: 'copy', label: 'Struktur übernehmen von…' },
        ]}
      />
      {mode === 'count' ? (
        <Field label="Anzahl der Aufgaben" htmlFor="ex-count" error={errs.count} hint="Bezeichnungen 1 … n; die Höchstpunkte tragen Sie danach in der Tabelle ein.">
          <TextInput id="ex-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} invalid={!!errs.count} style={{ width: 100 }} />
        </Field>
      ) : (
        <Field label="Aufgaben und Höchstpunkte übernehmen von" htmlFor="ex-source" error={errs.source}>
          <Select
            id="ex-source"
            value={source ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setSource(id);
              const ex = exams.find((x) => x.id === id);
              if (ex) setStep(ex.stepQp);
            }}
          >
            <option value="">Bitte wählen…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.className} ({e.schoolYear}) · {e.title} · {e.taskCount} Aufg.
              </option>
            ))}
          </Select>
        </Field>
      )}
      </>
      )}
      </>
      )}
    </Dialog>
  );
}
