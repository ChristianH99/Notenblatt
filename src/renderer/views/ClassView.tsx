import { useCallback, useEffect, useMemo, useState } from 'react';
import { examTitle } from '@shared/labels';
import type { Student } from '@shared/types';
import { call } from '../api';
import { Button, uiStyles as u } from '../components/ui';
import { ClassDialog } from '../dialogs/ClassDialog';
import { PasteNamesDialog } from '../dialogs/PasteNamesDialog';
import { useEditField } from '../hooks';
import { ClassGrading } from './ClassGrading';
import { ClassOverview } from './ClassOverview';
import { bumpVersion, flash, openExam, refreshTree, save, saveOk, useStore } from '../store';
import s from './shell.module.css';
import c from './classView.module.css';

function NameCell({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => Promise<boolean> }): React.JSX.Element {
  const field = useEditField(value, onCommit);
  return <input className={c.cellInput} aria-label={label} spellCheck={false} autoComplete="off" {...field} />;
}

export function ClassView({ classId }: { classId: number }): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const version = useStore((st) => st.version);
  const cls = tree.find((x) => x.id === classId);
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newLast, setNewLast] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [dialog, setDialog] = useState<'rename' | 'copy' | 'paste' | null>(null);
  const [tab, setTab] = useState<'overview' | 'students' | 'grading'>(() =>
    (useStore.getState().tree.find((x) => x.id === classId)?.exams.length ?? 0) > 0 ? 'overview' : 'students',
  );

  const load = useCallback(async () => {
    const list = await call('students.list', { classId });
    setStudents(list);
    setSelected((sel) => new Set([...sel].filter((id) => list.some((x) => x.id === id))));
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const allSelected = students.length > 0 && selected.size === students.length;

  const addOne = async (): Promise<void> => {
    if (!newLast.trim()) {
      flash('Bitte einen Nachnamen eingeben.');
      return;
    }
    const ok = await save(call('students.add', { classId, names: [{ lastName: newLast, firstName: newFirst }] }));
    if (ok) {
      setNewLast('');
      setNewFirst('');
      await load();
      await refreshTree();
      document.getElementById('new-last')?.focus();
    }
  };

  const update = async (st: Student, lastName: string, firstName: string): Promise<boolean> => {
    if (!(await saveOk(call('students.update', { id: st.id, lastName, firstName })))) return false;
    await load();
    return true;
  };

  const exams = useMemo(() => cls?.exams ?? [], [cls]);

  if (!cls) return <div className={s.page} />;

  return (
    <div className={s.page}>
      <div className={c.wrap}>
        <div className={c.head}>
          <div>
            <h1 className={s.viewTitle}>Klasse {cls.name}</h1>
            <div className={s.muted}>
              Schuljahr {cls.schoolYear} · {students.length} Schüler/innen
            </div>
          </div>
          <div className={s.spacer} />
          <Button icon="edit" onClick={() => setDialog('rename')}>
            Umbenennen…
          </Button>
          <Button icon="copy" onClick={() => setDialog('copy')}>
            Klasse kopieren…
          </Button>
          <Button icon="delete" onClick={() => useStore.setState({ dialog: { kind: 'deleteClass', classId } })}>
            Klasse löschen…
          </Button>
        </div>

        <div className={c.tabs} role="tablist" aria-label="Ansicht">
          {(
            [
              ['overview', 'Notenübersicht'],
              ['students', 'Schüler/innen und Prüfungen'],
              ['grading', 'Gewichtung'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${c.tab} ${tab === k ? c.tabActive : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <ClassOverview classId={classId} />}
        {tab === 'grading' && <ClassGrading classId={classId} />}
        {tab === 'students' && (
        <div className={c.columns}>
          <section className={`${s.section} ${c.students}`}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Schüler/innen</h2>
              <Button icon="clipboardPaste" onClick={() => setDialog('paste')}>
                Namen einfügen…
              </Button>
              <Button
                icon="personDelete"
                disabled={selected.size === 0}
                onClick={() => useStore.setState({ dialog: { kind: 'deleteStudents', ids: [...selected] } })}
              >
                {selected.size > 1 ? `${selected.size} Schüler/innen löschen…` : 'Schüler/in löschen…'}
              </Button>
            </div>
            <div className={c.tableWrap}>
              <table className={u.table} aria-label="Schülerliste">
                <thead>
                  <tr>
                    <th className={c.colCheck}>
                      <input
                        type="checkbox"
                        aria-label="Alle auswählen"
                        checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? new Set(students.map((x) => x.id)) : new Set())}
                      />
                    </th>
                    <th className={`num ${c.colNr}`}>Nr</th>
                    <th>Name</th>
                    <th>Vorname</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st, i) => (
                    <tr key={st.id} className={selected.has(st.id) ? c.selRow : undefined}>
                      <td className={c.colCheck}>
                        <input
                          type="checkbox"
                          aria-label={`${st.lastName}, ${st.firstName} auswählen`}
                          checked={selected.has(st.id)}
                          onChange={(e) => {
                            const n = new Set(selected);
                            if (e.target.checked) n.add(st.id);
                            else n.delete(st.id);
                            setSelected(n);
                          }}
                        />
                      </td>
                      <td className={`num ${c.colNr}`}>{i + 1}</td>
                      <td className={c.nameCol}>
                        <NameCell value={st.lastName} label={`Name von Nr. ${i + 1}`} onCommit={(v) => update(st, v, st.firstName)} />
                      </td>
                      <td className={c.nameCol}>
                        <NameCell value={st.firstName} label={`Vorname von Nr. ${i + 1}`} onCommit={(v) => update(st, st.lastName, v)} />
                      </td>
                    </tr>
                  ))}
                  <tr className={c.newRow}>
                    <td className={c.colCheck} />
                    <td className={`num ${c.colNr}`}>
                      <span className="sr-only">Neu</span>+
                    </td>
                    <td className={c.nameCol}>
                      <input
                        id="new-last"
                        className={c.cellInput}
                        placeholder="Name"
                        aria-label="Neuer Name"
                        value={newLast}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setNewLast(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void addOne()}
                      />
                    </td>
                    <td className={c.nameCol}>
                      <input
                        className={c.cellInput}
                        placeholder="Vorname"
                        aria-label="Neuer Vorname"
                        value={newFirst}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setNewFirst(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void addOne()}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {students.length === 0 && (
              <div className={c.empty}>
                <span className={s.muted}>Noch keine Schüler/innen. Tragen Sie Namen in die letzte Zeile ein oder fügen Sie eine Liste ein.</span>
              </div>
            )}
          </section>

          <section className={`${s.section} ${c.exams}`}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>Prüfungen</h2>
              <Button icon="add" onClick={() => useStore.setState({ dialog: { kind: 'newExam', classId } })}>
                Neue Prüfung
              </Button>
            </div>
            {exams.length === 0 ? (
              <div className={c.empty}>
                <span className={s.muted}>Noch keine Prüfungen.</span>
              </div>
            ) : (
              <ul className={c.examList}>
                {exams.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={c.examItem} onClick={() => void openExam(e.id)}>
                      {examTitle(e)}
                      <span className={c.examCat}>{cls.categories.find((k) => k.id === e.categoryId)?.name ?? ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        )}
      </div>

      {dialog === 'rename' && <ClassDialog mode="rename" source={cls} onClose={() => setDialog(null)} />}
      {dialog === 'copy' && <ClassDialog mode="copy" source={cls} onClose={() => setDialog(null)} />}
      {dialog === 'paste' && (
        <PasteNamesDialog
          classId={classId}
          existing={students}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            await load();
            await refreshTree();
            bumpVersion();
          }}
        />
      )}
    </div>
  );
}
