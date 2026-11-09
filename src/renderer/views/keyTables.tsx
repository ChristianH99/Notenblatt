/** Key table + key figures + chart, shared by the panel and the print view. */
import { bandRange10, linIsLow, linKey, npGroupMembers, npIsLow, npKey } from '@shared/grading';
import type { ExamStats } from '@shared/grading/stats';
import { formatGrade10, formatHundredths, formatPctTenths, formatQp, formatTenths } from '@shared/parse/number';
import type { ExamData } from '@shared/types';
import { DistChart, type Bar } from './DistChart';
import k from './keyTables.module.css';

const pct = (t: number | null | undefined): string => (t === null || t === undefined ? '' : `${formatPctTenths(t)} %`);

export function KeyTable({ exam, stats }: { exam: ExamData; stats: ExamStats }): React.JSX.Element {
  const step = exam.exam.stepQp;
  const max = stats.maxQp;
  if (exam.exam.scheme === 'NP15') {
    const rows = max > 0 ? npKey(max, step) : [];
    return (
      <table className={k.key} aria-label="Notenschlüssel" data-testid="key-table">
        <thead>
          <tr>
            <th className="num">NP</th>
            <th className="num">von</th>
            <th className="num">bis</th>
            <th className="num">Anzahl</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const group = r.np === 0 ? 6 : Math.floor((15 - r.np) / 3) + 1;
            const first = npGroupMembers(group)[0] === r.np;
            const groupEnd = npGroupMembers(group).at(-1) === r.np;
            return (
              <tr key={r.np} className={`${r.reachable ? '' : k.unreachable} ${groupEnd ? k.groupEnd : ''}`} data-np={r.np}>
                <td className={`num ${npIsLow(r.np) ? k.low : ''}`}>{r.np}</td>
                <td className="num">{r.reachable ? formatQp(r.minQp as number) : '–'}</td>
                <td className="num">{r.reachable ? formatQp(r.maxQp as number) : '–'}</td>
                <td className="num" data-testid={`count-np-${r.np}`}>
                  {stats.participants ? stats.counts[r.np] : ''}
                </td>
                {first && (
                  <td className={`num ${k.merged}`} rowSpan={npGroupMembers(group).length} data-testid={`pct-group-${group}`}>
                    {pct(stats.groupPctTenths[group - 1])}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  const rows = max > 0 ? linKey(max, step) : [];
  return (
    <table className={k.key} aria-label="Notenschlüssel" data-testid="key-table">
      <thead>
        <tr>
          <th>Note</th>
          <th className="num">Bereich</th>
          <th className="num">Punkte</th>
          <th className="num">Anz.</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const [a, b] = bandRange10(r.band);
          const has = r.minQp !== null;
          return (
            <tr key={r.band} className={`${has ? '' : k.unreachable} ${k.groupEnd}`} data-band={r.band}>
              <td className={linIsLow(a) ? k.low : ''}>{r.verbal}</td>
              <td className="num">
                {formatGrade10(a)}–{formatGrade10(b)}
              </td>
              <td className="num">{has ? `${formatQp(r.maxQp as number)}–${formatQp(r.minQp as number)}` : '–'}</td>
              <td className="num" data-testid={`count-band-${r.band}`}>
                {stats.participants ? stats.counts[r.band - 1] : ''}
              </td>
              <td className="num">{pct(stats.groupPctTenths[r.band - 1])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function KeyFigures({ exam, stats }: { exam: ExamData; stats: ExamStats }): React.JSX.Element {
  const np = exam.exam.scheme === 'NP15';
  return (
    <dl className={k.figures}>
      <dt>Durchschnitt</dt>
      <dd data-testid="fig-avg">{stats.gradeAvgHundredths === null ? '–' : `${formatHundredths(stats.gradeAvgHundredths)}${np ? ' NP' : ''}`}</dd>
      <dt>Note 5 und 6</dt>
      <dd data-testid="fig-low">{stats.lowPctTenths === null ? '–' : pct(stats.lowPctTenths)}</dd>
      <dt>mitgeschrieben</dt>
      <dd data-testid="fig-written">
        {stats.participants} / {stats.listed}
      </dd>
      {stats.absent > 0 && (
        <>
          <dt>fehlt</dt>
          <dd data-testid="fig-absent">{stats.absent}</dd>
        </>
      )}
      {stats.sumAvgTenths !== null && (
        <>
          <dt>Ø Punkte</dt>
          <dd data-testid="fig-sum">
            {formatTenths(stats.sumAvgTenths)} von {formatQp(stats.maxQp)}
          </dd>
        </>
      )}
    </dl>
  );
}

export function chartBars(exam: ExamData, stats: ExamStats): Bar[] {
  if (exam.exam.scheme === 'NP15') {
    return Array.from({ length: 16 }, (_, i) => {
      const n = 15 - i;
      return { label: String(n), value: stats.counts[n] ?? 0, low: npIsLow(n) };
    });
  }
  return [1, 2, 3, 4, 5, 6].map((b) => ({ label: String(b), value: stats.counts[b - 1] ?? 0, low: b >= 5 }));
}

export function Chart({ exam, stats, width, mono }: { exam: ExamData; stats: ExamStats; width?: number; mono?: boolean }): React.JSX.Element {
  const np = exam.exam.scheme === 'NP15';
  return <DistChart bars={chartBars(exam, stats)} title={np ? 'Notenpunkteverteilung' : 'Notenverteilung'} width={width} mono={mono} />;
}
