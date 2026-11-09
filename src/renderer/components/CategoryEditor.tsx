/** Table editor for weighting categories: name, weight, default entry, share. */
import { formatWeight, parseWeight } from '@shared/overview';
import type { EntryMode } from '@shared/types';
import { useEditField } from '../hooks';
import { flash } from '../store';
import { Button, uiStyles as u } from './ui';
import c from './categoryEditor.module.css';

export interface CategoryItem {
  id: number;
  name: string;
  weightC: number;
  defaultMode: EntryMode;
  /** Number of exams using this category (class editor only). */
  used?: number;
}

export interface CategoryEditorProps {
  items: CategoryItem[];
  onUpdate: (id: number, patch: { name?: string; weightC?: number; defaultMode?: EntryMode }) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
  onMove: (id: number, position: number) => void;
  label: string;
}

function CellText({ value, label, onCommit, width }: { value: string; label: string; onCommit: (v: string) => boolean; width: number }): React.JSX.Element {
  const field = useEditField(value, onCommit);
  return <input className={c.input} style={{ width }} aria-label={label} spellCheck={false} autoComplete="off" {...field} />;
}

export function CategoryEditor({ items, onUpdate, onAdd, onDelete, onMove, label }: CategoryEditorProps): React.JSX.Element {
  const total = items.reduce((a, b) => a + b.weightC, 0);
  return (
    <div>
      <table className={u.table} aria-label={label}>
        <thead>
          <tr>
            <th>Kategorie</th>
            <th className="num">Gewicht</th>
            <th className="num">Anteil</th>
            <th>Eingabe bei neuen Prüfungen</th>
            {items.some((i) => i.used !== undefined) && <th className="num">Prüfungen</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} data-category={it.name}>
              <td className={c.edit}>
                <CellText
                  width={180}
                  label={`Name der Kategorie ${i + 1}`}
                  value={it.name}
                  onCommit={(v) => {
                    if (!v.trim() || v.length > 40) {
                      flash('Bitte einen Namen (höchstens 40 Zeichen) eingeben.');
                      return false;
                    }
                    onUpdate(it.id, { name: v.trim() });
                    return true;
                  }}
                />
              </td>
              <td className={`num ${c.edit}`}>
                <span className={c.times}>×</span>
                <CellText
                  width={60}
                  label={`Gewicht von ${it.name}`}
                  value={formatWeight(it.weightC)}
                  onCommit={(v) => {
                    const w = parseWeight(v);
                    if (w === null) {
                      flash('Gewicht: Zahl von 0,01 bis 100 eingeben (z. B. 3 oder 1,5).');
                      return false;
                    }
                    onUpdate(it.id, { weightC: w });
                    return true;
                  }}
                />
              </td>
              <td className="num">{total > 0 ? `${Math.round((it.weightC * 1000) / total) / 10} %`.replace('.', ',') : ''}</td>
              <td className={c.edit}>
                <select
                  className={c.select}
                  aria-label={`Eingabe für ${it.name}`}
                  value={it.defaultMode}
                  onChange={(e) => onUpdate(it.id, { defaultMode: e.target.value as EntryMode })}
                >
                  <option value="points">Punkte (Aufgaben)</option>
                  <option value="grade">Nur Note</option>
                </select>
              </td>
              {it.used !== undefined && <td className="num">{it.used}</td>}
              <td className={c.actions}>
                <Button variant="quiet" icon="chevronRight" className={c.up} tip="Nach oben" disabled={i === 0} onClick={() => onMove(it.id, i - 1)} />
                <Button variant="quiet" icon="chevronRight" className={c.down} tip="Nach unten" disabled={i === items.length - 1} onClick={() => onMove(it.id, i + 1)} />
                <Button
                  variant="quiet"
                  icon="delete"
                  tip={`Kategorie ${it.name} löschen`}
                  disabled={items.length <= 1 || (it.used ?? 0) > 0}
                  onClick={() => onDelete(it.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <Button icon="add" onClick={onAdd}>
          Kategorie hinzufügen
        </Button>
      </div>
    </div>
  );
}
