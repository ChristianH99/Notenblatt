import { Button } from '../components/ui';
import { navigate, useStore } from '../store';
import s from './shell.module.css';

/** Start page: three numbered steps, no illustration, no slogan. */
export function WelcomeView(): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const hasClass = tree.length > 0;
  const firstClass = tree[0];
  const firstCourse = tree.flatMap((c) => c.courses)[0];
  const hasCourse = firstCourse !== undefined;
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
          <div className={`${s.step} ${hasCourse ? s.stepDone : ''}`}>
            <span className={s.stepNo}>2</span>
            <div>
              <div className={s.stepTitle}>Fach anlegen</div>
              <div className={s.muted}>Legen Sie in der Klasse jedes Fach an, das Sie dort unterrichten. Gewichtung und Noten werden je Fach getrennt berechnet.</div>
            </div>
            <Button
              variant={hasClass && !hasCourse ? 'primary' : 'secondary'}
              disabled={!hasClass}
              onClick={() => firstClass && useStore.setState({ dialog: { kind: 'newCourse', classId: firstClass.id } })}
            >
              Fach anlegen
            </Button>
          </div>
          <div className={s.step}>
            <span className={s.stepNo}>3</span>
            <div>
              <div className={s.stepTitle}>Prüfung anlegen</div>
              <div className={s.muted}>Wählen Sie Fach, Art, Datum und die Anzahl der Aufgaben. Die Punkte tragen Sie danach in die Tabelle ein.</div>
            </div>
            <Button
              variant={hasCourse ? 'primary' : 'secondary'}
              disabled={!hasCourse}
              onClick={() => useStore.setState({ dialog: { kind: 'newExam', courseId: firstCourse?.id ?? null } })}
            >
              Prüfung anlegen
            </Button>
          </div>
        </div>
        {hasClass && (
          <p className={s.muted}>
            Oder wählen Sie links eine Klasse, ein Fach oder eine Prüfung.{' '}
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
