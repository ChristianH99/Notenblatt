import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = (): void => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Effective touch mode (setting "Auto" follows `(pointer: coarse)`). */
export function useTouchMode(): boolean {
  const pref = useStore((s) => s.settings.touchMode);
  const coarse = useMediaQuery('(pointer: coarse)');
  return pref === 'on' || (pref === 'auto' && coarse);
}

/**
 * Inline text field that commits on Enter and on blur (once), reverts on Esc or
 * when onCommit returns false. Committing on Enter directly matters because
 * blur events are deferred while the window is not focused.
 */
export function useEditField(
  value: string,
  onCommit: (v: string) => boolean | void | Promise<boolean | void>,
): {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
} {
  const [v, setV] = useState(value);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    setV(value);
    sent.current = null;
  }, [value]);
  const commit = async (): Promise<void> => {
    if (v.trim() === value.trim() || sent.current === v) return;
    sent.current = v;
    if ((await onCommit(v)) === false) {
      setV(value);
      sent.current = null;
    }
  };
  return {
    value: v,
    onChange: (e) => setV(e.target.value),
    onBlur: () => void commit(),
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        void commit();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        sent.current = v;
        setV(value);
        e.currentTarget.blur();
      }
    },
  };
}
