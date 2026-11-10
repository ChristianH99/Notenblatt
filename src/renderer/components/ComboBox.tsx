/**
 * Text input with a list of suggestions. The arrow button (or Alt+↓) always shows every option,
 * whatever is typed; typing shows the options that contain the text. Free text stays allowed.
 * Replaces <datalist>, which only ever shows the options matching the current text.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import c from './comboBox.module.css';

export interface ComboBoxProps {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  /** Called after an option was picked from the list (the value is already passed to onChange). */
  onPick?: (v: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  width?: number;
  /** Accessible name when there is no <label for>. */
  label?: string;
}

/** Options that contain the text (case-insensitive), those starting with it first. */
export function filterOptions(options: readonly string[], text: string): string[] {
  const t = text.trim().toLocaleLowerCase('de');
  if (!t) return [...options];
  const hits = options.filter((o) => o.toLocaleLowerCase('de').includes(t));
  return [...hits.filter((o) => o.toLocaleLowerCase('de').startsWith(t)), ...hits.filter((o) => !o.toLocaleLowerCase('de').startsWith(t))];
}

export function ComboBox({ id, value, options, onChange, onPick, onBlur, onKeyDown, invalid, autoFocus, placeholder, width, label }: ComboBoxProps): React.JSX.Element {
  const listId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** null = closed; 'all' = every option (arrow button); 'filter' = options matching the text. */
  const [open, setOpen] = useState<null | 'all' | 'filter'>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const shown = open === 'all' ? [...options] : open === 'filter' ? filterOptions(options, value) : [];
  const visible = open !== null && shown.length > 0;

  // Fixed position under the field, so the list is never clipped by a scrolling dialog body.
  useLayoutEffect(() => {
    if (!visible || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2, width: r.width });
  }, [visible, value]);

  const close = (): void => {
    setOpen(null);
    setActive(-1);
  };
  const pick = (v: string): void => {
    onChange(v);
    close();
    onPick?.(v);
  };

  return (
    <span ref={wrap} className={c.wrap} style={width ? { width } : undefined}>
      <input
        ref={input}
        id={id}
        className={`${c.input} ${invalid ? c.invalid : ''}`}
        role="combobox"
        aria-label={label}
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen('filter');
          setActive(-1);
        }}
        onBlur={() => {
          close();
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!visible) {
              setOpen(e.altKey || !value.trim() ? 'all' : 'filter');
              setActive(0);
              return;
            }
            const n = shown.length;
            setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
            return;
          }
          if (visible && e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            e.stopPropagation();
            pick(shown[active] as string);
            return;
          }
          if (visible && e.key === 'Escape') {
            // Only close the list; the dialog or the field keeps its own Esc behaviour otherwise.
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
          }
          onKeyDown?.(e);
        }}
      />
      <button
        type="button"
        className={c.toggle}
        tabIndex={-1}
        aria-label="Alle Vorschläge anzeigen"
        title="Alle Vorschläge anzeigen"
        onMouseDown={(e) => {
          // Keep the focus in the field; the list closes on blur.
          e.preventDefault();
          input.current?.focus();
          if (visible) close();
          else {
            setOpen('all');
            setActive(Math.max(0, options.indexOf(value)));
          }
        }}
      >
        <Icon name="chevronDown" />
      </button>
      {visible && pos && (
        <ul id={listId} role="listbox" className={c.list} style={{ left: pos.left, top: pos.top, minWidth: pos.width }}>
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${c.option} ${i === active ? c.active : ''} ${o === value ? c.current : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
