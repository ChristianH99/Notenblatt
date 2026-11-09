import { useMemo, useState } from 'react';
import { parseNameList } from '@shared/parse/names';
import type { NameInput } from '@shared/types';
import { call } from '../api';
import { Button, Checkbox, Dialog, Field, Notice, TextArea, uiStyles as u } from '../components/ui';
import { save } from '../store';

export function PasteNamesDialog({
  classId,
  existing,
  onClose,
  onDone,
}: {
  classId: number;
  existing: NameInput[];
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const [swap, setSwap] = useState(false);
  const [confirmDup, setConfirmDup] = useState(false);
  const rows = useMemo(() => parseNameList(text, swap, existing), [text, swap, existing]);
  const dups = rows.filter((r) => r.duplicate).length;

  const submit = async (): Promise<void> => {
    if (rows.length === 0) return;
    if (dups > 0 && !confirmDup) {
      setConfirmDup(true);
      return;
    }
    const ok = await save(call('students.add', { classId, names: rows.map((r) => ({ lastName: r.lastName, firstName: r.firstName })) }));
    if (ok !== undefined) onDone();
  };

  return (
    <Dialog
      title="Namen einfügen"
      wide
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary" disabled={rows.length === 0}>
            {confirmDup && dups > 0 ? 'Trotzdem übernehmen' : rows.length === 1 ? '1 Name übernehmen' : `${rows.length} Namen übernehmen`}
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <Field
        label="Eine Zeile pro Schüler/in"
        htmlFor="paste-text"
        hint="„Nachname, Vorname“, „Nachname⇥Vorname“ (aus Excel oder ASV kopiert) oder „Nachname Vorname“"
      >
        <TextArea
          id="paste-text"
          rows={7}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConfirmDup(false);
          }}
        />
      </Field>
      <Checkbox label="Spalten tauschen (Vorname zuerst)" checked={swap} onChange={(v) => setSwap(v)} />
      {dups > 0 && (
        <Notice>
          {dups === 1 ? '1 Name ist' : `${dups} Namen sind`} bereits vorhanden oder doppelt (markiert).{' '}
          {confirmDup ? 'Klicken Sie erneut, um sie trotzdem zu übernehmen.' : ''}
        </Notice>
      )}
      {rows.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--c-grid)' }}>
          <table className={u.table} aria-label="Vorschau">
            <thead>
              <tr>
                <th className="num" style={{ width: 44 }}>
                  Zeile
                </th>
                <th>Name</th>
                <th>Vorname</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={r.duplicate ? u.dup : undefined}>
                  <td className="num">{r.line}</td>
                  <td>{r.lastName}</td>
                  <td>{r.firstName}</td>
                  <td>{r.duplicate ? 'doppelt' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
