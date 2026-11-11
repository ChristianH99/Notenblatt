import { useEffect, useState } from 'react';
import type { UpdatePrefs } from '@shared/api';
import { useEditField } from '../hooks';
import type { CategoryTemplate } from '@shared/types';
import { CategoryEditor } from '../components/CategoryEditor';
import { GradingRuleFields } from './CourseGrading';
import { Button, Checkbox, Select, TextInput } from '../components/ui';
import { call } from '../api';
import { errorText, setSetting, setTemplateRules, templateRules, useStore } from '../store';
import * as about from 'virtual:about';
import s from './shell.module.css';

function SettingText({ id, value, onCommit, placeholder }: { id: string; value: string; onCommit: (v: string) => void; placeholder?: string }): React.JSX.Element {
  const field = useEditField(value, (v) => onCommit(v.trim()));
  return <TextInput id={id} placeholder={placeholder} {...field} />;
}

/** Automatic check on start, manual check. Updates come from the GitHub releases. */
function UpdateSection(): React.JSX.Element {
  const [prefs, setPrefs] = useState<UpdatePrefs | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void call('update.prefs').then(setPrefs);
  }, []);

  const check = async (): Promise<void> => {
    setBusy(true);
    setStatus('Suche nach Updates …');
    try {
      const r = await call('update.check', { auto: false });
      if (r.status === 'available') {
        setStatus('');
        useStore.setState({ dialog: { kind: 'update', offer: r.offer } });
      } else {
        setStatus('Notenblatt ist auf dem neuesten Stand.');
      }
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Updates</h2>
      </div>
      <div className={`${s.sectionBody} ${s.formGrid}`}>
        {prefs && !prefs.enabled ? (
          <>
            <span>Updates</span>
            <span className={s.muted}>In der Entwicklungsversion nicht verfügbar.</span>
          </>
        ) : (
          <>
            <span>Beim Start</span>
            <Checkbox
              id="set-autoupdate"
              label="Nach Updates suchen"
              checked={prefs?.autoCheck ?? true}
              onChange={(on) => {
                if (prefs) setPrefs({ ...prefs, autoCheck: on });
                void call('update.setAutoCheck', { on });
              }}
            />
            <span>Jetzt</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button onClick={() => void check()} disabled={busy}>
                Nach Updates suchen
              </Button>
              <span className={s.muted} role="status" data-testid="update-status">
                {status}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Version, copyright and all licenses (own and third-party), as required by the MIT and other licenses. */
function AboutSection(): React.JSX.Element {
  return (
    <section className={s.section} aria-labelledby="about-title">
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle} id="about-title">
          Über Notenblatt
        </h2>
      </div>
      <div className={s.sectionBody}>
        <div className={s.formGrid}>
          <span>Version</span>
          <span data-testid="app-version">{about.version === '0.0.0' ? '0.0.0 (Entwicklungsversion)' : about.version}</span>
          <span>Urheberrecht</span>
          <span>{about.copyright}</span>
          <span>Lizenz</span>
          <span>MIT-Lizenz</span>
        </div>
        <details className={`${s.licenseItem} ${s.licenseList}`}>
          <summary>
            <span className={s.licenseName}>Lizenztext von Notenblatt</span>
          </summary>
          <pre className={s.licenseText}>{about.licenseText}</pre>
        </details>

        <h3 className={s.sectionTitle} style={{ marginTop: 24 }}>
          Verwendete Software von Drittanbietern
        </h3>
        <p className={s.muted} style={{ margin: '4px 0 0' }}>
          Notenblatt enthält die folgenden Komponenten. Ein Klick auf einen Eintrag zeigt den vollständigen Lizenztext.
        </p>
        <div className={s.licenseList} data-testid="third-party-licenses">
          {about.notices.map((n) => (
            <details key={n.name} className={s.licenseItem}>
              <summary>
                <span className={s.licenseName}>{n.name}</span>
                <span>{n.version}</span>
                <span className={s.muted}>{n.license}</span>
              </summary>
              {n.note && <p style={{ margin: '0 0 8px' }}>{n.note}</p>}
              <p className={s.muted} style={{ margin: '0 0 8px', userSelect: 'text' }}>
                Quelle: {n.url}
              </p>
              <pre className={s.licenseText}>{n.text}</pre>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SettingsView(): React.JSX.Element {
  const st = useStore((x) => x.settings);
  const info = useStore((x) => x.startup?.info);
  const saveTemplate = (t: CategoryTemplate[]): void => void setSetting('categoryTemplate', JSON.stringify(t));
  return (
    <div className={s.page}>
      <div className={s.pageInner}>
        <h1 className={s.pageTitle}>Einstellungen</h1>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Allgemein</h2>
          </div>
          <div className={`${s.sectionBody} ${s.formGrid}`}>
            <label htmlFor="set-teacher">Lehrkraft</label>
            <SettingText id="set-teacher" value={st.teacher} onCommit={(v) => void setSetting('teacher', v)} placeholder="Name für neue Prüfungen" />
            <label htmlFor="set-school">Schule</label>
            <SettingText id="set-school" value={st.school} onCommit={(v) => void setSetting('school', v)} />
            <label htmlFor="set-enter">Eingabetaste bewegt nach</label>
            <Select id="set-enter" value={st.enterDirection} onChange={(e) => void setSetting('enterDirection', e.target.value)}>
              <option value="down">unten (↓)</option>
              <option value="right">rechts (→)</option>
            </Select>
            <label htmlFor="set-touch">Touch-Modus</label>
            <Select id="set-touch" value={st.touchMode} onChange={(e) => void setSetting('touchMode', e.target.value)}>
              <option value="auto">Automatisch</option>
              <option value="on">An</option>
              <option value="off">Aus</option>
            </Select>
            <span>Einführung</span>
            <div>
              <Button onClick={() => useStore.setState({ dialog: { kind: 'onboarding' } })}>Einführung anzeigen</Button>
            </div>
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Speicherort und Verschlüsselung</h2>
          </div>
          <div className={`${s.sectionBody} ${s.formGrid}`}>
            <span>Speicherort</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span className={s.muted} style={{ wordBreak: 'break-all' }} data-testid="storage-dir">
                {info?.dir}
                {info?.isDefault ? ' (Standardordner)' : ''}
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => useStore.setState({ dialog: { kind: 'storageLocation' } })}>Speicherort ändern…</Button>
                <Button variant="quiet" onClick={() => void call('app.openDataFolder')}>
                  Ordner öffnen
                </Button>
              </div>
            </div>
            <span>Verschlüsselung</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className={s.muted} data-testid="storage-encryption">
                {info?.encrypted ? 'An – AES-256, Passwort beim Start' : 'Aus'}
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {info?.encrypted ? (
                  <>
                    <Button onClick={() => useStore.setState({ dialog: { kind: 'changePassword' } })}>Passwort ändern…</Button>
                    <Button variant="quiet" onClick={() => useStore.setState({ dialog: { kind: 'decrypt' } })}>
                      Verschlüsselung aufheben…
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => useStore.setState({ dialog: { kind: 'encrypt' } })}>Mit Passwort verschlüsseln…</Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Vorlage für neue Fächer</h2>
          </div>
          <div className={s.sectionBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className={s.muted}>
              Gilt nur für Fächer, die Sie ab jetzt anlegen. Bestehende Fächer behalten ihre Einstellungen; diese ändern Sie im jeweiligen Fach unter
              „Gewichtung“.
            </p>
            <div className={s.formGrid}>
              <GradingRuleFields idPrefix="set" showErrorWeights value={templateRules(st)} onChange={(p) => void setTemplateRules(p)} />
            </div>
            <CategoryEditor
              label="Kategorien der Vorlage"
              items={st.categoryTemplate.map((t, i) => ({ id: i, ...t }))}
              onUpdate={(i, patch) => saveTemplate(st.categoryTemplate.map((t, k) => (k === i ? { ...t, ...patch } : t)))}
              onAdd={() => saveTemplate([...st.categoryTemplate, { name: 'Neue Kategorie', weightC: 100, defaultMode: 'grade' }])}
              onDelete={(i) => saveTemplate(st.categoryTemplate.filter((_, k) => k !== i))}
              onMove={(i, to) => {
                const next = st.categoryTemplate.filter((_, k) => k !== i);
                next.splice(to, 0, st.categoryTemplate[i] as CategoryTemplate);
                saveTemplate(next);
              }}
            />
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Datenschutz und Daten</h2>
          </div>
          <div className={`${s.sectionBody} ${s.formGrid}`}>
            <label htmlFor="set-retention">Hinweis auf alte Klassen nach …</label>
            <Select id="set-retention" value={st.retentionMonths} onChange={(e) => void setSetting('retentionMonths', e.target.value)}>
              <option value="6">6 Monaten</option>
              <option value="12">12 Monaten</option>
              <option value="24">24 Monaten</option>
              <option value="off">Aus</option>
            </Select>
            <span>Datensicherung</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon="arrowDownload" onClick={() => useStore.setState({ dialog: { kind: 'backupExport' } })}>
                Datensicherung…
              </Button>
              <Button icon="arrowUpload" onClick={() => useStore.setState({ dialog: { kind: 'backupImport' } })}>
                Wiederherstellen…
              </Button>
            </div>
            <span>Alle Daten</span>
            <div>
              <Button icon="delete" onClick={() => useStore.setState({ dialog: { kind: 'wipe' } })}>
                Alle Daten löschen…
              </Button>
            </div>
          </div>
        </section>

        <UpdateSection />
        <AboutSection />
      </div>
    </div>
  );
}
