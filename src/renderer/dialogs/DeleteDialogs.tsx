import { useEffect, useState } from 'react';
import { examTitle } from '@shared/labels';
import type { ClassDeletionInfo, CourseDeletionInfo, StudentDeletionInfo } from '@shared/types';
import { call } from '../api';
import { Button, Dialog, Field, TextInput } from '../components/ui';
import { bumpVersion, clearAllUndo, navigate, openExam, refreshTree, saveOk, setSetting, useStore } from '../store';

const n = (v: number, one: string, many: string): string => `${v} ${v === 1 ? one : many}`;

export function DeleteStudentsDialog({ ids, onClose }: { ids: number[]; onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<StudentDeletionInfo | null>(null);
  useEffect(() => {
    void call('students.deletionInfo', { ids }).then(setInfo);
  }, [ids]);

  const submit = async (): Promise<void> => {
    if (!(await saveOk(call('students.delete', { ids })))) return;
    clearAllUndo();
    await refreshTree();
    bumpVersion();
    const exam = useStore.getState().exam;
    if (exam) await openExam(exam.exam.id, { remember: false });
    onClose();
  };

  const one = info?.students.length === 1 ? info.students[0] : null;
  return (
    <Dialog
      title={ids.length === 1 ? 'Schüler/in löschen' : 'Schüler/innen löschen'}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger" disabled={!info}>
            Endgültig löschen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      {info && one && (
        <p>
          Schüler/in{' '}
          <b>
            {one.lastName}, {one.firstName}
          </b>{' '}
          und alle zugehörigen Ergebnisse ({n(info.scores, 'Eintrag', 'Einträge')} in {n(info.exams, 'Prüfung', 'Prüfungen')}) endgültig löschen? Dies kann nicht
          rückgängig gemacht werden.
        </p>
      )}
      {info && !one && (
        <>
          <p>
            {info.students.length} Schüler/innen und alle zugehörigen Ergebnisse ({n(info.scores, 'Eintrag', 'Einträge')} in {n(info.exams, 'Prüfung', 'Prüfungen')})
            endgültig löschen? Dies kann nicht rückgängig gemacht werden.
          </p>
          <ul style={{ margin: 0, maxHeight: 160, overflow: 'auto' }}>
            {info.students.map((s) => (
              <li key={s.id}>
                {s.lastName}, {s.firstName}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

export function DeleteClassDialog({ classId, onClose }: { classId: number; onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<ClassDeletionInfo | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    void call('classes.deletionInfo', { id: classId }).then(setInfo);
  }, [classId]);
  const match = !!info && typed.trim() === info.name;

  const submit = async (): Promise<void> => {
    if (!match) return;
    if (!(await saveOk(call('classes.delete', { id: classId })))) return;
    clearAllUndo();
    const st = useStore.getState();
    const courses = st.tree.find((c) => c.id === classId)?.courses ?? [];
    const examGone = st.exam && st.exam.exam.classId === classId;
    if (st.settings.lastExamId !== null && courses.some((k) => k.exams.some((e) => e.id === st.settings.lastExamId))) {
      await setSetting('lastExamId', null);
    }
    await refreshTree();
    bumpVersion();
    const r = st.route;
    const courseGone = r.view === 'course' && courses.some((k) => k.id === r.courseId);
    if (examGone || courseGone || (st.route.view === 'class' && st.route.classId === classId)) navigate({ view: 'home' });
    onClose();
  };

  return (
    <Dialog
      title="Klasse löschen"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger" disabled={!match}>
            Endgültig löschen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      {info && (
        <>
          <p>
            Die Klasse <b>{info.name}</b> wird mit allen Daten endgültig gelöscht:
          </p>
          <ul style={{ margin: 0 }}>
            <li>{n(info.students, 'Schüler/in', 'Schüler/innen')}</li>
            <li>{n(info.courses, 'Fach', 'Fächer')}</li>
            <li>{n(info.exams, 'Prüfung', 'Prüfungen')}</li>
            <li>{n(info.scores, 'Punkteeintrag', 'Punkteeinträge')}</li>
          </ul>
          <p>Dies kann nicht rückgängig gemacht werden.</p>
          <Field label={`Geben Sie zur Bestätigung den Klassennamen „${info.name}“ ein`} htmlFor="del-class-name">
            <TextInput id="del-class-name" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        </>
      )}
    </Dialog>
  );
}

export function DeleteCourseDialog({ courseId, onClose }: { courseId: number; onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<CourseDeletionInfo | null>(null);
  useEffect(() => {
    void call('courses.deletionInfo', { id: courseId }).then(setInfo);
  }, [courseId]);

  const submit = async (): Promise<void> => {
    const st = useStore.getState();
    const course = st.tree.flatMap((c) => c.courses).find((k) => k.id === courseId);
    if (!(await saveOk(call('courses.delete', { id: courseId })))) return;
    clearAllUndo();
    if (st.settings.lastExamId !== null && course?.exams.some((e) => e.id === st.settings.lastExamId)) await setSetting('lastExamId', null);
    await refreshTree();
    bumpVersion();
    const examGone = st.exam && st.exam.exam.courseId === courseId;
    if (examGone || (st.route.view === 'course' && st.route.courseId === courseId)) navigate(course ? { view: 'class', classId: course.classId } : { view: 'home' });
    onClose();
  };

  return (
    <Dialog
      title="Fach löschen"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger" disabled={!info}>
            Endgültig löschen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      {info && (
        <>
          <p>
            Das Fach <b>{info.subject}</b> der Klasse {info.className} wird mit {n(info.exams, 'Prüfung', 'Prüfungen')} und{' '}
            {n(info.scores, 'Eintrag', 'Einträgen')} endgültig gelöscht. Die Schüler/innen bleiben in der Klasse.
          </p>
          <p>Dies kann nicht rückgängig gemacht werden.</p>
        </>
      )}
    </Dialog>
  );
}

export function DeleteExamDialog({ examId, onClose }: { examId: number; onClose: () => void }): React.JSX.Element {
  const exam = useStore((s) => s.exam);
  const title = exam && exam.exam.id === examId ? examTitle(exam.exam) : 'diese Prüfung';
  const entries = exam && exam.exam.id === examId ? exam.scores.length : 0;
  const submit = async (): Promise<void> => {
    if (!(await saveOk(call('exams.delete', { id: examId })))) return;
    if (useStore.getState().settings.lastExamId === examId) await setSetting('lastExamId', null);
    const courseId = exam?.exam.courseId;
    const st = useStore.getState();
    useStore.setState({ undo: { ...st.undo, [examId]: [] }, redo: { ...st.redo, [examId]: [] } });
    await refreshTree();
    onClose();
    navigate(courseId ? { view: 'course', courseId } : { view: 'home' });
  };
  return (
    <Dialog
      title="Prüfung löschen"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger">
            Endgültig löschen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <p>
        <b>{title}</b> mit allen Aufgaben und {n(entries, 'Punkteeintrag', 'Punkteeinträgen')} endgültig löschen? Dies kann nicht rückgängig gemacht werden.
      </p>
    </Dialog>
  );
}
