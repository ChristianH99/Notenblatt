import { useEffect, useState } from 'react';
import { parseMarkdown, splitReleaseNotes, type Inline } from '@shared/markdown';
import type { UpdateOffer } from '@shared/update';
import { formatDateDe } from '@shared/parse/number';
import { call } from '../api';
import { Button, Dialog, Notice } from '../components/ui';
import { errorText } from '../store';
import g from './guide.module.css';

function Spans({ content }: { content: Inline[] }): React.JSX.Element {
  return (
    <>
      {content.map((c, i) =>
        c.kind === 'strong' ? <strong key={i}>{c.text}</strong> : c.kind === 'em' ? <em key={i}>{c.text}</em> : c.kind === 'code' ? <code key={i}>{c.text}</code> : c.text,
      )}
    </>
  );
}

/**
 * Release notes from GitHub, shown as text (headings, lists, emphasis); links are not followed.
 * Only the German part: an English part after `<!-- en -->` is for the website (shown here
 * only when there is no German part, rather than claiming there are no notes).
 */
export function ReleaseNotes({ markdown }: { markdown: string }): React.JSX.Element {
  const parts = splitReleaseNotes(markdown);
  const blocks = parseMarkdown(parts.de || (parts.en ?? ''));
  return (
    <div className={g.notes} data-testid="release-notes" tabIndex={0} aria-label="Neuerungen">
      {blocks.length === 0 && <p>Für diese Version gibt es keine Beschreibung.</p>}
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const H = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
            return (
              <H key={i}>
                <Spans content={b.content} />
              </H>
            );
          }
          case 'paragraph':
            return (
              <p key={i}>
                <Spans content={b.content} />
              </p>
            );
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i}>
                {b.items.map((it, k) => (
                  <li key={k}>
                    <Spans content={it} />
                  </li>
                ))}
              </L>
            );
          }
          case 'code':
            return <pre key={i}>{b.text}</pre>;
        }
      })}
    </div>
  );
}

const mb = (n: number): string => (n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "Update verfügbar": release notes, then install now / later / skip this version. */
export function UpdateDialog({ offer, onClose }: { offer: UpdateOffer; onClose: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<'offer' | 'download' | 'install'>('offer');
  const [progress, setProgress] = useState({ received: 0, total: offer.asset.size });
  const [error, setError] = useState('');

  useEffect(() => window.notenblatt.on('update-progress', setProgress), []);

  const install = async (): Promise<void> => {
    setError('');
    setProgress({ received: 0, total: offer.asset.size });
    setPhase('download');
    try {
      await call('update.install', { version: offer.version });
      // Main closes the app and runs the installer, which starts Notenblatt again.
      setPhase('install');
    } catch (e) {
      setError(errorText(e));
      setPhase('offer');
    }
  };

  const skip = async (): Promise<void> => {
    try {
      await call('update.skip', { version: offer.version });
    } finally {
      onClose();
    }
  };

  const date = /^\d{4}-\d{2}-\d{2}/.test(offer.publishedAt) ? formatDateDe(offer.publishedAt.slice(0, 10)) : '';
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0;

  if (phase !== 'offer') {
    return (
      <Dialog
        title={`Update auf Version ${offer.version}`}
        onClose={() => phase === 'download' && void call('update.cancel')}
        footer={
          <Button onClick={() => void call('update.cancel')} disabled={phase === 'install'}>
            Abbrechen
          </Button>
        }
      >
        {phase === 'download' ? (
          <>
            <p className={g.lead}>
              Wird heruntergeladen … {mb(progress.received)} von {mb(progress.total)} MB
            </p>
            <div className={g.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Download">
              <div className={g.progressBar} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className={g.lead} data-testid="update-installing">
            Wird installiert … Notenblatt schließt sich und startet danach automatisch neu.
          </p>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Update verfügbar"
      wide
      onClose={onClose}
      onSubmit={() => void install()}
      footer={
        <>
          <div className={g.footerStart}>
            <Button variant="quiet" onClick={() => void skip()}>
              Diese Version überspringen
            </Button>
          </div>
          <Button type="submit" variant="primary" autoFocus>
            Jetzt installieren
          </Button>
          <Button onClick={onClose}>Später</Button>
        </>
      }
    >
      <p className={g.lead}>
        <strong>{offer.name}</strong>
        {date && ` vom ${date}`} ist verfügbar. Ihre Daten bleiben beim Update erhalten.
      </p>
      <ReleaseNotes markdown={offer.notes} />
      <p className={g.summary}>
        Download {mb(offer.asset.size)} MB. Notenblatt schließt sich zur Installation und startet danach neu. „Später“ erinnert beim nächsten Start erneut.
      </p>
      {error && <Notice error>{error}</Notice>}
    </Dialog>
  );
}
