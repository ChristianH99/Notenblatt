import { hasErrorGrading } from '@shared/examModel';
import { fullKey } from '@shared/grading';
import { formatGrade10, formatQp } from '@shared/parse/number';
import { call } from '../api';
import { Button, Dialog, uiStyles as u } from '../components/ui';
import { save, useStore } from '../store';
import { ErrorKeyTable } from '../views/keyTables';

export function FullKeyDialog({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const exam = useStore((s) => s.exam);
  if (!exam) return null;
  const max = exam.tasks.reduce((a, t) => a + t.maxQp, 0);
  const rows = fullKey(exam.exam.scheme, max, exam.exam.stepQp).reverse();
  const np = exam.exam.scheme === 'NP15';
  const errors = hasErrorGrading(exam);
  const pointsTable = (
    <table className={u.table} aria-label="Notenschlüssel">
      <thead>
        <tr>
          <th className="num">Punkte</th>
          <th className="num">{np ? 'NP' : 'Note'}</th>
          <th>{np ? 'Note' : 'Wortnote'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.qp}>
            <td className="num">{formatQp(r.qp)}</td>
            <td className="num">{np ? r.grade : formatGrade10(r.grade)}</td>
            <td>{r.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <Dialog
      title={errors ? `Vollständiger Schlüssel: Punkte (${formatQp(max)}) und Fehler` : `Vollständiger Notenschlüssel (${formatQp(max)} Punkte)`}
      onClose={onClose}
      onSubmit={onClose}
      wide={errors}
      footer={
        <>
          <Button variant="primary" icon="print" onClick={() => void save(call('output.print', { examId: exam.exam.id, mode: 'key' }))}>
            Schlüssel drucken…
          </Button>
          <Button onClick={onClose}>Schließen</Button>
        </>
      }
    >
      <div style={{ maxHeight: 'calc(100vh - 240px)', overflow: 'auto', border: '1px solid var(--c-grid)' }}>
        {errors ? (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: 8 }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-14)' }}>Notenschlüssel der Punkte</h3>
              {pointsTable}
            </div>
            <div style={{ flex: 'none', width: 200 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-14)' }}>Fehlerschlüssel</h3>
              <ErrorKeyTable className={u.table} />
              <p style={{ margin: '8px 0 0', color: 'var(--c-text-2)', fontSize: 'var(--fs-13)' }}>
                Je Fehler 0,3 Noten, ab dem 10. Fehler 0,5 Noten; halbe Fehler halb so viel (abgeschnitten).
              </p>
            </div>
          </div>
        ) : (
          pointsTable
        )}
      </div>
    </Dialog>
  );
}
