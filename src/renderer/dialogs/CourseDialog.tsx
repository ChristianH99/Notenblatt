import { useEffect, useId, useState } from 'react';
import type { Course } from '@shared/types';
import { call } from '../api';
import { Button, Dialog, Field, TextInput } from '../components/ui';
import { navigate, refreshTree, save, saveOk, useStore } from '../store';

/** "Neues Fach" and "Fach umbenennen" (a subject taught in one class). */
export function CourseDialog({ mode, classId, source, onClose }: { mode: 'create' | 'rename'; classId: number; source?: Course; onClose: () => void }): React.JSX.Element {
  const cls = useStore((s) => s.tree.find((c) => c.id === classId));
  const [subject, setSubject] = useState(mode === 'rename' ? (source?.subject ?? '') : '');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const listId = useId();
  const err = tried && !subject.trim() ? 'Bitte ein Fach angeben.' : undefined;

  useEffect(() => {
    void call('courses.subjects').then(setSubjects);
  }, []);

  const submit = async (): Promise<void> => {
    setTried(true);
    if (!subject.trim()) return;
    if (mode === 'create') {
      const id = await save(call('courses.create', { classId, subject }));
      if (id === undefined) return;
      await refreshTree();
      onClose();
      navigate({ view: 'course', courseId: id, tab: 'exams' });
    } else if (source) {
      if (!(await saveOk(call('courses.rename', { id: source.id, subject })))) return;
      await refreshTree();
      onClose();
    }
  };

  const taken = new Set(cls?.courses.map((k) => k.subject.toLowerCase()));
  return (
    <Dialog
      title={mode === 'create' ? 'Neues Fach' : 'Fach umbenennen'}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary">
            {mode === 'create' ? 'Fach anlegen' : 'Übernehmen'}
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      {mode === 'create' && cls && (
        <p>
          Das Fach wird in der Klasse <b>{cls.name}</b> angelegt; alle Schüler/innen der Klasse nehmen zunächst teil. Gewichtung und Notensystem kommen aus der
          Vorlage in den Einstellungen.
        </p>
      )}
      <Field label="Fach" htmlFor="course-subject" error={err}>
        <TextInput id="course-subject" autoFocus list={listId} value={subject} placeholder="z. B. Mathematik" onChange={(e) => setSubject(e.target.value)} invalid={!!err} />
        <datalist id={listId}>
          {subjects
            .filter((x) => !taken.has(x.toLowerCase()))
            .map((x) => (
              <option key={x} value={x} />
            ))}
        </datalist>
      </Field>
    </Dialog>
  );
}
