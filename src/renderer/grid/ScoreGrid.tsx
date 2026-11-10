import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildExamModel, errorsText, hasErrorGrading, partText, resultText, sumText } from '@shared/examModel';
import { formatHundredths, formatQp, formatTenths, parsePoints } from '@shared/parse/number';
import { formatErrors, parseErrors } from '@shared/grading/errors';
import { linIsLow, VERBAL } from '@shared/grading/lin6';
import { formatWeight } from '@shared/overview';
import type { ErrorChange, ExamData, ScoreChange, TotalChange } from '@shared/types';
import { call } from '../api';
import { Icon } from '../components/Icon';
import { Button, Dialog, Menu, type MenuItem } from '../components/ui';
import { useTouchMode } from '../hooks';
import { applyLocalErrors, applyLocalScores, applyLocalTotals, examWrite, flash, pushUndo, useStore } from '../store';
import s from './grid.module.css';

const LABEL_ROW = -2;
const MAX_ROW = -1;

interface Pos {
  r: number;
  c: number;
}
interface EditState extends Pos {
  value: string;
  /** overwrite: arrows commit and move · edit (F2): arrows move the caret */
  mode: 'overwrite' | 'edit';
}

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');
const cellId = (r: number, c: number): string => `cell-${r}-${c}`;
/** DOM id of a cell; sum and error count of student rows have their own ids. */
const domId = (r: number, c: number, sumCol: number, errCol: number): string =>
  r >= 0 && c === sumCol ? `sum-${r}` : r >= 0 && c === errCol ? `err-${r}` : cellId(r, c);

function rectOf(a: Pos | null, f: Pos): { r0: number; r1: number; c0: number; c1: number } {
  const b = a && a.r >= 0 && f.r >= 0 ? a : f;
  return { r0: Math.min(b.r, f.r), r1: Math.max(b.r, f.r), c0: Math.min(b.c, f.c), c1: Math.max(b.c, f.c) };
}

