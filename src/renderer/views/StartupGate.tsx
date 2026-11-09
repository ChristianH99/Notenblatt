/**
 * Shown instead of the app while the database is not open:
 * password required, folder unreachable / no database there, or in use on another device.
 */
import { useState } from 'react';
import { call } from '../api';
import { Button, Field, Notice, TextInput } from '../components/ui';
import { errorText, hardReload, useStore } from '../store';
import s from './shell.module.css';

function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? 'gerade eben' : m === 1 ? 'vor 1 Minute' : `vor ${m} Minuten`;
}

export function StartupGate(): React.JSX.Element | null {
  const startup = useStore((st) => st.startup);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!startup) return null;
  const st = startup.storage;
  const info = startup.info;

  const run = async (p: Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await p;
      hardReload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const chooseOther = async (): Promise<void> => {
    const c = await call('storage.chooseDir');
    if (c) await run(call('storage.openOther', { dir: c.dir }));
  };

  const otherActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
      <Button onClick={() => void chooseOther()} disabled={busy}>
        Anderen Speicherort wählen…
      </Button>
      {!info.isDefault && (
        <Button onClick={() => void run(call('storage.useDefault'))} disabled={busy}>
          Lokalen Standardordner verwenden
        </Button>
      )}
    </div>
  );

  let body: React.JSX.Element;
  if (st.state === 'locked') {
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) void run(call('storage.unlock', { password: pw }));
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}
      >
        <h1 className={s.pageTitle} style={{ marginBottom: 0 }}>
          Datenbank entsperren
        </h1>
        <p className={s.muted}>Die Daten sind mit einem Passwort verschlüsselt. Geben Sie das Passwort ein, um Notenblatt zu öffnen.</p>
        <Field label="Passwort" htmlFor="gate-pw">
          <TextInput id="gate-pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {error && <Notice error>{error}</Notice>}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !pw}>
            Entsperren
          </Button>
        </div>
        <p className={s.muted}>Ohne Passwort können die Daten nicht wiederhergestellt werden. Es gibt keine Hintertür.</p>
      </form>
    );
  } else if (st.state === 'inUse') {
    body = (
      <div style={{ maxWidth: 560 }}>
        <h1 className={s.pageTitle}>Datenbank wird gerade verwendet</h1>
        <p>
          Die Datenbank ist auf dem Gerät <b>{st.lock.host}</b> ({st.lock.user}) geöffnet, zuletzt aktiv {minutesAgo(st.lock.heartbeat)}.
        </p>
        <p className={s.muted} style={{ margin: '8px 0 16px' }}>
          Schließen Sie Notenblatt auf dem anderen Gerät und versuchen Sie es erneut. „Trotzdem öffnen“ nur verwenden, wenn das andere Gerät nicht mehr läuft – dort
          gemachte, noch nicht gespeicherte Änderungen gehen sonst verloren.
        </p>
        {error && <Notice error>{error}</Notice>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={() => void run(call('storage.retry'))} disabled={busy}>
            Erneut versuchen
          </Button>
          <Button onClick={() => void run(call('storage.forceOpen'))} disabled={busy}>
            Trotzdem öffnen
          </Button>
        </div>
        {otherActions}
      </div>
    );
  } else if (st.state === 'unavailable') {
    body = (
      <div style={{ maxWidth: 560 }}>
        <h1 className={s.pageTitle}>Speicherort nicht verfügbar</h1>
        <p>{st.reason}</p>
        <p className={s.muted} style={{ margin: '8px 0 16px' }}>
          Ist das Netzlaufwerk verbunden? Prüfen Sie die Verbindung und versuchen Sie es erneut.
        </p>
        {error && <Notice error>{error}</Notice>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={() => void run(call('storage.retry'))} disabled={busy}>
            Erneut versuchen
          </Button>
          {st.canCreate && (
            <Button onClick={() => void run(call('storage.createHere'))} disabled={busy}>
              Hier neue Datenbank anlegen
            </Button>
          )}
        </div>
        {otherActions}
      </div>
    );
  } else {
    return null;
  }

  return (
    <div className={s.page} style={{ height: '100vh' }}>
      <div className={s.pageInner}>
        <div className={s.appName} style={{ padding: '0 0 12px', fontSize: 16 }}>
          Notenblatt
        </div>
        <div className={s.section} style={{ padding: 24 }}>
          {body}
          <p className={s.muted} style={{ marginTop: 24, wordBreak: 'break-all' }}>
            Speicherort: {info.dir}
          </p>
        </div>
      </div>
    </div>
  );
}
