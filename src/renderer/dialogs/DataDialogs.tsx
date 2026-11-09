import { useState } from 'react';
import type { BackupCounts } from '@shared/types';
import { call } from '../api';
import { Button, Dialog, Field, Notice, TextInput } from '../components/ui';
import { errorText, flash, hardReload, save, saveOk } from '../store';

export function BackupExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const short = pw.length < 8;
  const mismatch = pw !== pw2;
  const submit = async (): Promise<void> => {
    setTried(true);
    if (short || mismatch) return;
    setBusy(true);
    const file = await save(call('backup.export', { password: pw }));
    setBusy(false);
    if (file === undefined) return;
    if (file) flash('Datensicherung gespeichert', 'info');
    onClose();
  };
  return (
    <Dialog
      title="Datensicherung erstellen"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="primary" disabled={busy}>
            Speichern unter…
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <Notice>
        Die Datei enthält personenbezogene Daten (Namen und Noten aller Klassen). Sie wird mit Ihrem Passwort verschlüsselt. Bewahren Sie Datei und Passwort getrennt und
        sicher auf. Ohne Passwort ist keine Wiederherstellung möglich.
      </Notice>
      <Field label="Passwort (mindestens 8 Zeichen)" htmlFor="bk-pw" error={tried && short ? 'Das Passwort muss mindestens 8 Zeichen lang sein.' : undefined}>
        <TextInput id="bk-pw" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} invalid={tried && short} />
      </Field>
      <Field label="Passwort wiederholen" htmlFor="bk-pw2" error={tried && !short && mismatch ? 'Die Passwörter stimmen nicht überein.' : undefined}>
        <TextInput id="bk-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={tried && !short && mismatch} />
      </Field>
    </Dialog>
  );
}

export function BackupImportDialog({ onClose, intro }: { onClose: () => void; intro?: string }): React.JSX.Element {
  const [file, setFile] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [counts, setCounts] = useState<BackupCounts | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = (): void => {
    void call('backup.cancel');
    onClose();
  };

  const pick = async (): Promise<void> => {
    const name = await call('backup.pick');
    if (name) {
      setFile(name);
      setCounts(null);
      setError('');
    }
  };

  const submit = async (): Promise<void> => {
    if (!file) return void pick();
    setError('');
    if (!counts) {
      setBusy(true);
      try {
        setCounts(await call('backup.inspect', { password: pw }));
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (await saveOk(call('backup.import'))) hardReload();
  };

  return (
    <Dialog
      title="Datensicherung wiederherstellen"
      onClose={close}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant={counts ? 'danger' : 'primary'} disabled={busy || (!!file && !counts && pw.length === 0)}>
            {!file ? 'Datei auswählen…' : counts ? 'Alle Daten ersetzen' : 'Prüfen'}
          </Button>
          <Button onClick={close}>Abbrechen</Button>
        </>
      }
    >
      {intro && <p>{intro}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button icon="documentText" onClick={() => void pick()}>
          Datei auswählen…
        </Button>
        <span style={{ color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ?? 'Keine Datei ausgewählt'}</span>
      </div>
      {file && (
        <Field label="Passwort" htmlFor="rs-pw">
          <TextInput
            id="rs-pw"
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setCounts(null);
            }}
          />
        </Field>
      )}
      {error && <Notice error>{error}</Notice>}
      {counts && (
        <Notice>
          Die Datensicherung enthält {counts.classes} {counts.classes === 1 ? 'Klasse' : 'Klassen'}, {counts.students} Schüler, {counts.exams}{' '}
          {counts.exams === 1 ? 'Prüfung' : 'Prüfungen'}. <b>Alle derzeit gespeicherten Daten werden dabei ersetzt.</b>
        </Notice>
      )}
    </Dialog>
  );
}

export function WipeDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === 'LÖSCHEN';
  const submit = async (): Promise<void> => {
    if (!ok) return;
    if (await saveOk(call('app.wipeAll'))) hardReload();
  };
  return (
    <Dialog
      title="Alle Daten löschen"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button type="submit" variant="danger" disabled={!ok}>
            Endgültig löschen
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </>
      }
    >
      <p>Alle Klassen, Schüler/innen, Prüfungen, Noten und Einstellungen werden endgültig von diesem Gerät gelöscht. Dies kann nicht rückgängig gemacht werden.</p>
      <Field label="Geben Sie zur Bestätigung LÖSCHEN ein" htmlFor="wipe-confirm">
        <TextInput id="wipe-confirm" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export function CorruptDialog({ renamedTo, onClose }: { renamedTo: string; onClose: () => void }): React.JSX.Element {
  const [restore, setRestore] = useState(false);
  if (restore) return <BackupImportDialog onClose={onClose} intro="Wählen Sie eine Datensicherung, um Ihre Daten wiederherzustellen." />;
  return (
    <Dialog
      title="Datenbank beschädigt"
      onClose={onClose}
      onSubmit={onClose}
      footer={
        <>
          <Button type="submit" variant="primary">
            Neu beginnen
          </Button>
          <Button onClick={() => setRestore(true)}>Datensicherung wiederherstellen</Button>
        </>
      }
    >
      <p>Die gespeicherten Daten konnten nicht gelesen werden. Die beschädigte Datei wurde umbenannt und bleibt erhalten:</p>
      <p style={{ wordBreak: 'break-all', color: 'var(--c-text-2)', fontSize: 13 }}>{renamedTo}</p>
      <p>Sie können mit einer leeren Datenbank neu beginnen oder eine Datensicherung wiederherstellen.</p>
    </Dialog>
  );
}
