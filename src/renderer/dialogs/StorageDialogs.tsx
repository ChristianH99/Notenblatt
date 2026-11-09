import { useEffect, useState } from 'react';
import type { DirChoice } from '@shared/api';
import type { StorageInfo } from '@shared/types';
import { call } from '../api';
import { Button, Dialog, Field, Notice, TextInput } from '../components/ui';
import { errorText, hardReload } from '../store';

function useBusy(): [boolean, string, (p: () => Promise<unknown>) => Promise<boolean>] {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (p: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await p();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, error, run];
}

export function LocationDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [choice, setChoice] = useState<DirChoice | null>(null);
  const [busy, error, run] = useBusy();
  useEffect(() => {
    void call('storage.info').then(setInfo);
  }, []);

  const done = async (p: () => Promise<unknown>): Promise<void> => {
    if (await run(p)) {
      onClose();
      hardReload();
    }
  };

  return (
    <Dialog
      title="Speicherort der Datenbank"
      wide
      onClose={onClose}
      footer={<Button onClick={onClose}>Schließen</Button>}
    >
      <p>
        Aktueller Speicherort: <b style={{ wordBreak: 'break-all' }}>{info?.dir}</b>
        {info?.isDefault ? ' (Standardordner auf diesem Gerät)' : ''}
        {info?.encrypted ? ' · verschlüsselt' : ''}
      </p>
      <p style={{ color: 'var(--c-text-2)', fontSize: 13 }}>
        Sie können die Datenbank in einem anderen Ordner speichern, z. B. auf einem Netzlaufwerk oder in einem synchronisierten Ordner, um sie auf mehreren Geräten
        zu verwenden. Es kann immer nur ein Gerät gleichzeitig damit arbeiten; Notenblatt sperrt die Datenbank, solange sie geöffnet ist. Für Netzlaufwerke wird
        die Verschlüsselung empfohlen.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          icon="documentText"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setChoice(await call('storage.chooseDir'));
            })
          }
        >
          Ordner wählen…
        </Button>
        {info && !info.isDefault && (
          <Button disabled={busy} onClick={() => void done(() => call('storage.relocate', { dir: null, overwrite: false }))}>
            Daten zurück in den Standardordner verschieben
          </Button>
        )}
      </div>
      {choice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--c-grid)', paddingTop: 12 }}>
          <div>
            Gewählter Ordner: <b style={{ wordBreak: 'break-all' }}>{choice.dir}</b>
          </div>
          {!choice.writable ? (
            <Notice error>In diesen Ordner kann nicht geschrieben werden.</Notice>
          ) : choice.exists ? (
            <>
              <Notice>
                In diesem Ordner liegt bereits eine Notenblatt-Datenbank{choice.encrypted ? ' (verschlüsselt)' : ''}, z. B. von einem anderen Gerät.
              </Notice>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="primary" disabled={busy} onClick={() => void done(() => call('storage.openOther', { dir: choice.dir }))}>
                  Diese Datenbank verwenden
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => void done(() => call('storage.relocate', { dir: choice.dir, overwrite: true }))}>
                  Mit meinen Daten überschreiben
                </Button>
              </div>
              <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                „Diese Datenbank verwenden“: Ihre bisherigen Daten bleiben am alten Speicherort erhalten und werden nicht mehr angezeigt.
              </span>
            </>
          ) : (
            <>
              <div>
                <Button variant="primary" disabled={busy} onClick={() => void done(() => call('storage.relocate', { dir: choice.dir, overwrite: false }))}>
                  Daten in diesen Ordner verschieben
                </Button>
              </div>
              <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                Die Daten werden in den Ordner geschrieben und am bisherigen Speicherort gelöscht. Eine bestehende Verschlüsselung bleibt erhalten.
              </span>
            </>
          )}
        </div>
      )}
      {error && <Notice error>{error}</Notice>}
    </Dialog>
  );
}

export function EncryptDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, error, run] = useBusy();
  const short = pw.length < 8;
  const mismatch = pw !== pw2;
  const submit = async (): Promise<void> => {
    setTried(true);
    if (short || mismatch) return;
    if (await run(() => call('storage.enableEncryption', { password: pw }))) {
      onClose();
      hardReload();
    }
  };
  return (
    <Dialog
      title="Datenbank verschlüsseln"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary" disabled={busy}>
            Verschlüsseln
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <p>Die Datenbank wird mit AES-256 verschlüsselt. Beim Start von Notenblatt wird das Passwort abgefragt.</p>
      <Notice>
        <b>Wenn Sie das Passwort vergessen, sind alle Daten verloren.</b> Es gibt keine Möglichkeit, sie ohne Passwort wiederherzustellen. Notieren Sie das
        Passwort an einem sicheren Ort.
      </Notice>
      <Field label="Passwort (mindestens 8 Zeichen)" htmlFor="enc-pw" error={tried && short ? 'Das Passwort muss mindestens 8 Zeichen lang sein.' : undefined}>
        <TextInput id="enc-pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} invalid={tried && short} />
      </Field>
      <Field label="Passwort wiederholen" htmlFor="enc-pw2" error={tried && !short && mismatch ? 'Die Passwörter stimmen nicht überein.' : undefined}>
        <TextInput id="enc-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={tried && !short && mismatch} />
      </Field>
      {error && <Notice error>{error}</Notice>}
    </Dialog>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, error, run] = useBusy();
  const short = pw.length < 8;
  const mismatch = pw !== pw2;
  const submit = async (): Promise<void> => {
    setTried(true);
    if (!old || short || mismatch) return;
    if (await run(() => call('storage.changePassword', { oldPassword: old, newPassword: pw }))) onClose();
  };
  return (
    <Dialog
      title="Passwort ändern"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary" disabled={busy}>
            Passwort ändern
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <Field label="Bisheriges Passwort" htmlFor="cp-old">
        <TextInput id="cp-old" type="password" autoFocus value={old} onChange={(e) => setOld(e.target.value)} />
      </Field>
      <Field label="Neues Passwort (mindestens 8 Zeichen)" htmlFor="cp-pw" error={tried && short ? 'Das Passwort muss mindestens 8 Zeichen lang sein.' : undefined}>
        <TextInput id="cp-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={tried && short} />
      </Field>
      <Field label="Neues Passwort wiederholen" htmlFor="cp-pw2" error={tried && !short && mismatch ? 'Die Passwörter stimmen nicht überein.' : undefined}>
        <TextInput id="cp-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={tried && !short && mismatch} />
      </Field>
      {error && <Notice error>{error}</Notice>}
    </Dialog>
  );
}

export function DecryptDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [pw, setPw] = useState('');
  const [busy, error, run] = useBusy();
  const submit = async (): Promise<void> => {
    if (!pw) return;
    if (await run(() => call('storage.disableEncryption', { password: pw }))) {
      onClose();
      hardReload();
    }
  };
  return (
    <Dialog
      title="Verschlüsselung aufheben"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger" disabled={busy || !pw}>
            Verschlüsselung aufheben
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <p>Die Datenbank wird danach unverschlüsselt gespeichert. Jede Person mit Zugriff auf den Speicherort kann die Daten dann lesen.</p>
      <Field label="Passwort zur Bestätigung" htmlFor="dec-pw">
        <TextInput id="dec-pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      {error && <Notice error>{error}</Notice>}
    </Dialog>
  );
}
