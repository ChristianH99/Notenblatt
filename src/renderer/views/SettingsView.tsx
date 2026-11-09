import { useEditField } from '../hooks';
import type { CategoryTemplate } from '@shared/types';
import { CategoryEditor } from '../components/CategoryEditor';
import { ROUNDING_OPTIONS } from './CourseGrading';
import { Button, Select, TextInput } from '../components/ui';
import { call } from '../api';
import { setSetting, useStore } from '../store';
import * as about from 'virtual:about';
import s from './shell.module.css';

function SettingText({ id, value, onCommit, placeholder }: { id: string; value: string; onCommit: (v: string) => void; placeholder?: string }): React.JSX.Element {
  const field = useEditField(value, (v) => onCommit(v.trim()));
  return <TextInput id={id} placeholder={placeholder} {...field} />;
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
              <label htmlFor="set-system">Notensystem</label>
              <Select id="set-system" value={st.defaultGradingSystem} onChange={(e) => void setSetting('defaultGradingSystem', e.target.value)}>
                <option value="NP15">Notenpunkte 0–15</option>
                <option value="LIN6">Noten 1,0–6,0 (linear)</option>
              </Select>
              <label htmlFor="set-rounding">Endnote</label>
              <Select id="set-rounding" value={st.defaultRounding} onChange={(e) => void setSetting('defaultRounding', e.target.value)}>
                {ROUNDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <label htmlFor="set-digits">Genauigkeit (Noten 1–6)</label>
              <Select id="set-digits" value={st.defaultRoundingDigits} onChange={(e) => void setSetting('defaultRoundingDigits', e.target.value)}>
                <option value={0}>Ganze Note (z. B. 2)</option>
                <option value={1}>Eine Nachkommastelle (z. B. 2,3)</option>
              </Select>
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

        <AboutSection />
      </div>
    </div>
  );
}
