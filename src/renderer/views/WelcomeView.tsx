import { Button } from '../components/ui';
import { navigate, useStore } from '../store';
import s from './shell.module.css';

/** Start page: two numbered steps, no illustration, no slogan. */
export function WelcomeView(): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const hasClass = tree.length > 0;
  const firstClass = tree[0];
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <h1 className={s.pageTitle}>Erste Schritte</h1>
        <div className={`${s.section} ${s.steps}`}>
          <div className={`${s.step} ${hasClass ? s.stepDone : ''}`}>
            <span className={s.stepNo}>1</span>
            <div>
              <div className={s.stepTitle}>Klasse anlegen</div>
              <div className={s.muted}>Legen Sie eine Klasse an und fügen Sie die Namen ein, z. B. aus Excel oder ASV.</div>
            </div>
            <Button variant={hasClass ? 'secondary' : 'primary'} onClick={() => useStore.setState({ dialog: { kind: 'newClass' } })}>
              Klasse anlegen
            </Button>
          </div>
          <div className={s.step}>
            <span className={s.stepNo}>2</span>
            <div>
              <div className={s.stepTitle}>Prüfung anlegen</div>
              <div className={s.muted}>Wählen Sie Art, Fach, Bewertung und die Anzahl der Aufgaben. Die Punkte tragen Sie danach in die Tabelle ein.</div>
            </div>
            <Button
              variant={hasClass ? 'primary' : 'secondary'}
              disabled={!hasClass}
              onClick={() => useStore.setState({ dialog: { kind: 'newExam', classId: firstClass?.id ?? null } })}
            >
              Prüfung anlegen
            </Button>
          </div>
        </div>
        {hasClass && (
          <p className={s.muted}>
            Oder wählen Sie links eine Klasse bzw. Prüfung.{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (firstClass) navigate({ view: 'class', classId: firstClass.id });
              }}
            >
              Klasse {firstClass?.name} öffnen
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
