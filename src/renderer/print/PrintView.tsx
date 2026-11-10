import { useEffect, useMemo, useState } from 'react';
import { buildExamModel, errorsText, hasErrorGrading, partText, resultText, sumText } from '@shared/examModel';
import { fullKey, VERBAL } from '@shared/grading';
import { examHeading } from '@shared/labels';
import { formatWeight } from '@shared/overview';
import { formatDateDe, formatGrade10, formatHundredths, formatPctTenths, formatQp, formatTenths, todayIso } from '@shared/parse/number';
import type { ExamData, PrintMode, Settings } from '@shared/types';
import { call } from '../api';
import { Chart, ErrorKeyTable, KeyFigures, KeyTable } from '../views/keyTables';
import p from './print.module.css';

const ROWS_PER_PAGE = 32;

/** Everything a printed page needs besides the exam. */
interface PrintInfo {
  settings: Settings;
  /** "10.11.2026, 14:32 Uhr" — when the printout or PDF was made. */
  created: string;
}

function stamp(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${formatDateDe(todayIso(now))}, ${hh}:${mm} Uhr`;
}

const cls = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

function Header({ exam, info, suffix }: { exam: ExamData; info: PrintInfo; suffix?: string }): React.JSX.Element {
  const e = exam.exam;
  return (
    <div className={p.header}>
      <div className={p.headMain}>
        <span className={p.title}>
          {examHeading(e)}
          {suffix ? ` – ${suffix}` : ''}
        </span>
        <span>
          im Fach: <b>{e.subject}</b>
        </span>
        <span>
          Klasse: <b>{exam.schoolClass.name}</b>
        </span>
        <span>
          Datum: <b>{formatDateDe(e.examDate)}</b>
        </span>
        {e.teacher && (
          <span>
            Lehrkraft: <b>{e.teacher}</b>
          </span>
        )}
      </div>
      <div className={p.headSide}>
        {info.settings.school && <span className={p.school}>{info.settings.school}</span>}
        <span className={p.stamp} data-testid="print-stamp">
          Erstellt am {info.created}
        </span>
      </div>
    </div>
  );
}

function Grid({ exam, from, to, showFooter }: { exam: ExamData; from: number; to: number; showFooter: boolean }): React.JSX.Element {
  const model = useMemo(() => buildExamModel(exam), [exam]);
  const np = exam.exam.scheme === 'NP15';
  const errors = hasErrorGrading(exam);
  /** Only the total per student: no task columns, the sum is the points column. */
  const totalOnly = !exam.exam.perTask;
  const tasks = totalOnly ? [] : exam.tasks;
  const st = model.stats;
  const hundredths = (h: number | null): string => (h === null ? '' : formatHundredths(h));
  // Strong lines: names | tasks | points (sum) | errors | exam grade.
  const sumCls = cls(p.right, !totalOnly && p.groupStart);
  const errCls = cls(p.right, p.groupStart);
  const resCls = cls(p.right, errors && p.groupStart);
  return (
    <table className={p.grid} style={totalOnly ? { width: 'auto' } : undefined}>
      <colgroup>
        <col className={p.cNr} />
        <col className={p.cName} />
        <col className={p.cFirst} />
        {tasks.map((t) => (
          <col key={t.id} />
        ))}
        <col className={p.cSum} />
        {errors && (
          <>
            <col className={p.cPart} />
            <col className={p.cErr} />
            <col className={p.cPart} />
          </>
        )}
        <col className={p.cRes} />
        {!np && <col className={p.cVerbal} />}
      </colgroup>
      <thead>
        <tr>
          <th colSpan={3} className={cls(p.right, p.lastLeft)}>
            {totalOnly ? '' : 'Aufgabe'}
          </th>
          {tasks.map((t) => (
            <th key={t.id} className={p.right}>
              {t.label}
            </th>
          ))}
          <th className={sumCls}>{totalOnly ? 'Punkte' : 'Summe'}</th>
          {errors && (
            <>
              <th className={p.right}>Note P.</th>
              <th className={errCls}>Fehler</th>
              <th className={p.right}>Note F.</th>
            </>
          )}
          <th className={resCls}>{np ? 'NP' : 'Note'}</th>
          {!np && <th />}
        </tr>
        <tr className={p.maxRow}>
          <th colSpan={3} className={cls(p.right, p.lastLeft)}>
            max. Punkte
          </th>
          {tasks.map((t) => (
            <th key={t.id} className={p.right}>
              {formatQp(t.maxQp)}
            </th>
          ))}
          <th className={sumCls}>{formatQp(model.maxQp)}</th>
          {errors && (
            <>
              <th />
              <th className={errCls} />
              <th />
            </>
          )}
          <th className={resCls}>{errors ? `${formatWeight(exam.course.pointsWeightC)} : ${formatWeight(exam.course.errorsWeightC)}` : ''}</th>
          {!np && <th />}
        </tr>
      </thead>
      <tbody>
        {exam.students.slice(from, to).map((s, i) => {
          const r = from + i;
          const rr = st.rows[r];
          const absent = s.status === 'absent';
          return (
            <tr key={s.id} className={absent ? p.absent : undefined}>
              <td className={p.right}>{s.nr}</td>
              <td className={p.name}>{s.lastName}</td>
              <td className={cls(p.name, p.lastLeft)}>{s.firstName}</td>
              {tasks.map((t, c) => {
                // A directly entered sum replaces the task values: print them blank.
                const v = model.totals[r] !== null ? null : (model.values[r]?.[c] ?? null);
                return (
                  <td key={t.id} className={p.right}>
                    {v === null ? '' : formatQp(v)}
                  </td>
                );
              })}
              <td className={cls(sumCls, p.bold)}>{absent ? 'fehlt' : sumText(model, r)}</td>
              {errors && (
                <>
                  <td className={p.right}>{absent ? '' : partText(model, r, 'points')}</td>
                  <td className={errCls}>{absent ? '' : errorsText(model, r)}</td>
                  <td className={p.right}>{absent ? '' : partText(model, r, 'errors')}</td>
                </>
              )}
              <td className={cls(resCls, p.bold, rr?.low && p.low)}>{resultText(model, r)}</td>
              {!np && <td>{rr?.participant && rr.group ? VERBAL[rr.group - 1] : ''}</td>}
            </tr>
          );
        })}
      </tbody>
      {showFooter && (
        <tfoot>
          <tr>
            <th colSpan={3} className={cls(p.right, p.lastLeft)}>
              Durchschnitt
            </th>
            {tasks.map((t, c) => (
              <td key={t.id} className={p.right}>
                {st.taskAvgTenths[c] == null ? '' : formatTenths(st.taskAvgTenths[c] as number)}
              </td>
            ))}
            <td className={cls(sumCls, p.bold)}>{st.sumAvgTenths === null ? '' : formatTenths(st.sumAvgTenths)}</td>
            {errors && (
              <>
                <td className={p.right}>{hundredths(st.pointsGradeAvgHundredths)}</td>
                <td className={errCls} />
                <td className={p.right}>{hundredths(st.errorsGradeAvgHundredths)}</td>
              </>
            )}
            <td className={cls(resCls, p.bold)}>{hundredths(st.gradeAvgHundredths)}</td>
            {!np && <td />}
          </tr>
          {!totalOnly && (
            <tr>
              <th colSpan={3} className={cls(p.right, p.lastLeft)}>
                Anteil in %
              </th>
              {tasks.map((t, c) => (
                <td key={t.id} className={p.right}>
                  {st.taskSharePct[c] == null ? '' : st.taskSharePct[c]}
                </td>
              ))}
              <td className={sumCls} />
              {errors && (
                <>
                  <td />
                  <td className={errCls} />
                  <td />
                </>
              )}
              <td className={resCls} />
              {!np && <td />}
            </tr>
          )}
        </tfoot>
      )}
    </table>
  );
}

function SidePanel({ exam }: { exam: ExamData }): React.JSX.Element {
  const stats = useMemo(() => buildExamModel(exam).stats, [exam]);
  return (
    <div className={p.side}>
      <div className={p.sideTitle}>
        {exam.exam.scheme === 'NP15' ? 'Notenpunkte' : hasErrorGrading(exam) ? 'Notenschlüssel der Punkte' : 'Notenschlüssel'}
      </div>
      {exam.exam.entryMode === 'points' && <KeyTable exam={exam} stats={stats} />}
      <KeyFigures exam={exam} stats={stats} />
      <Chart exam={exam} stats={stats} width={250} mono />
    </div>
  );
}

/** List of directly entered marks (mark-only exams). */
function MarkTable({ exam, from, to, showFooter }: { exam: ExamData; from: number; to: number; showFooter: boolean }): React.JSX.Element {
  const model = useMemo(() => buildExamModel(exam), [exam]);
  const np = exam.exam.scheme === 'NP15';
  return (
    <table className={p.grid} style={{ width: 'auto' }}>
      <colgroup>
        <col className={p.cNr} />
        <col style={{ width: '45mm' }} />
        <col style={{ width: '40mm' }} />
        <col style={{ width: '16mm' }} />
        <col style={{ width: '30mm' }} />
      </colgroup>
      <thead>
        <tr>
          <th className={p.right}>Nr</th>
          <th>Name</th>
          <th className={p.lastLeft}>Vorname</th>
          <th className={p.right}>{np ? 'NP' : 'Note'}</th>
          <th>{np ? 'Note (1–6)' : ''}</th>
        </tr>
      </thead>
      <tbody>
        {exam.students.slice(from, to).map((s, i) => {
          const r = from + i;
          const rr = model.stats.rows[r];
          return (
            <tr key={s.id} className={s.status === 'absent' ? p.absent : undefined}>
              <td className={p.right}>{s.nr}</td>
              <td className={p.name}>{s.lastName}</td>
              <td className={cls(p.name, p.lastLeft)}>{s.firstName}</td>
              <td className={cls(p.right, p.bold, rr?.low && p.low)}>{s.status === 'absent' ? 'fehlt' : resultText(model, r)}</td>
              <td>{rr?.participant && rr.group ? (np ? `${rr.group} (${VERBAL[rr.group - 1]})` : VERBAL[rr.group - 1]) : ''}</td>
            </tr>
          );
        })}
      </tbody>
      {showFooter && (
        <tfoot>
          <tr>
            <th colSpan={3} className={cls(p.right, p.lastLeft)}>
              Durchschnitt
            </th>
            <td className={cls(p.right, p.bold)}>{model.stats.gradeAvgHundredths === null ? '' : formatHundredths(model.stats.gradeAvgHundredths)}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function ExamPages({ exam, info }: { exam: ExamData; info: PrintInfo }): React.JSX.Element {
  const n = exam.students.length;
  const chunks: [number, number][] = [];
  for (let i = 0; i < Math.max(n, 1); i += ROWS_PER_PAGE) chunks.push([i, Math.min(n, i + ROWS_PER_PAGE)]);
  const wide = exam.tasks.length > 22 || (hasErrorGrading(exam) && exam.tasks.length > 16);
  return (
    <>
      {chunks.map(([a, b], i) => (
        <section key={a} className={p.page}>
          <Header exam={exam} info={info} suffix={i > 0 ? `Seite ${i + 1}` : undefined} />
          <div className={p.layout}>
            <div className={p.main}>
              {exam.exam.entryMode === 'grade' ? (
                <MarkTable exam={exam} from={a} to={b} showFooter={i === chunks.length - 1} />
              ) : (
                <Grid exam={exam} from={a} to={b} showFooter={i === chunks.length - 1} />
              )}
            </div>
            {i === 0 && !wide && <SidePanel exam={exam} />}
          </div>
        </section>
      ))}
      {wide && (
        <section className={p.page}>
          <Header exam={exam} info={info} suffix="Auswertung" />
          <SidePanel exam={exam} />
        </section>
      )}
    </>
  );
}

function SpiegelPage({ exam, info }: { exam: ExamData; info: PrintInfo }): React.JSX.Element {
  const stats = useMemo(() => buildExamModel(exam).stats, [exam]);
  const np = exam.exam.scheme === 'NP15';
  const errors = hasErrorGrading(exam);
  const cols = np ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  const avg = (h: number | null): string => (h === null ? '–' : formatHundredths(h));
  return (
    <section className={p.page}>
      <Header exam={exam} info={info} suffix="Notenspiegel" />
      <table className={cls(p.grid, p.spiegel)}>
        <thead>
          <tr>
            <th className={cls(p.right, p.spiegelHead)}>{np ? 'Notenpunkte' : 'Note'}</th>
            {cols.map((c) => (
              <th key={c} className={p.center}>
                {np ? c : `${c} (${VERBAL[c - 1]})`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className={p.right}>Anzahl</th>
            {cols.map((c) => (
              <td key={c} className={p.center}>
                {np ? stats.counts[c] : stats.counts[c - 1]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className={p.spiegelBody}>
        <Chart exam={exam} stats={stats} width={520} mono />
        <dl className={p.facts}>
          <dt>Durchschnitt</dt>
          <dd>{avg(stats.gradeAvgHundredths)}</dd>
          {errors && (
            <>
              <dt>Ø Note Punkte</dt>
              <dd>{avg(stats.pointsGradeAvgHundredths)}</dd>
              <dt>Ø Note Fehler</dt>
              <dd>{avg(stats.errorsGradeAvgHundredths)}</dd>
              <dt>Punkte : Fehler</dt>
              <dd>
                {formatWeight(exam.course.pointsWeightC)} : {formatWeight(exam.course.errorsWeightC)}
              </dd>
            </>
          )}
          <dt>Note 5 und 6</dt>
          <dd>{stats.lowPctTenths === null ? '–' : `${formatPctTenths(stats.lowPctTenths)} %`}</dd>
          <dt>mitgeschrieben</dt>
          <dd>
            {stats.participants} / {stats.listed}
          </dd>
          {np &&
            [1, 2, 3, 4, 5, 6].map((g) => (
              <span key={g} className={p.factPair}>
                <dt>Note {g}</dt>
                <dd>
                  {stats.groupCounts[g - 1]} {stats.groupPctTenths[g - 1] !== null ? `(${formatPctTenths(stats.groupPctTenths[g - 1] as number)} %)` : ''}
                </dd>
              </span>
            ))}
        </dl>
      </div>
    </section>
  );
}

function KeyPages({ exam, info }: { exam: ExamData; info: PrintInfo }): React.JSX.Element {
  const max = exam.tasks.reduce((a, t) => a + t.maxQp, 0);
  const rows = fullKey(exam.exam.scheme, max, exam.exam.stepQp).reverse();
  const np = exam.exam.scheme === 'NP15';
  const errors = hasErrorGrading(exam);
  const perCol = 36;
  // With error grading the error table takes the place of one column on the last page.
  const perPage = perCol * 4;
  const pages: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  if (errors && (pages.at(-1)?.length ?? 0) > perCol * 3) pages.push([]);
  return (
    <>
      {pages.map((pg, i) => (
        <section key={i} className={p.page}>
          <Header
            exam={exam}
            info={info}
            suffix={`${errors ? 'Schlüssel für Punkte' : 'Notenschlüssel'} (${formatQp(max)} Punkte)${errors ? ' und Fehler' : ''}${pages.length > 1 ? `, Seite ${i + 1}` : ''}`}
          />
          <div className={p.keyCols}>
            {Array.from({ length: Math.ceil(pg.length / perCol) }, (_, c) => (
              <table key={c} className={cls(p.grid, p.keyTable)}>
                <colgroup>
                  <col style={{ width: '16mm' }} />
                  <col style={{ width: '12mm' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th className={p.right}>Punkte</th>
                    <th className={p.right}>{np ? 'NP' : 'Note'}</th>
                    <th>{np ? 'Note' : 'Wortnote'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice(c * perCol, (c + 1) * perCol).map((r) => (
                    <tr key={r.qp}>
                      <td className={p.right}>{formatQp(r.qp)}</td>
                      <td className={cls(p.right, p.bold)}>{np ? r.grade : formatGrade10(r.grade)}</td>
                      <td>{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            {errors && i === pages.length - 1 && (
              <div className={p.errorKey}>
                <ErrorKeyTable className={cls(p.grid, p.errorKeyTable)} />
                <p className={p.keyNote}>Je Fehler 0,3 Noten, ab dem 10. Fehler 0,5 Noten; halbe Fehler halb so viel (abgeschnitten).</p>
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

export function PrintView({ mode, examId }: { mode: PrintMode; examId: number }): React.JSX.Element {
  const [data, setData] = useState<{ exam: ExamData; info: PrintInfo } | null>(null);
  useEffect(() => {
    void Promise.all([call('exams.get', { id: examId }), call('settings.get')]).then(([exam, settings]) => {
      if (exam) setData({ exam, info: { settings, created: stamp(new Date()) } });
    });
  }, [examId]);
  useEffect(() => {
    if (!data) return;
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          void call('print.ready');
        }),
      ),
    );
  }, [data]);
  if (!data) return <div />;
  return (
    <div className={p.root}>
      {mode === 'exam' && <ExamPages exam={data.exam} info={data.info} />}
      {mode === 'spiegel' && <SpiegelPage exam={data.exam} info={data.info} />}
      {mode === 'key' && <KeyPages exam={data.exam} info={data.info} />}
    </div>
  );
}
