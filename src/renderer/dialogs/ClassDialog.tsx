import { useState } from 'react';
import { currentSchoolYear, isValidSchoolYear, nextSchoolYear } from '@shared/schoolYear';
import type { SchoolClass } from '@shared/types';
import { call } from '../api';
import { Button, Dialog, Field, TextInput } from '../components/ui';
import { navigate, refreshTree, save, saveOk } from '../store';

/** "Neue Klasse", "Klasse umbenennen" and "Klasse kopieren". */
export function ClassDialog({ mode, source, onClose }: { mode: 'create' | 'rename' | 'copy'; source?: SchoolClass; onClose: () => void }): React.JSX.Element {
  const [name, setName] = useState(mode === 'rename' ? (source?.name ?? '') : '');
  const [year, setYear] = useState(
    mode === 'rename' ? (source?.schoolYear ?? '') : mode === 'copy' && source ? nextSchoolYear(source.schoolYear) : currentSchoolYear(),
  );
  const [tried, setTried] = useState(false);
  const nameErr = tried && !name.trim() ? 'Bitte einen Namen eingeben.' : undefined;
  const yearErr = tried && !isValidSchoolYear(year) ? 'Bitte im Format 2025/26 eingeben.' : undefined;

  const submit = async (): Promise<void> => {
    setTried(true);
    if (!name.trim() || !isValidSchoolYear(year)) return;
    const sy = year.trim();
    if (mode === 'create') {
      const id = await save(call('classes.create', { name, schoolYear: sy }));
      if (id === undefined) return;
      await refreshTree();
      onClose();
      navigate({ view: 'class', classId: id });
    } else if (mode === 'rename' && source) {
      if (!(await saveOk(call('classes.update', { id: source.id, name, schoolYear: sy })))) return;
      await refreshTree();
      onClose();
    } else if (source) {
      const id = await save(call('classes.copy', { id: source.id, name, schoolYear: sy }));
      if (id === undefined) return;
      await refreshTree();
      onClose();
      navigate({ view: 'class', classId: id });
    }
  };

  const title = mode === 'create' ? 'Neue Klasse' : mode === 'rename' ? 'Klasse umbenennen' : 'Klasse kopieren';
  const action = mode === 'create' ? 'Klasse anlegen' : mode === 'rename' ? 'Übernehmen' : 'Kopie anlegen';

  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary">
            {action}
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      {mode === 'copy' && (
        <p>
          Die Namen aller Schüler/innen und die Fächer (mit Teilnehmer/innen, Gewichtung und Notensystem) werden in eine neue Klasse übernommen. Prüfungen werden
          nicht kopiert.
        </p>
      )}
      <Field label="Klasse" htmlFor="cls-name" error={nameErr}>
        <TextInput id="cls-name" autoFocus value={name} placeholder="z. B. F-A11a" onChange={(e) => setName(e.target.value)} invalid={!!nameErr} />
      </Field>
      <Field label="Schuljahr" htmlFor="cls-year" error={yearErr} hint="z. B. 2025/26">
        <TextInput id="cls-year" value={year} onChange={(e) => setYear(e.target.value)} invalid={!!yearErr} />
      </Field>
    </Dialog>
  );
}