export function ScoreGrid({ exam }: { exam: ExamData }): React.JSX.Element {
  const enterDir = useStore((st) => st.settings.enterDirection);
  const showEq = useStore((st) => st.settings.showGradeEquivalent);
  const touch = useTouchMode();
  const model = useMemo(() => buildExamModel(exam), [exam]);
  const { tasks, students } = exam;
  const examId = exam.exam.id;
  const step = exam.exam.stepQp;
  const np = exam.exam.scheme === 'NP15';
  const errorGrading = hasErrorGrading(exam);
  /** Only the total per student is entered: the single task column is the points column, no sum column. */
  const totalOnly = !exam.exam.perTask;
  const nT = tasks.length;
  const nR = students.length;
  /** Column index of the editable sum (after the last task; none for total-only exams) and of the error count. */
  const SUM = totalOnly ? -1 : nT;
  const ERR = errorGrading ? (totalOnly ? nT : nT + 1) : -1;
  /** Last column a student row can be navigated to. */
  const LAST = Math.max(nT - 1, SUM, ERR);

  const [focus, setFocus] = useState<Pos>({ r: nR > 0 ? 0 : MAX_ROW, c: 0 });
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [taskMenu, setTaskMenu] = useState<{ c: number; el: HTMLElement } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ r: number; el: HTMLElement } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ c: number; entries: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set when an edit was finished by key, so the following blur does not commit again. */
  const closing = useRef(false);

  // Keep focus inside the grid when rows/tasks change.
  useEffect(() => {
    setFocus((f) => ({ r: Math.min(Math.max(f.r, LABEL_ROW), nR - 1), c: Math.min(Math.max(f.c, 0), Math.max(nT - 1, 0)) }));
  }, [nR, nT]);

  useLayoutEffect(() => {
    if (edit) {
      const el = inputRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
      return;
    }
    if (!active.current) return;
    const el = document.getElementById(domId(focus.r, focus.c, SUM, ERR));
    if (el && document.activeElement !== el) el.focus({ preventScroll: false });
  }, [focus, edit, SUM, ERR]);

  // ───── geometry ─────
  const W = useMemo(
    () => ({ nr: 44, name: touch ? 140 : 130, first: touch ? 120 : 110, task: touch ? 64 : 58, add: 36, sum: 66, res: np ? 52 : 52, verbal: 104, eq: 52, err: 58, part: 62 }),
    [touch, np],
  );
  const rightCols = useMemo(() => {
    // Error grading: points grade (pres), error count (err) and error grade (eres) before the exam grade.
    const cols: { key: 'sum' | 'pres' | 'err' | 'eres' | 'res' | 'verbal' | 'eq'; w: number }[] = totalOnly ? [] : [{ key: 'sum', w: W.sum }];
    if (errorGrading) cols.push({ key: 'pres', w: W.part }, { key: 'err', w: W.err }, { key: 'eres', w: W.part });
    cols.push({ key: 'res', w: W.res });
    if (!np) cols.push({ key: 'verbal', w: W.verbal });
    if (np && showEq) cols.push({ key: 'eq', w: W.eq });
    let right = 0;
    const off: Record<string, number> = {};
    for (let i = cols.length - 1; i >= 0; i--) {
      const col = cols[i] as (typeof cols)[number];
      off[col.key] = right;
      right += col.w;
    }
    return { cols, off, total: right };
  }, [W, np, showEq, errorGrading, totalOnly]);
  const taskW = totalOnly ? W.sum : W.task;
  const addW = totalOnly ? 0 : W.add;
  const leftW = W.nr + W.name + W.first;
  const stL = (left: number): React.CSSProperties => ({ left });
  const stR = (key: string): React.CSSProperties => ({ right: rightCols.off[key] });

  // ───── value helpers ─────
  const valueAt = useCallback((r: number, c: number): number | null => model.values[r]?.[c] ?? null, [model]);
  const idOf = (r: number, c: number): string => domId(r, c, SUM, ERR);
  const totalAt = (r: number): number | null => model.totals[r] ?? null;
  const errorsAt = (r: number): number | null => model.errors[r] ?? null;
  const isOverride = (r: number): boolean => r >= 0 && totalAt(r) !== null;
  const lockedMsg = (r: number): string => {
    const st = students[r];
    return `Für ${st?.lastName}, ${st?.firstName} ist die Summe direkt eingetragen. Leeren Sie zuerst die Summe, um die Aufgaben zu bearbeiten.`;
  };
  const textAt = (r: number, c: number): string => {
    if (c === SUM && r >= 0) {
      const tot = totalAt(r);
      return tot === null ? '' : formatQp(tot);
    }
    if (c === ERR && r >= 0) {
      const e = errorsAt(r);
      return e === null ? '' : formatErrors(e);
    }
    const t = tasks[c];
    if (!t) return '';
    if (r === LABEL_ROW) return totalOnly ? 'Punkte' : t.label;
    if (r === MAX_ROW) return formatQp(t.maxQp);
    const v = valueAt(r, c);
    return v === null ? '' : formatQp(v);
  };

  const isAbsent = (r: number): boolean => r >= 0 && students[r]?.status === 'absent';

  // ───── writes ─────
  const writeScores = (changes: ScoreChange[]): void => {
    const withBefore = changes.map((ch) => {
      const r = students.findIndex((x) => x.id === ch.studentId);
      const c = tasks.findIndex((x) => x.id === ch.taskId);
      return { ...ch, before: valueAt(r, c), after: ch.qp };
    });
    const real = withBefore.filter((x) => x.before !== x.after);
    if (real.length === 0) return;
    applyLocalScores(real);
    pushUndo(examId, { kind: 'cells', changes: real.map((x) => ({ taskId: x.taskId, studentId: x.studentId, before: x.before, after: x.after })) });
    void examWrite(call('scores.set', { examId, changes: real.map((x) => ({ taskId: x.taskId, studentId: x.studentId, qp: x.qp })) }));
  };

  const writeTotals = (changes: TotalChange[]): void => {
    const real = changes
      .map((ch) => ({ ...ch, before: totalAt(students.findIndex((x) => x.id === ch.studentId)) }))
      .filter((x) => x.before !== x.qp);
    if (real.length === 0) return;
    applyLocalTotals(real);
    pushUndo(examId, { kind: 'totals', changes: real.map((x) => ({ studentId: x.studentId, before: x.before, after: x.qp })) });
    void examWrite(call('totals.set', { examId, changes: real.map((x) => ({ studentId: x.studentId, qp: x.qp })) }));
  };

  const writeErrors = (changes: ErrorChange[]): void => {
    const real = changes
      .map((ch) => ({ ...ch, before: errorsAt(students.findIndex((x) => x.id === ch.studentId)) }))
      .filter((x) => x.before !== x.halfErrors);
    if (real.length === 0) return;
    applyLocalErrors(real);
    pushUndo(examId, { kind: 'errors', changes: real.map((x) => ({ studentId: x.studentId, before: x.before, after: x.halfErrors })) });
    void examWrite(call('errors.set', { examId, changes: real.map((x) => ({ studentId: x.studentId, halfErrors: x.halfErrors })) }));
  };

  const parseTotal = (raw: string): ReturnType<typeof parsePoints> => {
    const p = parsePoints(raw, { stepQp: step, maxQp: model.maxQp });
    return p.ok ? p : { ok: false, error: `Summe: ${p.error}` };
  };

  /** Validates synchronously; returns false (and flashes) if the value is rejected. */
  const commit = (pos: Pos, raw: string): boolean => {
    if (pos.c === SUM && pos.r >= 0) {
      const st = students[pos.r];
      if (!st) return true;
      if (st.status === 'absent') {
        flash(`${st.lastName}, ${st.firstName} fehlt – keine Eingabe möglich.`);
        return false;
      }
      const p = parseTotal(raw);
      if (!p.ok) {
        flash(p.error);
        return false;
      }
      writeTotals([{ studentId: st.id, qp: p.qp }]);
      return true;
    }
    if (errorGrading && pos.c === ERR && pos.r >= 0) {
      const st = students[pos.r];
      if (!st) return true;
      if (st.status === 'absent') {
        flash(`${st.lastName}, ${st.firstName} fehlt – keine Eingabe möglich.`);
        return false;
      }
      const p = parseErrors(raw);
      if (!p.ok) {
        flash(p.error);
        return false;
      }
      writeErrors([{ studentId: st.id, halfErrors: p.halfErrors }]);
      return true;
    }
    const t = tasks[pos.c];
    if (!t) return true;
    if (pos.r === LABEL_ROW) {
      const l = raw.trim();
      if (!l) {
        flash('Die Aufgabenbezeichnung darf nicht leer sein.');
        return false;
      }
      if (l.length > 20) {
        flash('Die Bezeichnung darf höchstens 20 Zeichen lang sein.');
        return false;
      }
      if (l === t.label) return true;
      pushUndo(examId, { kind: 'task-update', taskId: t.id, before: { label: t.label, maxQp: t.maxQp }, after: { label: l, maxQp: t.maxQp } });
      void examWrite(call('tasks.update', { id: t.id, label: l }));
      return true;
    }
    if (pos.r === MAX_ROW) {
      if (raw.trim() === '') {
        flash(`Aufgabe ${t.label}: Bitte die Höchstpunktzahl eingeben.`);
        return false;
      }
      const p = parsePoints(raw, { stepQp: step, positive: true });
      if (!p.ok) {
        flash(`Aufgabe ${t.label}: ${p.error}`);
        return false;
      }
      const m = p.qp as number;
      if (m === t.maxQp) return true;
      const over = students.find((_, r) => (valueAt(r, pos.c) ?? 0) > m);
      if (over) {
        flash(`Aufgabe ${t.label}: ${over.lastName}, ${over.firstName} hat bereits mehr als ${formatQp(m)} Punkte.`);
        return false;
      }
      pushUndo(examId, { kind: 'task-update', taskId: t.id, before: { label: t.label, maxQp: t.maxQp }, after: { label: t.label, maxQp: m } });
      void examWrite(call('tasks.update', { id: t.id, maxQp: m }));
      return true;
    }
    const st = students[pos.r];
    if (!st) return true;
    if (st.status === 'absent') {
      flash(`${st.lastName}, ${st.firstName} fehlt – keine Eingabe möglich.`);
      return false;
    }
    if (isOverride(pos.r)) {
      flash(lockedMsg(pos.r));
      return false;
    }
    const p = parsePoints(raw, { stepQp: step, maxQp: t.maxQp, label: t.label });
    if (!p.ok) {
      flash(p.error);
      return false;
    }
    writeScores([{ taskId: t.id, studentId: st.id, qp: p.qp }]);
    return true;
  };

  // ───── navigation ─────
  const clampPos = (r: number, c: number): Pos => {
    const rr = Math.min(Math.max(r, LABEL_ROW), nR - 1);
    // The sum and error columns exist only in student rows.
    return { r: rr, c: Math.min(Math.max(c, 0), rr >= 0 ? LAST : nT - 1) };
  };
  const moveTo = (p: Pos, extend = false): void => {
    active.current = true;
    if (extend && p.r >= 0) setAnchor((a) => a ?? focus);
    else setAnchor(null);
    setFocus(p);
  };
  const moveBy = (dr: number, dc: number, extend = false): void => moveTo(clampPos(focus.r + dr, focus.c + dc), extend);
  const enterStep = (shift: boolean): [number, number] => {
    const d = shift ? -1 : 1;
    return enterDir === 'down' ? [d, 0] : [0, d];
  };

  const startEdit = (pos: Pos, value: string | null, mode: EditState['mode']): void => {
    if (totalOnly && pos.r === LABEL_ROW) {
      // The single points column of a total-only exam has no editable label.
      active.current = true;
      setFocus(pos);
      return;
    }
    if (isAbsent(pos.r)) {
      const st = students[pos.r];
      flash(`${st?.lastName}, ${st?.firstName} fehlt – keine Eingabe möglich.`);
      return;
    }
    if (pos.c < SUM && isOverride(pos.r)) {
      active.current = true;
      setFocus(pos);
      flash(lockedMsg(pos.r));
      return;
    }
    active.current = true;
    closing.current = false;
    setAnchor(null);
    setFocus(pos);
    setEdit({ ...pos, value: value ?? textAt(pos.r, pos.c), mode });
  };

  const selection = rectOf(anchor, focus);
  const inSel = (r: number, c: number): boolean =>
    r >= 0 && anchor !== null && r >= selection.r0 && r <= selection.r1 && c >= selection.c0 && c <= selection.c1;

  // ───── clipboard ─────
  const copy = (): void => {
    if (focus.r < 0) {
      void call('clipboard.write', { text: textAt(focus.r, focus.c) });
      return;
    }
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const cells: string[] = [];
      for (let c = selection.c0; c <= selection.c1; c++) cells.push(textAt(r, c));
      lines.push(cells.join('\t'));
    }
    void call('clipboard.write', { text: lines.join('\r\n') });
    flash(`${(selection.r1 - selection.r0 + 1) * (selection.c1 - selection.c0 + 1)} Zellen kopiert`, 'info');
  };

  const paste = async (): Promise<void> => {
    if (focus.r < 0) {
      flash('Einfügen ist nur in Punktezellen möglich.');
      return;
    }
    const text = await call('clipboard.read');
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return;
    const top = anchor ? selection.r0 : focus.r;
    const left = anchor ? selection.c0 : focus.c;
    if (errorGrading && left === ERR) {
      // A column of error counts pasted into the error column.
      const errs: ErrorChange[] = [];
      for (let i = 0; i < lines.length; i++) {
        const st = students[top + i];
        if (!st) {
          flash('Der eingefügte Bereich ist größer als die Tabelle. Nichts wurde übernommen.');
          return;
        }
        if (st.status === 'absent') {
          flash(`${st.lastName}, ${st.firstName} fehlt – nichts wurde übernommen.`);
          return;
        }
        const p = parseErrors((lines[i] as string).split('\t')[0] as string);
        if (!p.ok) {
          flash(`Zeile ${st.nr}, ${p.error} – nichts wurde übernommen.`);
          return;
        }
        errs.push({ studentId: st.id, halfErrors: p.halfErrors });
      }
      writeErrors(errs);
      return;
    }
    if (left === SUM) {
      // A column of totals (e.g. copied from Excel) pasted into the sum column.
      const totals: TotalChange[] = [];
      for (let i = 0; i < lines.length; i++) {
        const st = students[top + i];
        if (!st) {
          flash('Der eingefügte Bereich ist größer als die Tabelle. Nichts wurde übernommen.');
          return;
        }
        if (st.status === 'absent') {
          flash(`${st.lastName}, ${st.firstName} fehlt – nichts wurde übernommen.`);
          return;
        }
        const p = parseTotal((lines[i] as string).split('\t')[0] as string);
        if (!p.ok) {
          flash(`Zeile ${st.nr}, ${p.error} – nichts wurde übernommen.`);
          return;
        }
        totals.push({ studentId: st.id, qp: p.qp });
      }
      writeTotals(totals);
      return;
    }
    const changes: ScoreChange[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = (lines[i] as string).split('\t');
      for (let j = 0; j < cells.length; j++) {
        const r = top + i;
        const c = left + j;
        const st = students[r];
        const t = tasks[c];
        if (!st || !t) {
          flash('Der eingefügte Bereich ist größer als die Tabelle. Nichts wurde übernommen.');
          return;
        }
        if (st.status === 'absent') {
          flash(`${st.lastName}, ${st.firstName} fehlt – nichts wurde übernommen.`);
          return;
        }
        if (isOverride(r)) {
          flash(`${lockedMsg(r)} Nichts wurde übernommen.`);
          return;
        }
        const p = parsePoints(cells[j] as string, { stepQp: step, maxQp: t.maxQp });
        if (!p.ok) {
          flash(`Zeile ${st.nr}, Aufgabe ${t.label}: ${p.error} – nichts wurde übernommen.`);
          return;
        }
        changes.push({ taskId: t.id, studentId: st.id, qp: p.qp });
      }
    }
    writeScores(changes);
    const maxCols = Math.max(...lines.map((l) => l.split('\t').length));
    setAnchor({ r: top, c: left });
    setFocus({ r: top + lines.length - 1, c: left + maxCols - 1 });
  };

  const clearSelection = (): void => {
    if (focus.r < 0) return;
    const changes: ScoreChange[] = [];
    const totals: TotalChange[] = [];
    const errs: ErrorChange[] = [];
    const spans = (c: number): boolean => selection.c0 <= c && selection.c1 >= c;
    for (let r = selection.r0; r <= selection.r1; r++) {
      const st = students[r];
      if (!st || st.status === 'absent') continue;
      if (errorGrading && spans(ERR) && errorsAt(r) !== null) errs.push({ studentId: st.id, halfErrors: null });
      if (spans(SUM) && totalAt(r) !== null) totals.push({ studentId: st.id, qp: null });
      if (isOverride(r)) continue; // task cells are locked while a sum is entered
      for (let c = selection.c0; c <= Math.min(selection.c1, nT - 1); c++) {
        const t = tasks[c];
        if (t && valueAt(r, c) !== null) changes.push({ taskId: t.id, studentId: st.id, qp: null });
      }
    }
    if (errs.length) writeErrors(errs);
    if (totals.length) writeTotals(totals);
    else if (changes.length) writeScores(changes);
  };

  // ───── task operations ─────
  const addTask = async (position: number): Promise<void> => {
    const r = await examWrite(call('tasks.add', { examId, position }).then((x) => {
      pushUndo(examId, { kind: 'task-add', taskId: x.taskId, snapshot: null });
      return x.data;
    }));
    if (r) {
      active.current = true;
      setFocus({ r: LABEL_ROW, c: position });
    }
  };
  const moveTask = (c: number, to: number): void => {
    const t = tasks[c];
    if (!t || to < 0 || to >= nT) return;
    pushUndo(examId, { kind: 'task-move', taskId: t.id, from: c, to });
    void examWrite(call('tasks.move', { id: t.id, position: to }));
    setFocus((f) => ({ ...f, c: to }));
  };
  const deleteTask = async (c: number): Promise<void> => {
    const t = tasks[c];
    if (!t) return;
    const snapshot = await call('tasks.snapshot', { id: t.id });
    const data = await examWrite(call('tasks.delete', { id: t.id }));
    if (data) pushUndo(examId, { kind: 'task-delete', taskId: t.id, snapshot });
  };
  const requestDeleteTask = (c: number): void => {
    const t = tasks[c];
    if (!t) return;
    if (nT <= 1) {
      flash('Eine Prüfung braucht mindestens eine Aufgabe.');
      return;
    }
    const entries = exam.scores.filter((x) => x.taskId === t.id).length;
    if (entries > 0) setConfirmDel({ c, entries });
    else void deleteTask(c);
  };

  const taskMenuItems = (c: number): MenuItem[] => [
    { label: 'Links einfügen', icon: 'add', onSelect: () => void addTask(c) },
    { label: 'Rechts einfügen', icon: 'add', onSelect: () => void addTask(c + 1) },
    { label: 'Nach links', icon: 'chevronRight', disabled: c === 0, onSelect: () => moveTask(c, c - 1), separatorBefore: true },
    { label: 'Nach rechts', icon: 'chevronRight', disabled: c === nT - 1, onSelect: () => moveTask(c, c + 1) },
    { label: 'Löschen', icon: 'delete', danger: true, disabled: nT <= 1, onSelect: () => requestDeleteTask(c), separatorBefore: true },
  ];

  const rowMenuItems = (r: number): MenuItem[] => {
    const st = students[r];
    if (!st) return [];
    const setStatus = (status: 'present' | 'absent'): void => {
      void examWrite(call('participation.set', { examId, studentId: st.id, status }));
    };
    return [
      { label: 'Teilgenommen', disabled: st.status === 'present', onSelect: () => setStatus('present') },
      { label: 'Fehlt', disabled: st.status === 'absent', onSelect: () => setStatus('absent') },
    ];
  };

  // ───── keyboard ─────
  const onGridKey = (e: React.KeyboardEvent): void => {
    if (edit || taskMenu || rowMenu) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    active.current = true;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'c') {
        e.preventDefault();
        copy();
      } else if (lk === 'v') {
        e.preventDefault();
        void paste();
      } else if (lk === 'a') {
        e.preventDefault();
        if (nR > 0) {
          setAnchor({ r: 0, c: 0 });
          setFocus({ r: nR - 1, c: nT - 1 });
        }
      }
      return;
    }
    switch (k) {
      case 'ArrowUp':
        e.preventDefault();
        return moveBy(-1, 0, e.shiftKey);
      case 'ArrowDown':
        e.preventDefault();
        return moveBy(1, 0, e.shiftKey);
      case 'ArrowLeft':
        e.preventDefault();
        return moveBy(0, -1, e.shiftKey);
      case 'ArrowRight':
        e.preventDefault();
        return moveBy(0, 1, e.shiftKey);
      case 'Home':
        e.preventDefault();
        return moveTo({ r: focus.r, c: 0 }, e.shiftKey);
      case 'End':
        e.preventDefault();
        return moveTo({ r: focus.r, c: nT - 1 }, e.shiftKey);
      case 'PageDown':
        e.preventDefault();
        return moveBy(10, 0, e.shiftKey);
      case 'PageUp':
        e.preventDefault();
        return moveBy(-10, 0, e.shiftKey);
      case 'Tab':
        e.preventDefault();
        return moveBy(0, e.shiftKey ? -1 : 1);
      case 'Enter': {
        e.preventDefault();
        const [dr, dc] = enterStep(e.shiftKey);
        return moveBy(dr, dc);
      }
      case 'F2':
        e.preventDefault();
        return startEdit(focus, null, 'edit');
      case 'Delete':
        e.preventDefault();
        return clearSelection();
      case 'Backspace':
        e.preventDefault();
        if (focus.r >= 0) return startEdit(focus, '', 'overwrite');
        return;
      case 'Escape':
        setAnchor(null);
        return;
      case 'ContextMenu':
      case 'F10':
        if (k === 'F10' && !e.shiftKey) return;
        if (focus.r >= 0) {
          e.preventDefault();
          const el = document.getElementById(`nr-${focus.r}`);
          if (el) setRowMenu({ r: focus.r, el });
        } else if (!totalOnly) {
          e.preventDefault();
          const el = document.getElementById(`more-${focus.c}`);
          if (el) setTaskMenu({ c: focus.c, el });
        }
        return;
      default:
        if (k.length === 1 && !e.altKey && k !== ' ') {
          e.preventDefault();
          startEdit(focus, k, 'overwrite');
        }
    }
  };

  const onEditKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!edit) return;
    e.stopPropagation();
    const k = e.key;
    const pos = { r: edit.r, c: edit.c };
    const finish = (dr: number, dc: number): void => {
      e.preventDefault();
      closing.current = true;
      const ok = commit(pos, e.currentTarget.value);
      active.current = true;
      setEdit(null);
      if (ok) setFocus(clampPos(pos.r + dr, pos.c + dc));
    };
    if (k === 'Enter') {
      const [dr, dc] = enterStep(e.shiftKey);
      finish(dr, dc);
    } else if (k === 'Tab') finish(0, e.shiftKey ? -1 : 1);
    else if (k === 'Escape') {
      e.preventDefault();
      closing.current = true;
      active.current = true;
      setEdit(null);
    } else if (edit.mode === 'overwrite' || k === 'ArrowUp' || k === 'ArrowDown') {
      if (k === 'ArrowUp') finish(-1, 0);
      else if (k === 'ArrowDown') finish(1, 0);
      else if (k === 'ArrowLeft' && edit.mode === 'overwrite') finish(0, -1);
      else if (k === 'ArrowRight' && edit.mode === 'overwrite') finish(0, 1);
    }
  };

  const onEditBlur = (e: React.FocusEvent<HTMLInputElement>): void => {
    if (!edit || closing.current) return;
    closing.current = true;
    const pos = { r: edit.r, c: edit.c };
    commit(pos, e.currentTarget.value);
    setEdit(null);
  };

  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number): void => {
    if (e.button !== 0) return;
    if (edit && edit.r === r && edit.c === c) return;
    active.current = true;
    if (e.shiftKey && r >= 0) {
      setAnchor((a) => a ?? focus);
      setFocus({ r, c });
      return;
    }
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      e.preventDefault();
      startEdit({ r, c }, null, 'edit');
      return;
    }
    setAnchor(r >= 0 ? { r, c } : null);
    setFocus({ r, c });
  };
  const onCellPointerEnter = (e: React.PointerEvent, r: number, c: number): void => {
    if (e.pointerType === 'mouse' && e.buttons === 1 && anchor && r >= 0 && !edit) setFocus({ r, c });
  };
  const onScrollerBlur = (e: React.FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (next && !scroller.current?.contains(next)) active.current = false;
  };

  // ───── rendering ─────
  const renderTaskCell = (r: number, c: number, extraClass?: string): React.JSX.Element => {
    const focused = focus.r === r && focus.c === c;
    const editing = edit && edit.r === r && edit.c === c;
    const t = tasks[c] as (typeof tasks)[number];
    const common = {
      id: idOf(r, c),
      tabIndex: focused ? 0 : -1,
      'data-r': r,
      'data-c': c,
      onPointerDown: (e: React.PointerEvent) => onCellPointerDown(e, r, c),
      onPointerEnter: (e: React.PointerEvent) => onCellPointerEnter(e, r, c),
      onDoubleClick: () => startEdit({ r, c }, null, 'edit'),
    };
    const input = editing ? (
      <input
        ref={inputRef}
        className={cx(s.editInput, r === LABEL_ROW && s.left)}
        defaultValue={edit.value}
        inputMode={r === LABEL_ROW ? 'text' : 'decimal'}
        aria-label={r === LABEL_ROW ? `Bezeichnung Aufgabe ${t.label}` : r === MAX_ROW ? `Höchstpunkte Aufgabe ${t.label}` : `Punkte Aufgabe ${t.label}`}
        spellCheck={false}
        autoComplete="off"
        onKeyDown={onEditKey}
        onBlur={onEditBlur}
      />
    ) : null;
    if (r < 0) {
      const colActive = focus.c === c;
      return (
        <th
          key={t.id}
          scope="col"
          role="columnheader"
          aria-label={r === LABEL_ROW ? `Aufgabe ${t.label}` : `Höchstpunkte ${textAt(r, c)}`}
          className={cx(s.headCell, focused && !editing && s.cell, focused && !editing && s.focused, colActive && (r === LABEL_ROW ? s.headActive : s.thead2Active), extraClass)}
          style={{ width: taskW }}
          {...common}
        >
          {r === LABEL_ROW && !totalOnly && (
            <button
              type="button"
              id={`more-${c}`}
              className={s.moreBtn}
              tabIndex={-1}
              title={`Aufgabe ${t.label}: Aktionen`}
              aria-label={`Aufgabe ${t.label}: Aktionen`}
              aria-haspopup="menu"
              aria-expanded={taskMenu?.c === c}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => setTaskMenu(taskMenu?.c === c ? null : { c, el: e.currentTarget })}
            >
              <Icon name="more" />
            </button>
          )}
          <span className={s.headLabel}>{textAt(r, c)}</span>
          {input}
        </th>
      );
    }
    const v = valueAt(r, c);
    const locked = isOverride(r);
    return (
      <td
        key={t.id}
        role="gridcell"
        aria-selected={inSel(r, c) || focused}
        aria-readonly={locked || undefined}
        title={locked ? 'Summe direkt eingetragen – diese Aufgabe wird nicht gewertet. Summe leeren, um die Aufgaben zu bearbeiten.' : undefined}
        className={cx(s.cell, s.editable, totalOnly && s.sum, locked && s.locked, focused && !editing && s.focused, inSel(r, c) && !focused && s.selected, extraClass)}
        {...common}
      >
        {v === null ? '' : formatQp(v)}
        {input}
      </td>
    );
  };

  type RightKey = (typeof rightCols.cols)[number]['key'];
  /** Error grading: a strong line before the errors and before the exam grade separates points | errors | result. */
  const groupCls = (key: RightKey): string => cx(errorGrading && (key === 'err' || key === 'res') && s.groupStart);
  const resultHeaders = (row: 1 | 2): React.JSX.Element[] =>
    rightCols.cols.map((col, i) => {
      const cls = cx(s.stickyR, i === 0 && s.firstRight, groupCls(col.key), (col.key === 'err' || col.key === 'eres') && s.errHead);
      const style = { ...stR(col.key), width: col.w };
      if (row === 1) {
        const label = {
          sum: 'Summe',
          pres: 'Note P.',
          err: 'Fehler',
          eres: 'Note F.',
          res: np ? 'NP' : 'Note',
          verbal: '',
          eq: 'Note',
        }[col.key];
        const tip = {
          pres: 'Note aus den Punkten',
          err: 'Anzahl der Fehler (halbe Fehler möglich, z. B. 3,5)',
          eres: 'Note aus den Fehlern',
          res: errorGrading ? 'Note der Prüfung aus Punkten und Fehlern' : undefined,
        }[col.key as string];
        return (
          <th key={col.key} scope="col" className={cx(cls, col.key !== 'verbal' && s.rowLabel)} style={style} title={tip}>
            {label}
          </th>
        );
      }
      return (
        <th
          key={col.key}
          scope="col"
          className={cx(cls, s.rowLabel)}
          style={style}
          id={col.key === 'sum' ? 'total-max' : undefined}
          title={col.key === 'res' && errorGrading ? 'Gewichtung Punkte : Fehler (im Fach unter „Gewichtung“)' : undefined}
        >
          {col.key === 'sum' ? formatQp(model.maxQp) : ''}
          {col.key === 'res' && errorGrading ? `${formatWeight(exam.course.pointsWeightC)} : ${formatWeight(exam.course.errorsWeightC)}` : ''}
        </th>
      );
    });

  const st = model.stats;

  return (
    <div
      ref={scroller}
      className={s.scroller}
      onKeyDown={onGridKey}
      onBlur={onScrollerBlur}
      style={{ scrollPaddingLeft: leftW, scrollPaddingRight: rightCols.total, scrollPaddingTop: 0, scrollPaddingBottom: 0 }}
      data-testid="grid-scroller"
    >
      <table
        className={s.table}
        role="grid"
        aria-label="Punktetabelle"
        aria-rowcount={nR + 4}
        aria-colcount={3 + nT + rightCols.cols.length}
        style={{ width: leftW + nT * taskW + addW + rightCols.total }}
      >
        <colgroup>
          <col style={{ width: W.nr }} />
          <col style={{ width: W.name }} />
          <col style={{ width: W.first }} />
          {tasks.map((t) => (
            <col key={t.id} style={{ width: taskW }} />
          ))}
          {!totalOnly && <col style={{ width: W.add }} />}
          {rightCols.cols.map((c) => (
            <col key={c.key} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr role="row">
            <th colSpan={3} scope="row" className={cx(s.stickyL, s.lastLeft, s.rowLabel)} style={stL(0)}>
              {totalOnly ? '' : 'Aufgabe'}
            </th>
            {tasks.map((_, c) => renderTaskCell(LABEL_ROW, c))}
            {!totalOnly && (
            <th rowSpan={2} className={s.addCol}>
              <button
                type="button"
                className={s.addBtn}
                title="Aufgabe hinzufügen"
                aria-label="Aufgabe hinzufügen"
                onClick={() => void addTask(nT)}
              >
                <Icon name="add" />
              </button>
            </th>
            )}
            {resultHeaders(1)}
          </tr>
          <tr role="row">
            <th colSpan={3} scope="row" className={cx(s.stickyL, s.lastLeft, s.rowLabel)} style={stL(0)}>
              max. Punkte
            </th>
            {tasks.map((_, c) => renderTaskCell(MAX_ROW, c))}
            {resultHeaders(2)}
          </tr>
        </thead>
        <tbody>
          {students.map((stu, r) => {
            const rr = st.rows[r];
            const absent = stu.status === 'absent';
            const rowActive = focus.r === r;
            // With error grading the points can be complete before the errors are entered.
            const partial = rr && rr.sumQp !== null && rr.missingCount > 0;
            const low = rr?.low;
            return (
              <tr key={stu.id} role="row" className={cx(absent && s.absent, rowActive && s.rowActive)} data-student={stu.id}>
                <td className={cx(s.stickyL, s.nr)} style={stL(0)} role="rowheader">
                  <button
                    type="button"
                    id={`nr-${r}`}
                    className={s.nrBtn}
                    tabIndex={-1}
                    title={absent ? 'Fehlt – Status ändern' : 'Status ändern (Teilgenommen / Fehlt)'}
                    aria-label={`Nr. ${stu.nr}, Status: ${absent ? 'fehlt' : 'teilgenommen'}`}
                    aria-haspopup="menu"
                    onClick={(e) => setRowMenu(rowMenu?.r === r ? null : { r, el: e.currentTarget })}
                  >
                    {absent && <span className={s.absentTag}>fehlt</span>}
                    {stu.nr}
                  </button>
                </td>
                <td className={cx(s.stickyL, s.name)} style={stL(W.nr)} title={stu.lastName}>
                  {stu.lastName}
                </td>
                <td className={cx(s.stickyL, s.name, s.lastLeft)} style={stL(W.nr + W.name)} title={stu.firstName}>
                  {stu.firstName}
                </td>
                {tasks.map((_, c) => renderTaskCell(r, c))}
                {!totalOnly && <td className={s.emptyCol} />}
                {rightCols.cols.map((col, i) => {
                  const cls = cx(s.stickyR, i === 0 && s.firstRight, groupCls(col.key));
                  const style = stR(col.key);
                  if (col.key === 'sum') {
                    const focused = focus.r === r && focus.c === SUM;
                    const editing = edit && edit.r === r && edit.c === SUM;
                    const override = rr?.override;
                    return (
                      <td
                        key="sum"
                        id={`sum-${r}`}
                        role="gridcell"
                        tabIndex={focused ? 0 : -1}
                        aria-selected={inSel(r, SUM) || focused}
                        aria-label={override ? `Summe direkt eingetragen: ${sumText(model, r)}` : undefined}
                        className={cx(
                          cls,
                          s.sum,
                          s.sumCell,
                          s.editable,
                          override && s.sumOverride,
                          partial && s.partial,
                          focused && !editing && s.focused,
                          inSel(r, SUM) && !focused && s.selected,
                        )}
                        style={style}
                        title={
                          override
                            ? 'Summe direkt eingetragen (Aufgaben werden nicht gewertet). Zum Bearbeiten der Aufgaben die Summe leeren (Entf).'
                            : partial
                              ? `Unvollständig: ${rr.missingCount} von ${nT} Aufgaben ohne Eintrag`
                              : 'Summe – hier kann die Gesamtpunktzahl auch direkt eingetragen werden'
                        }
                        onPointerDown={(e) => onCellPointerDown(e, r, SUM)}
                        onPointerEnter={(e) => onCellPointerEnter(e, r, SUM)}
                        onDoubleClick={() => startEdit({ r, c: SUM }, null, 'edit')}
                      >
                        {sumText(model, r)}
                        {editing && (
                          <input
                            ref={inputRef}
                            className={s.editInput}
                            defaultValue={edit.value}
                            inputMode="decimal"
                            aria-label={`Summe von ${stu.lastName}, ${stu.firstName}`}
                            spellCheck={false}
                            autoComplete="off"
                            onKeyDown={onEditKey}
                            onBlur={onEditBlur}
                          />
                        )}
                      </td>
                    );
                  }
                  if (col.key === 'err') {
                    const focused = focus.r === r && focus.c === ERR;
                    const editing = edit && edit.r === r && edit.c === ERR;
                    return (
                      <td
                        key="err"
                        id={`err-${r}`}
                        role="gridcell"
                        tabIndex={focused ? 0 : -1}
                        aria-selected={inSel(r, ERR) || focused}
                        className={cx(cls, s.sum, s.sumCell, s.editable, focused && !editing && s.focused, inSel(r, ERR) && !focused && s.selected)}
                        style={style}
                        title="Anzahl der Fehler"
                        onPointerDown={(e) => onCellPointerDown(e, r, ERR)}
                        onPointerEnter={(e) => onCellPointerEnter(e, r, ERR)}
                        onDoubleClick={() => startEdit({ r, c: ERR }, null, 'edit')}
                      >
                        {errorsText(model, r)}
                        {editing && (
                          <input
                            ref={inputRef}
                            className={s.editInput}
                            defaultValue={edit.value}
                            inputMode="decimal"
                            aria-label={`Fehler von ${stu.lastName}, ${stu.firstName}`}
                            spellCheck={false}
                            autoComplete="off"
                            onKeyDown={onEditKey}
                            onBlur={onEditBlur}
                          />
                        )}
                      </td>
                    );
                  }
                  if (col.key === 'pres' || col.key === 'eres') {
                    const g = col.key === 'pres' ? rr?.pointsGrade10 : rr?.errorsGrade10;
                    return (
                      <td key={col.key} id={`${col.key}-${r}`} className={cx(cls, s.result, s.computed, g != null && linIsLow(g) && s.low)} style={style}>
                        {partText(model, r, col.key === 'pres' ? 'points' : 'errors')}
                      </td>
                    );
                  }
                  if (col.key === 'res') {
                    return (
                      <td key="res" id={`res-${r}`} className={cx(cls, s.result, s.computed, low && s.low)} style={style}>
                        {resultText(model, r)}
                      </td>
                    );
                  }
                  if (col.key === 'verbal') {
                    return (
                      <td key="verbal" id={`verbal-${r}`} className={cx(cls, s.verbal, s.computed, low && s.low)} style={style}>
                        {rr?.participant && rr.group ? VERBAL[rr.group - 1] : absent ? '–' : ''}
                      </td>
                    );
                  }
                  return (
                    <td key="eq" id={`eq-${r}`} className={cx(cls, s.result, s.computed, low && s.low)} style={style}>
                      {rr?.participant ? rr.group : absent ? '–' : ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr role="row">
            <th colSpan={3} scope="row" className={cx(s.stickyL, s.lastLeft)} style={stL(0)}>
              Durchschnitt
            </th>
            {tasks.map((t, c) => (
              <td key={t.id} id={`avg-${c}`} className="num">
                {st.taskAvgTenths[c] === null || st.taskAvgTenths[c] === undefined ? '' : formatTenths(st.taskAvgTenths[c] as number)}
              </td>
            ))}
            {!totalOnly && <td />}
            {rightCols.cols.map((col, i) => (
              <td
                key={col.key}
                id={col.key === 'sum' ? 'avg-sum' : col.key === 'res' ? 'avg-grade' : col.key === 'pres' || col.key === 'eres' ? `avg-${col.key}` : undefined}
                className={cx(s.stickyR, i === 0 && s.firstRight, groupCls(col.key), 'num', s.result)}
                style={stR(col.key)}
              >
                {col.key === 'sum' && st.sumAvgTenths !== null ? formatTenths(st.sumAvgTenths) : ''}
                {col.key === 'pres' && st.pointsGradeAvgHundredths !== null ? formatHundredths(st.pointsGradeAvgHundredths) : ''}
                {col.key === 'eres' && st.errorsGradeAvgHundredths !== null ? formatHundredths(st.errorsGradeAvgHundredths) : ''}
                {col.key === 'res' && st.gradeAvgHundredths !== null ? formatHundredths(st.gradeAvgHundredths) : ''}
              </td>
            ))}
          </tr>
          <tr role="row">
            <th colSpan={3} scope="row" className={cx(s.stickyL, s.lastLeft)} style={stL(0)}>
              Anteil in %
            </th>
            {tasks.map((t, c) => (
              <td key={t.id} id={`share-${c}`} className="num">
                {st.taskSharePct[c] === null || st.taskSharePct[c] === undefined ? '' : String(st.taskSharePct[c])}
              </td>
            ))}
            {!totalOnly && <td />}
            {rightCols.cols.map((col, i) => (
              <td key={col.key} className={cx(s.stickyR, i === 0 && s.firstRight, groupCls(col.key))} style={stR(col.key)} />
            ))}
          </tr>
        </tfoot>
      </table>

      {taskMenu && (
        <Menu anchor={taskMenu.el} label={`Aufgabe ${tasks[taskMenu.c]?.label ?? ''}`} items={taskMenuItems(taskMenu.c)} onClose={() => setTaskMenu(null)} />
      )}
      {rowMenu && <Menu anchor={rowMenu.el} label="Status" items={rowMenuItems(rowMenu.r)} onClose={() => setRowMenu(null)} />}
      {confirmDel && (
        <Dialog
          title="Aufgabe löschen"
          onClose={() => setConfirmDel(null)}
          onSubmit={() => {
            const c = confirmDel.c;
            setConfirmDel(null);
            void deleteTask(c);
          }}
          footer={
            <>
              <Button type="submit" variant="danger">
                Aufgabe löschen
              </Button>
              <Button onClick={() => setConfirmDel(null)}>Abbrechen</Button>
            </>
          }
        >
          <p className={s.confirmText}>
            Aufgabe <b>{tasks[confirmDel.c]?.label}</b> enthält {confirmDel.entries === 1 ? '1 Eintrag' : `${confirmDel.entries} Einträge`}. Beim Löschen werden diese
            entfernt. Sie können das mit Strg+Z rückgängig machen.
          </p>
        </Dialog>
      )}
    </div>
  );
}

