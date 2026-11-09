import { useEffect, useMemo, useState } from 'react';
import { buildExamModel, resultText, sumText } from '@shared/examModel';
import { fullKey, VERBAL } from '@shared/grading';
import { examHeading } from '@shared/labels';
import { formatDateDe, formatGrade10, formatHundredths, formatPctTenths, formatQp, formatTenths } from '@shared/parse/number';
import type { ExamData, PrintMode, Settings } from '@shared/types';
import { call } from '../api';
import { Chart, KeyFigures, KeyTable } from '../views/keyTables';
import p from './print.module.css';

const ROWS_PER_PAGE = 32;

function Header({ exam, settings, suffix }: { exam: ExamData; settings: Settings; suffix?: string }): React.JSX.Element {
  const e = exam.exam;
  return (
    <div className={p.header}>
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
      {settings.school && <span className={p.school}>{settings.school}</span>}
    </div>
  );
}

function Grid({ exam, from, to, showFooter }: { exam: ExamData; from: number; to: number; showFooter: boolean }): React.JSX.Element {
  const model = useMemo(() => buildExamModel(exam), [exam]);
  const np = exam.exam.scheme === 'NP15';
  const st = model.stats;
  return (
    <table className={p.grid}>
      <colgroup>
        <col className={p.cNr} />
        <col className={p.cName} />
        <col className={p.cFirst} />
        {exam.tasks.map((t) => (
          <col key={t.id} />
        ))}
        <col className={p.cSum} />
        <col className={p.cRes} />
        {!np && <col className={p.cVerbal} />}
      </colgroup>
      <thead>
        <tr>
          <th colSpan={3} className={p.right}>
            Aufgabe
          </th>
          {exam.tasks.map((t) => (
            <th key={t.id} className={p.right}>
              {t.label}
            </th>
          ))}
          <th className={p.right}>Summe</th>
          <th className={p.right}>{np ? 'NP' : 'Note'}</th>
          {!np && <th />}
        </tr>
        <tr className={p.maxRow}>
          <th colSpan={3} className={p.right}>
            max. Punkte
          </th>
          {exam.tasks.map((t) => (
            <th key={t.id} className={p.right}>
              {formatQp(t.maxQp)}
            </th>
          ))}
          <th className={p.right}>{formatQp(model.maxQp)}</th>
          <th />
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
              <td className={p.name}>{s.firstName}</td>
              {exam.tasks.map((t, c) => {
                // A directly entered sum replaces the task values: print them blank.
                const v = model.totals[r] !== null ? null : (model.values[r]?.[c] ?? null);
                return (
                  <td key={t.id} className={p.right}>
                    {v === null ? '' : formatQp(v)}
                  </td>
                );
              })}
              <td className={`${p.right} ${p.bold}`}>{absent ? 'fehlt' : sumText(model, r)}</td>
              <td className={`${p.right} ${p.bold} ${rr?.low ? p.low : ''}`}>{resultText(model, r)}</td>
              {!np && <td>{rr?.participant && rr.group ? VERBAL[rr.group - 1] : ''}</td>}
            </tr>
          );
        })}
      </tbody>
      {showFooter && (
        <tfoot>
          <tr>
            <th colSpan={3} className={p.right}>
              Durchschnitt
            </th>
            {exam.tasks.map((t, c) => (
              <td key={t.id} className={p.right}>
                {st.taskAvgTenths[c] == null ? '' : formatTenths(st.taskAvgTenths[c] as number)}
              </td>
            ))}
            <td className={`${p.right} ${p.bold}`}>{st.sumAvgTenths === null ? '' : formatTenths(st.sumAvgTenths)}</td>
            <td className={`${p.right} ${p.bold}`}>{st.gradeAvgHundredths === null ? '' : formatHundredths(st.gradeAvgHundredths)}</td>
            {!np && <td />}
          </tr>
          <tr>
            <th colSpan={3} className={p.right}>
              Anteil in %
            </th>
            {exam.tasks.map((t, c) => (
              <td key={t.id} className={p.right}>
                {st.taskSharePct[c] == null ? '' : st.taskSharePct[c]}
              </td>
            ))}
            <td />
            <td />
            {!np && <td />}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function SidePanel({ exam }: { exam: ExamData }): React.JSX.Element {
  const stats = useMemo(() => buildExamModel(exam).stats, [exam]);
  return (
    <div className={p.side}>
      <div className={p.sideTitle}>{exam.exam.scheme === 'NP15' ? 'Notenpunkte' : 'Notenschlüssel'}</div>
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
          <th>Vorname</th>
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
              <td className={p.name}>{s.firstName}</td>
              <td className={`${p.right} ${p.bold} ${rr?.low ? p.low : ''}`}>{s.status === 'absent' ? 'fehlt' : resultText(model, r)}</td>
              <td>{rr?.participant && rr.group ? (np ? `${rr.group} (${VERBAL[rr.group - 1]})` : VERBAL[rr.group - 1]) : ''}</td>
            </tr>
          );
        })}
      </tbody>
      {showFooter && (
        <tfoot>
          <tr>
            <th colSpan={3} className={p.right}>
              Durchschnitt
            </th>
            <td className={`${p.right} ${p.bold}`}>{model.stats.gradeAvgHundredths === null ? '' : formatHundredths(model.stats.gradeAvgHundredths)}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function ExamPages({ exam, settings }: { exam: ExamData; settings: Settings }): React.JSX.Element {
  const n = exam.students.length;
  const chunks: [number, number][] = [];
  for (let i = 0; i < Math.max(n, 1); i += ROWS_PER_PAGE) chunks.push([i, Math.min(n, i + ROWS_PER_PAGE)]);
  const wide = exam.tasks.length > 22;
  return (
    <>
      {chunks.map(([a, b], i) => (
        <section key={a} className={p.page}>
          <Header exam={exam} settings={settings} suffix={i > 0 ? `Seite ${i + 1}` : undefined} />
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
          <Header exam={exam} settings={settings} suffix="Auswertung" />
          <SidePanel exam={exam} />
        </section>
      )}
    </>
  );
}

function SpiegelPage({ exam, settings }: { exam: ExamData; settings: Settings }): React.JSX.Element {
  const stats = useMemo(() => buildExamModel(exam).stats, [exam]);
  const np = exam.exam.scheme === 'NP15';
  const cols = np ? Array.from({ length: 16 }, (_, i) => 15 - i) : [1, 2, 3, 4, 5, 6];
  return (
    <section className={p.page}>
      <Header exam={exam} settings={settings} suffix="Notenspiegel" />
      <table className={`${p.grid} ${p.spiegel}`}>
        <thead>
          <tr>
            <th className={`${p.right} ${p.spiegelHead}`}>{np ? 'Notenpunkte' : 'Note'}</th>
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
          <dd>{stats.gradeAvgHundredths === null ? '–' : formatHundredths(stats.gradeAvgHundredths)}</dd>
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

function KeyPages({ exam, settings }: { exam: ExamData; settings: Settings }): React.JSX.Element {
  const max = exam.tasks.reduce((a, t) => a + t.maxQp, 0);
  const rows = fullKey(exam.exam.scheme, max, exam.exam.stepQp).reverse();
  const np = exam.exam.scheme === 'NP15';
  const perCol = 38;
  const perPage = perCol * 5;
  const pages: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return (
    <>
      {pages.map((pg, i) => (
        <section key={i} className={p.page}>
          <Header exam={exam} settings={settings} suffix={`Notenschlüssel (${formatQp(max)} Punkte)${pages.length > 1 ? `, Seite ${i + 1}` : ''}`} />
          <div className={p.keyCols}>
            {Array.from({ length: Math.ceil(pg.length / perCol) }, (_, c) => (
              <table key={c} className={p.grid}>
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
                      <td className={`${p.right} ${p.bold}`}>{np ? r.grade : formatGrade10(r.grade)}</td>
                      <td>{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function PrintView({ mode, examId }: { mode: PrintMode; examId: number }): React.JSX.Element {
  const [data, setData] = useState<{ exam: ExamData; settings: Settings } | null>(null);
  useEffect(() => {
    void Promise.all([call('exams.get', { id: examId }), call('settings.get')]).then(([exam, settings]) => {
      if (exam) setData({ exam, settings });
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
      {mode === 'exam' && <ExamPages exam={data.exam} settings={data.settings} />}
      {mode === 'spiegel' && <SpiegelPage exam={data.exam} settings={data.settings} />}
      {mode === 'key' && <KeyPages exam={data.exam} settings={data.settings} />}
    </div>
  );
}
