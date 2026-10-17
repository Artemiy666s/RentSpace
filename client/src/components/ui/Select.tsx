import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { isFieldEmpty } from '@/lib/isFieldEmpty';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  fullWidth?: boolean;
  required?: boolean;
  'aria-label'?: string;
}

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

export function Select({
  value,
  onChange,
  options,
  label,
  error,
  hint,
  placeholder,
  disabled,
  className = '',
  id,
  fullWidth,
  required,
  'aria-label': ariaLabel,
}: SelectProps) {
  const { t } = useI18n();
  const autoId = useId();
  const selectId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? '';

  const updatePos = () => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const pad = 12;
    const gap = 6;
    const estimated = Math.min(options.length * 46 + 16, 280);
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const openUp = spaceBelow < estimated && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, openUp ? spaceAbove - gap : spaceBelow - gap));
    setPos({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const onReposition = () => updatePos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, options.length]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const control = (
    <div
      ref={rootRef}
      className={`${styles.root} ${fullWidth ? styles.fullWidth : ''} ${error ? styles.invalid : ''} ${className}`}
    >
      <button
        type="button"
        id={selectId}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>{displayLabel}</span>
        <ChevronDown size={18} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            className={styles.menuPortal}
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              transform: pos.openUp ? 'translateY(-100%)' : undefined,
            }}
            role="listbox"
            aria-labelledby={selectId}
          >
            {options.map((opt) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  disabled={opt.disabled}
                  className={`${styles.option} ${opt.value === value ? styles.optionActive : ''}`}
                  onClick={() => !opt.disabled && pick(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );

  const empty = isFieldEmpty(value);
  const requiredHint = required && empty && !disabled ? t('validation.selectRequired') : undefined;
  const displayHint = error ? undefined : requiredHint ?? hint;

  if (!label && !error && !displayHint) return control;

  return (
    <div className={`${styles.field} ${fullWidth ? styles.fullWidth : ''}`}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
          {required && !disabled ? <span className={styles.requiredMark} aria-hidden="true"> *</span> : null}
        </label>
      )}
      {control}
      {displayHint ? <span className={styles.hint}>{displayHint}</span> : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
