import { isExpired } from '@shared/schoolYear';
import { Button, uiStyles as u } from '../components/ui';
import { navigate, useStore } from '../store';
import s from './shell.module.css';

export function RetentionView(): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const months = useStore((st) => st.settings.retentionMonths);
  const old = months === 'off' ? [] : tree.filter((c) => isExpired(c.schoolYear, Number(months)));
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <h1 className={s.pageTitle}>Klassen aus abgelaufenen Schuljahren</h1>
        <p className={s.muted} style={{ marginBottom: 16 }}>
          Diese Klassen gehören zu Schuljahren, die vor mehr als {months} Monaten geendet haben. Prüfen Sie, ob die Daten noch benötigt werden.
        </p>
        {old.length === 0 ? (
          <p className={s.muted}>Keine Klassen aus abgelaufenen Schuljahren gespeichert.</p>
        ) : (
          <div className={s.section}>
            <table className={u.table}>
              <thead>
                <tr>
                  <th>Klasse</th>
                  <th>Schuljahr</th>
                  <th className="num">Schüler/innen</th>
                  <th className="num">Prüfungen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {old.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.schoolYear}</td>
                    <td className="num">{c.studentCount}</td>
                    <td className="num">{c.exams.length}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="quiet" onClick={() => navigate({ view: 'class', classId: c.id })}>
                        Öffnen
                      </Button>{' '}
                      <Button variant="quiet" icon="delete" onClick={() => useStore.setState({ dialog: { kind: 'deleteClass', classId: c.id } })}>
                        Löschen…
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
