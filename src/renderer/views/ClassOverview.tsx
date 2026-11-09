/** "Notenübersicht": all students × all exams of a class with category and weighted overall averages. */
import { useEffect, useMemo, useState } from 'react';
import { markIsLow } from '@shared/grading/marks';
import { buildOverview, formatAvg, formatWeight, type Overview } from '@shared/overview';
import { formatDateDe } from '@shared/parse/number';
import type { OverviewData } from '@shared/types';
import { call } from '../api';
import { Button } from '../components/ui';
import { flash, openExam, save, useStore } from '../store';
import o from './overview.module.css';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

export function ClassOverview({ classId }: { classId: number }): React.JSX.Element {
  const tree = useStore((s) => s.tree);
  const version = useStore((s) => s.version);
  const [data, setData] = useState<OverviewData | null>(null);
  useEffect(() => {
    void call('classes.overview', { id: classId }).then(setData);
  }, [classId, tree, version]);
  const ov: Overview | null = useMemo(() => (data ? buildOverview(data) : null), [data]);
  if (!data || !ov) return <div />;

  const groups: { name: string; span: number; key: string }[] = [];
  for (const col of ov.columns) {
    const name = col.category ? `${col.category.name} ×${formatWeight(col.category.weightC)}` : 'Ohne Kategorie';
    const last = groups[groups.length - 1];
    if (last && last.key === String(col.category?.id ?? 'none')) last.span++;
    else groups.push({ name, span: 1, key: String(col.category?.id ?? 'none') });
  }
  const oral = data.categories.find((c) => c.defaultMode === 'grade');

  return (
    <div className={o.wrap}>
      <div className={o.bar}>
        <span style={{ flex: 1 }} />
        {oral && (
          <Button icon="add" onClick={() => useStore.setState({ dialog: { kind: 'newExam', classId, categoryId: oral.id } })}>
            Note „{oral.name}“ eintragen
          </Button>
        )}
        <Button
          icon="arrowDownload"
          onClick={() =>
            void (async () => {
              const f = await save(call('output.overviewCsv', { classId }));
              if (f) flash('CSV-Datei gespeichert', 'info');
            })()
          }
        >
          CSV
        </Button>
      </div>
      {ov.columns.length === 0 ? (
        <p className={o.empty}>Noch keine Prüfungen. Legen Sie eine Prüfung an, um die Übersicht zu füllen.</p>
      ) : (
        <div className={o.scroller}>
          <table className={o.table} aria-label="Notenübersicht" data-testid="overview">
            <thead>
              <tr>
                <th rowSpan={2} className={cx(o.sticky, o.nr)}>
                  Nr
                </th>
                <th rowSpan={2} className={cx(o.sticky, o.name)} style={{ left: 40 }}>
                  Name
                </th>
                <th rowSpan={2} className={cx(o.sticky, o.first, o.lastLeft)} style={{ left: 180 }}>
                  Vorname
                </th>
                {groups.map((g) => (
                  <th key={g.key} colSpan={g.span} className={o.group}>
                    {g.name}
                  </th>
                ))}
                <th colSpan={ov.categories.length + 1} className={cx(o.group, o.avgGroup)}>
                  Durchschnitt
                </th>
                {ov.showFinal && (
                  <th rowSpan={2} className={cx(o.avgHead, o.finalHead)}>
                    Endnote
                  </th>
                )}
              </tr>
              <tr>
                {ov.columns.map((col) => (
                  <th key={col.exam.id} className={cx(o.examHead, !col.included && o.excluded)} title={col.reason ? `${col.title}\nNicht gewertet: ${col.reason}` : col.title}>
                    <button type="button" className={o.examBtn} onClick={() => void openExam(col.exam.id)}>
                      <span className={o.examKind}>{col.exam.kind}</span>
                      <span className={o.examDate}>{formatDateDe(col.exam.examDate).slice(0, 6)}</span>
                    </button>
                  </th>
                ))}
                {ov.categories.map((c, i) => (
                  <th key={c.id} className={cx(o.avgHead, i === 0 && o.firstAvg)}>
                    Ø {c.name}
                  </th>
                ))}
                <th className={cx(o.avgHead, o.total)}>Ø gesamt</th>
              </tr>
            </thead>
            <tbody>
              {ov.rows.map((r) => (
                <tr key={r.student.id} data-student={r.student.lastName}>
                  <td className={cx(o.sticky, o.nr)}>{r.nr}</td>
                  <td className={cx(o.sticky, o.name)} style={{ left: 40 }}>
                    {r.student.lastName}
                  </td>
                  <td className={cx(o.sticky, o.first, o.lastLeft)} style={{ left: 180 }}>
                    {r.student.firstName}
                  </td>
                  {r.cells.map((cell, ci) => {
                    const col = ov.columns[ci]!;
                    return (
                      <td
                        key={col.exam.id}
                        className={cx(
                          'num',
                          cell.absent && o.absent,
                          !col.included && o.excluded,
                          cell.value !== null && markIsLow(cell.value, col.exam.scheme) && o.low,
                        )}
                      >
                        {cell.text}
                      </td>
                    );
                  })}
                  {ov.categories.map((c, i) => (
                    <td key={c.id} className={cx('num', o.avg, i === 0 && o.firstAvg)}>
                      {formatAvg(r.avg.perCategory.get(c.id)?.avgHundredths ?? null)}
                    </td>
                  ))}
                  <td className={cx('num', o.avg, o.total)} data-testid={`overall-${r.student.lastName}`}>
                    {formatAvg(r.avg.overallHundredths)}
                  </td>
                  {ov.showFinal && (
                    <td className={cx('num', o.final)} data-testid={`final-${r.student.lastName}`}>
                      {r.finalText}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3} className={cx(o.sticky, o.lastLeft)} style={{ textAlign: 'right' }}>
                  Klassendurchschnitt
                </th>
                {ov.columns.map((col) => (
                  <td key={col.exam.id} className={cx('num', !col.included && o.excluded)}>
                    {formatAvg(col.avgHundredths)}
                  </td>
                ))}
                <td colSpan={ov.categories.length + 1 + (ov.showFinal ? 1 : 0)} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {ov.columns.some((c) => !c.included) && (
        <p className={o.note}>Grau dargestellte Prüfungen zählen nicht zum Gesamtdurchschnitt (Hinweis beim Darüberfahren über die Spaltenüberschrift).</p>
      )}
    </div>
  );
}
