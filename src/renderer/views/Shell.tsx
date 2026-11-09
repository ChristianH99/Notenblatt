import { useEffect, useMemo } from 'react';
import { examTitle } from '@shared/labels';
import { isExpired } from '@shared/schoolYear';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { useMediaQuery, useTouchMode } from '../hooks';
import { navigate, openExam, undoRedo, useStore } from '../store';
import { DialogHost } from '../dialogs/DialogHost';
import { ClassView } from './ClassView';
import { ExamView } from './ExamView';
import { HelpView } from './HelpView';
import { RetentionView } from './RetentionView';
import { SettingsView } from './SettingsView';
import { WelcomeView } from './WelcomeView';
import s from './shell.module.css';

function Logo(): React.JSX.Element {
  return (
    <svg className={s.logo} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="17" rx="2" fill="none" stroke="#245B85" />
      <path d="M0.5 6.5h17M0.5 11.5h17M6.5 0.5v17M11.5 0.5v17" stroke="#245B85" />
    </svg>
  );
}

function Nav({ compact, overlay, onPicked }: { compact: boolean; overlay?: boolean; onPicked?: () => void }): React.JSX.Element {
  const tree = useStore((st) => st.tree);
  const route = useStore((st) => st.route);
  const years = useMemo(() => {
    const m = new Map<string, typeof tree>();
    for (const c of tree) m.set(c.schoolYear, [...(m.get(c.schoolYear) ?? []), c]);
    return [...m.entries()];
  }, [tree]);
  const currentClass =
    route.view === 'class' ? route.classId : route.view === 'exam' ? (tree.find((c) => c.exams.some((e) => e.id === route.examId))?.id ?? null) : null;

  if (compact) {
    return (
      <nav className={s.rail} aria-label="Navigation">
        <Button variant="quiet" icon="people" tip="Klassen und Prüfungen anzeigen (Strg+B)" onClick={() => useStore.setState({ navPref: 'open' })} />
        <Button
          variant="quiet"
          icon="add"
          tip="Neue Prüfung"
          disabled={tree.length === 0}
          onClick={() => useStore.setState({ dialog: { kind: 'newExam', classId: currentClass } })}
        />
      </nav>
    );
  }

  return (
    <nav className={`${s.nav} ${overlay ? s.navOverlay : ''}`} aria-label="Klassen und Prüfungen" onClickCapture={(e) => (e.target as HTMLElement).closest('button') && onPicked?.()}>
      <div className={s.navActions}>
        <Button icon="people" onClick={() => useStore.setState({ dialog: { kind: 'newClass' } })}>
          Neue Klasse
        </Button>
        <Button icon="add" disabled={tree.length === 0} onClick={() => useStore.setState({ dialog: { kind: 'newExam', classId: currentClass } })}>
          Neue Prüfung
        </Button>
      </div>
      <div className={s.navList}>
        {tree.length === 0 && <div className={s.navEmpty}>Noch keine Klassen angelegt.</div>}
        {years.map(([year, classes]) => (
          <div key={year}>
            <div className={s.navYear}>Schuljahr {year}</div>
            {classes.map((c) => (
              <div key={c.id}>
                <button
                  type="button"
                  className={`${s.navItem} ${s.navClass} ${route.view === 'class' && route.classId === c.id ? s.active : ''}`}
                  onClick={() => navigate({ view: 'class', classId: c.id })}
                  aria-current={route.view === 'class' && route.classId === c.id ? 'page' : undefined}
                >
                  <span className={s.navIconBox}>
                    <Icon name="people" />
                  </span>
                  {c.name}
                </button>
                {c.exams.map((e) => {
                  const active = route.view === 'exam' && route.examId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`${s.navItem} ${s.navExam} ${active ? s.active : ''}`}
                      onClick={() => void openExam(e.id)}
                      aria-current={active ? 'page' : undefined}
                      title={examTitle(e)}
                    >
                      <span className={s.navExamText}>{examTitle(e)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

function StatusBar(): React.JSX.Element {
  const save = useStore((st) => st.save);
  const fl = useStore((st) => st.flash);
  const touch = useTouchMode();
  return (
    <footer className={s.status}>
      <div className={s.statusMsg} role="status" aria-live="polite" data-testid="status">
        {fl ? (
          <span className={fl.kind === 'error' ? s.flashError : s.flashInfo} data-testid="flash">
            {fl.text}
          </span>
        ) : save.state === 'error' ? (
          <span className={s.saveError}>Speichern fehlgeschlagen – {save.error}</span>
        ) : save.state === 'saved' ? (
          'Gespeichert'
        ) : (
          ''
        )}
      </div>
      {touch && <span>Touch-Modus</span>}
    </footer>
  );
}

function RetentionBar(): React.JSX.Element | null {
  const tree = useStore((st) => st.tree);
  const months = useStore((st) => st.settings.retentionMonths);
  const dismissed = useStore((st) => st.retentionDismissed);
  const route = useStore((st) => st.route);
  if (months === 'off' || dismissed || route.view === 'retention') return null;
  const n = tree.filter((c) => isExpired(c.schoolYear, Number(months))).length;
  if (n === 0) return null;
  return (
    <div className={s.noticeBar} role="region" aria-label="Hinweis">
      <Icon name="warning" />
      <span style={{ flex: 1 }}>
        {n === 1 ? '1 Klasse' : `${n} Klassen`} aus abgelaufenen Schuljahren gespeichert
      </span>
      <Button onClick={() => navigate({ view: 'retention' })}>Prüfen</Button>
      <Button variant="quiet" icon="dismiss" tip="Hinweis ausblenden" onClick={() => useStore.setState({ retentionDismissed: true })} />
    </div>
  );
}

export function Shell(): React.JSX.Element {
  const route = useStore((st) => st.route);
  const tree = useStore((st) => st.tree);
  const exam = useStore((st) => st.exam);
  const navPref = useStore((st) => st.navPref);
  const narrow = useMediaQuery('(max-width: 1365px)');
  const touch = useTouchMode();
  // Narrow screens: icon rail; "open" shows the full navigation as an overlay that closes after a choice.
  const overlay = narrow && navPref === 'open';
  const compact = navPref === 'closed' || (narrow && navPref !== 'open') || overlay;

  useEffect(() => {
    document.documentElement.classList.toggle('touch', touch);
  }, [touch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        useStore.setState({ navPref: compact && !overlay ? 'open' : narrow ? 'auto' : 'closed' });
      } else if (k === 'j') {
        e.preventDefault();
        useStore.setState((st) => ({ panelHidden: !st.panelHidden }));
      } else if ((k === 'z' || k === 'y') && route.view === 'exam') {
        const t = e.target as HTMLElement;
        if (t.closest('input, textarea, select, dialog')) return;
        e.preventDefault();
        void undoRedo(k === 'z' && !e.shiftKey ? 'undo' : 'redo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, overlay, narrow, route.view]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useStore.setState({ navPref: 'auto' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  const crumb =
    route.view === 'exam' && exam
      ? `${exam.schoolClass.name} · ${examTitle(exam.exam)}`
      : route.view === 'class'
        ? (tree.find((c) => c.id === route.classId)?.name ?? '')
        : '';

  const crumbClass = route.view === 'exam' && exam ? exam.exam.classId : null;

  let content: React.JSX.Element;
  switch (route.view) {
    case 'class':
      content = <ClassView key={route.classId} classId={route.classId} />;
      break;
    case 'exam':
      content = exam ? <ExamView key={exam.exam.id} /> : <div />;
      break;
    case 'settings':
      content = <SettingsView />;
      break;
    case 'help':
      content = <HelpView />;
      break;
    case 'retention':
      content = <RetentionView />;
      break;
    default:
      content = <WelcomeView />;
  }

  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <Button
          variant="quiet"
          icon="navigation"
          tip={compact && !overlay ? 'Navigation einblenden (Strg+B)' : 'Navigation ausblenden (Strg+B)'}
          onClick={() => useStore.setState({ navPref: compact && !overlay ? 'open' : narrow ? 'auto' : 'closed' })}
        />
        <div className={s.appName}>
          <Logo />
          Notenblatt
        </div>
        <div className={s.crumb}>
          {crumbClass !== null ? (
            <button type="button" className={s.crumbLink} onClick={() => navigate({ view: 'class', classId: crumbClass })} title="Klasse öffnen">
              {crumb}
            </button>
          ) : (
            crumb
          )}
        </div>
        <div className={s.spacer} />
        <Button variant="quiet" icon="settings" pressed={route.view === 'settings'} onClick={() => navigate({ view: 'settings' })}>
          Einstellungen
        </Button>
        <Button variant="quiet" icon="question" pressed={route.view === 'help'} onClick={() => navigate({ view: 'help' })}>
          Hilfe
        </Button>
      </header>
      <div className={s.body}>
        <Nav compact={compact} />
        {overlay && (
          <>
            <div className={s.scrim} onPointerDown={() => useStore.setState({ navPref: 'auto' })} />
            <Nav compact={false} overlay onPicked={() => setTimeout(() => useStore.setState({ navPref: 'auto' }), 0)} />
          </>
        )}
        <main className={s.main}>
          <RetentionBar />
          {content}
        </main>
      </div>
      <StatusBar />
      <DialogHost />
    </div>
  );
}
