/**
 * Grid for exams graded with a mark only (e.g. oral): one editable "Note" column.
 * Keyboard like the score grid: arrows, typing overwrites, F2 edits, Enter/↓ moves down,
 * Del clears, Ctrl+C/Ctrl+V copy/paste a column, Ctrl+Z/Y undo/redo (global).
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildExamModel } from '@shared/examModel';
import { formatMark, markGroup, markVerbal, parseMark } from '@shared/grading/marks';
import { formatHundredths } from '@shared/parse/number';
import type { ExamData, MarkChange } from '@shared/types';
import { call } from '../api';
import { Menu, type MenuItem } from '../components/ui';
import { applyLocalMarks, examWrite, flash, pushUndo } from '../store';
import s from './grid.module.css';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

export function MarkGrid({ exam }: { exam: ExamData }): React.JSX.Element {
  const model = useMemo(() => buildExamModel(exam), [exam]);
  const { students } = exam;
  const scheme = exam.exam.scheme;
  const examId = exam.exam.id;
  const n = students.length;
  const [focus, setFocus] = useState(0);
  const [edit, setEdit] = useState<{ r: number; value: string } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ r: number; el: HTMLElement } | null>(null);
  const active = useRef(false);
  const closing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (edit) {
      const el = inputRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      return;
    }
    if (!active.current) return;
    document.getElementById(`mark-${focus}`)?.focus();
  }, [focus, edit]);

  const valueAt = (r: number): number | null => model.marks[r] ?? null;
  const textAt = (r: number): string => {
    const v = valueAt(r);
    return v === null ? '' : formatMark(v, scheme);
  };

  const write = (changes: MarkChange[]): void => {
    const real = changes
      .map((c) => ({ ...c, before: valueAt(students.findIndex((x) => x.id === c.studentId)) }))
      .filter((c) => c.before !== c.value);
    if (!real.length) return;
    applyLocalMarks(real);
    pushUndo(examId, { kind: 'marks', changes: real.map((c) => ({ studentId: c.studentId, before: c.before, after: c.value })) });
    void examWrite(call('marks.set', { examId, changes: real.map((c) => ({ studentId: c.studentId, value: c.value })) }));
  };

  const commit = (r: number, raw: string): boolean => {
    const st = students[r];
    if (!st) return true;
    if (st.status === 'absent') {
      flash(`${st.lastName}, ${st.firstName} fehlt – keine Eingabe möglich.`);
      return false;
    }
    const p = parseMark(raw, scheme);
    if (!p.ok) {
      flash(p.error);
      return false;
    }
    write([{ studentId: st.id, value: p.value }]);
    return true;
  };

  const startEdit = (r: number, value: string | null): void => {
    const st = students[r];
    if (st?.status === 'absent') {
      flash(`${st.lastName}, ${st.firstName} fehlt – keine Eingabe möglich.`);
      return;
    }
    active.current = true;
    closing.current = false;
    setFocus(r);
    setEdit({ r, value: value ?? textAt(r) });
  };

  const move = (r: number): void => {
    active.current = true;
    setFocus(Math.min(Math.max(r, 0), n - 1));
  };

  const paste = async (): Promise<void> => {
    const text = await call('clipboard.read');
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    const changes: MarkChange[] = [];
    for (let i = 0; i < lines.length; i++) {
      const st = students[focus + i];
      if (!st) {
        flash('Der eingefügte Bereich ist größer als die Tabelle. Nichts wurde übernommen.');
        return;
      }
      if (st.status === 'absent') {
        flash(`${st.lastName}, ${st.firstName} fehlt – nichts wurde übernommen.`);
        return;
      }
      const p = parseMark((lines[i] as string).split('\t')[0] as string, scheme);
      if (!p.ok) {
        flash(`Zeile ${st.nr}: ${p.error} – nichts wurde übernommen.`);
        return;
      }
      changes.push({ studentId: st.id, value: p.value });
    }
    write(changes);
  };

  const onKey = (e: React.KeyboardEvent): void => {
    if (edit || rowMenu) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    active.current = true;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k.toLowerCase() === 'c') {
        e.preventDefault();
        void call('clipboard.write', { text: textAt(focus) });
      } else if (k.toLowerCase() === 'v') {
        e.preventDefault();
        void paste();
      }
      return;
    }
    if (k === 'ArrowDown' || k === 'Enter' || (k === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      move(focus + (k === 'Enter' && e.shiftKey ? -1 : 1));
    } else if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      move(focus - 1);
    } else if (k === 'Home' || k === 'PageUp') {
      e.preventDefault();
      move(k === 'Home' ? 0 : focus - 10);
    } else if (k === 'End' || k === 'PageDown') {
      e.preventDefault();
      move(k === 'End' ? n - 1 : focus + 10);
    } else if (k === 'F2') {
      e.preventDefault();
      startEdit(focus, null);
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      if (valueAt(focus) !== null) commit(focus, '');
    } else if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && students[focus]) {
      e.preventDefault();
      const el = document.getElementById(`nr-${focus}`);
      if (el) setRowMenu({ r: focus, el });
    } else if (k.length === 1 && !e.altKey && k !== ' ') {
      e.preventDefault();
      startEdit(focus, k);
    }
  };

  const onEditKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!edit) return;
    e.stopPropagation();
    const finish = (d: number): void => {
      e.preventDefault();
      closing.current = true;
      const ok = commit(edit.r, e.currentTarget.value);
      active.current = true;
      setEdit(null);
      if (ok) setFocus(Math.min(Math.max(edit.r + d, 0), n - 1));
    };
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Tab') finish(e.shiftKey && e.key !== 'ArrowDown' ? -1 : 1);
    else if (e.key === 'ArrowUp') finish(-1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      closing.current = true;
      active.current = true;
      setEdit(null);
    }
  };

  const rowItems = (r: number): MenuItem[] => {
    const st = students[r];
    if (!st) return [];
    const set = (status: 'present' | 'absent'): void => void examWrite(call('participation.set', { examId, studentId: st.id, status }));
    return [
      { label: 'Teilgenommen', disabled: st.status === 'present', onSelect: () => set('present') },
      { label: 'Fehlt', disabled: st.status === 'absent', onSelect: () => set('absent') },
    ];
  };

  const st = model.stats;
  return (
    <div className={s.scroller} onKeyDown={onKey} data-testid="grid-scroller">
      <table className={s.table} role="grid" aria-label="Notentabelle" style={{ width: 44 + 160 + 130 + 90 + 130 }}>
        <colgroup>
          <col style={{ width: 44 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr role="row">
            <th className={cx(s.stickyL, s.rowLabel)} style={{ left: 0 }}>
              Nr
            </th>
            <th className={s.stickyL} style={{ left: 44, textAlign: 'left' }}>
              Name
            </th>
            <th className={cx(s.stickyL, s.lastLeft)} style={{ left: 204, textAlign: 'left' }}>
              Vorname
            </th>
            <th className={s.rowLabel}>{scheme === 'NP15' ? 'NP' : 'Note'}</th>
            <th style={{ textAlign: 'left' }}>{scheme === 'NP15' ? 'Note (1–6)' : ''}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((stu, r) => {
            const v = valueAt(r);
            const rr = st.rows[r];
            const absent = stu.status === 'absent';
            const focused = focus === r;
            const editing = edit?.r === r;
            return (
              <tr key={stu.id} role="row" className={cx(absent && s.absent, focused && s.rowActive)}>
                <td className={cx(s.stickyL, s.nr)} style={{ left: 0 }} role="rowheader">
                  <button
                    type="button"
                    id={`nr-${r}`}
                    className={s.nrBtn}
                    tabIndex={-1}
                    aria-label={`Nr. ${stu.nr}, Status: ${absent ? 'fehlt' : 'teilgenommen'}`}
                    aria-haspopup="menu"
                    onClick={(e) => setRowMenu(rowMenu?.r === r ? null : { r, el: e.currentTarget })}
                  >
                    {absent && <span className={s.absentTag}>fehlt</span>}
                    {stu.nr}
                  </button>
                </td>
                <td className={cx(s.stickyL, s.name)} style={{ left: 44 }}>
                  {stu.lastName}
                </td>
                <td className={cx(s.stickyL, s.name, s.lastLeft)} style={{ left: 204 }}>
                  {stu.firstName}
                </td>
                <td
                  id={`mark-${r}`}
                  role="gridcell"
                  tabIndex={focused ? 0 : -1}
                  aria-selected={focused}
                  className={cx(s.cell, s.result, focused && !editing && s.focused, rr?.low && s.low)}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || editing) return;
                    active.current = true;
                    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                      e.preventDefault();
                      startEdit(r, null);
                    } else setFocus(r);
                  }}
                  onDoubleClick={() => startEdit(r, null)}
                >
                  {absent ? '–' : v === null ? '' : formatMark(v, scheme)}
                  {editing && (
                    <input
                      ref={inputRef}
                      className={s.editInput}
                      defaultValue={edit.value}
                      inputMode="decimal"
                      aria-label={`Note von ${stu.lastName}, ${stu.firstName}`}
                      spellCheck={false}
                      autoComplete="off"
                      onKeyDown={onEditKey}
                      onBlur={(e) => {
                        if (closing.current) return;
                        closing.current = true;
                        commit(r, e.currentTarget.value);
                        setEdit(null);
                      }}
                    />
                  )}
                </td>
                <td className={cx(s.verbal, rr?.low && s.low)}>
                  {v !== null && !absent ? (scheme === 'NP15' ? `${markGroup(v, scheme)} (${markVerbal(v, scheme)})` : markVerbal(v, scheme)) : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr role="row">
            <th colSpan={3} className={cx(s.stickyL, s.lastLeft)} style={{ left: 0 }}>
              Durchschnitt
            </th>
            <td className={cx('num', s.result)} id="avg-grade">
              {st.gradeAvgHundredths === null ? '' : formatHundredths(st.gradeAvgHundredths)}
            </td>
            <td />
          </tr>
          <tr role="row">
            <th colSpan={3} className={cx(s.stickyL, s.lastLeft)} style={{ left: 0 }}>
              mitgeschrieben
            </th>
            <td className="num">
              {st.participants} / {st.listed}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {rowMenu && <Menu anchor={rowMenu.el} label="Status" items={rowItems(rowMenu.r)} onClose={() => setRowMenu(null)} />}
    </div>
  );
}
