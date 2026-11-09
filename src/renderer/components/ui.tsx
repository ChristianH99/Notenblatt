import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

// ───────────── Button ─────────────

type BtnVariant = 'secondary' | 'primary' | 'danger' | 'quiet';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  variant?: BtnVariant;
  icon?: IconName;
  /** Tooltip; required for icon-only buttons. */
  tip?: string;
  pressed?: boolean;
}

export function Button({ variant = 'secondary', icon, tip, pressed, children, className, type = 'button', ...rest }: ButtonProps): React.JSX.Element {
  const iconOnly = !children && !!icon;
  return (
    <button
      type={type}
      title={tip}
      aria-label={iconOnly ? tip : undefined}
      aria-pressed={pressed}
      className={cx(
        s.btn,
        variant === 'primary' && s.primary,
        variant === 'danger' && s.danger,
        variant === 'quiet' && s.quiet,
        iconOnly && s.iconOnly,
        pressed && s.pressed,
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

// ───────────── Fields ─────────────

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }): React.JSX.Element {
  return (
    <div className={s.field}>
      <label className={s.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <span className={s.hint}>{hint}</span>}
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}

export function TextInput({ invalid, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }): React.JSX.Element {
  return <input type="text" autoComplete="off" spellCheck={false} aria-invalid={invalid || undefined} className={cx(s.input, className)} {...rest} />;
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={cx(s.select, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea spellCheck={false} className={cx(s.textarea, className)} {...rest} />;
}

export function Checkbox({ label, checked, onChange, id }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id?: string }): React.JSX.Element {
  return (
    <label className={s.check}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function RadioGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  row,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  row?: boolean;
}): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className={cx(s.radioGroup, row && s.radioRow)}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={s.check}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function Notice({ children, error }: { children: ReactNode; error?: boolean }): React.JSX.Element {
  return <div className={cx(s.notice, error && s.noticeError)}>{children}</div>;
}

// ───────────── Dialog ─────────────

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
  onSubmit?: () => void;
}

/** Modal dialog (native <dialog>): focus trap, Esc closes, Windows button order. */
export function Dialog({ title, onClose, children, footer, wide, onSubmit }: DialogProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx(s.dialog, wide && s.wide)}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        className={s.dialogInner}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <h2 id={titleId} className={s.dialogTitle}>
          {title}
        </h2>
        <div className={s.dialogBody}>{children}</div>
        <div className={s.dialogFooter}>{footer}</div>
      </form>
    </dialog>
  );
}

// ───────────── Menu ─────────────

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

/** Popup menu anchored to an element. Keyboard: arrows, Enter, Esc. */
export function Menu({ anchor, items, onClose, label }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void; label: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const m = ref.current?.getBoundingClientRect();
    const w = m?.width ?? 200;
    const h = m?.height ?? 100;
    let left = r.left;
    let top = r.bottom + 2;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.right - w);
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 2);
    setPos({ left, top });
    const first = ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onBlur = (): void => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [anchor, onClose]);

  const onKey = (e: React.KeyboardEvent): void => {
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      anchor.focus();
    }
  };

  return createPortal(
    <div ref={ref} role="menu" aria-label={label} className={s.menu} style={{ left: pos.left, top: pos.top }} onKeyDown={onKey}>
      {items.map((it) => (
        <div key={it.label}>
          {it.separatorBefore && <div className={s.menuSep} role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={cx(s.menuItem, it.danger && s.dangerItem)}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <span className={s.menuIcon}>{it.icon && <Icon name={it.icon} />}</span>
            {it.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** A button that opens a menu. */
export function MenuButton({ items, label, icon = 'more', children, variant = 'secondary', className }: { items: MenuItem[]; label: string; icon?: IconName; children?: ReactNode; variant?: BtnVariant; className?: string }): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant={variant}
        icon={icon}
        tip={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        className={className}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {children}
      </Button>
      {anchor && <Menu anchor={anchor} items={items} label={label} onClose={() => setAnchor(null)} />}
    </>
  );
}

export { cx };
export const uiStyles = s;
