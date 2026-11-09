import { fullKey } from '@shared/grading';
import { formatGrade10, formatQp } from '@shared/parse/number';
import { call } from '../api';
import { Button, Dialog, uiStyles as u } from '../components/ui';
import { save, useStore } from '../store';

export function FullKeyDialog({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const exam = useStore((s) => s.exam);
  if (!exam) return null;
  const max = exam.tasks.reduce((a, t) => a + t.maxQp, 0);
  const rows = fullKey(exam.exam.scheme, max, exam.exam.stepQp).reverse();
  const np = exam.exam.scheme === 'NP15';
  return (
    <Dialog
      title={`Vollständiger Notenschlüssel (${formatQp(max)} Punkte)`}
      onClose={onClose}
      onSubmit={onClose}
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
      </div>
    </Dialog>
  );
}
