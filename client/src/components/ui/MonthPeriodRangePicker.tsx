import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Select, type SelectOption } from '@/components/ui/Select';
import styles from './MonthPeriodRangePicker.module.css';

export type MonthPeriodRange = {
  fromMonth: string;
  fromYear: string;
  toMonth: string;
  toYear: string;
};

const EMPTY: MonthPeriodRange = {
  fromMonth: '',
  fromYear: '',
  toMonth: '',
  toYear: '',
};

type MonthPeriodRangePickerProps = {
  value: MonthPeriodRange;
  onChange: (value: MonthPeriodRange) => void;
  monthOptions: SelectOption[];
  placeholder: string;
  panelTitle: string;
  fromHint: string;
  toHint: string;
  monthPlaceholder: string;
  yearPlaceholder: string;
  applyLabel: string;
  clearLabel: string;
  className?: string;
  fullWidth?: boolean;
  'aria-label'?: string;
};

function formatRangeLabel(
  value: MonthPeriodRange,
  monthOptions: SelectOption[]
): string | null {
  const { fromMonth, fromYear, toMonth, toYear } = value;
  if (!fromMonth || !fromYear || !toMonth || !toYear) return null;
  const fromM = monthOptions.find((o) => o.value === fromMonth)?.label ?? fromMonth;
  const toM = monthOptions.find((o) => o.value === toMonth)?.label ?? toMonth;
  return `${fromM} ${fromYear} — ${toM} ${toYear}`;
}

export function MonthPeriodRangePicker({
  value,
  onChange,
  monthOptions,
  placeholder,
  panelTitle,
  fromHint,
  toHint,
  monthPlaceholder,
  yearPlaceholder,
  applyLabel,
  clearLabel,
  className = '',
  fullWidth,
  'aria-label': ariaLabel,
}: MonthPeriodRangePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [draft, setDraft] = useState<MonthPeriodRange>(value);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
    if (!open || !rootRef.current || !panelRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current.offsetHeight || 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < panelHeight + 12 && rect.top > panelHeight);
  }, [open]);

  const displayLabel = formatRangeLabel(value, monthOptions);
  const canApply =
    !!draft.fromMonth &&
    !!draft.fromYear &&
    !!draft.toMonth &&
    !!draft.toYear;

  const apply = () => {
    if (!canApply) return;
    onChange(draft);
    setOpen(false);
  };

  const clear = () => {
    onChange(EMPTY);
    setDraft(EMPTY);
    setOpen(false);
  };

  const patchDraft = (patch: Partial<MonthPeriodRange>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${fullWidth ? styles.fullWidth : ''} ${className}`}
    >
      <button
        type="button"
        id={id}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || panelTitle}
        onClick={() => setOpen((v) => !v)}
      >
        {displayLabel ? (
          <span className={styles.triggerLabel}>{displayLabel}</span>
        ) : (
          <span className={`${styles.triggerLabel} ${styles.triggerPlaceholder}`}>{placeholder}</span>
        )}
        <ChevronDown
          size={18}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${openUp ? styles.panelUp : ''}`}
          role="dialog"
          aria-labelledby={id}
        >
          <p className={styles.panelTitle}>{panelTitle}</p>
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowHint}>{fromHint}</span>
              <Select
                fullWidth
                value={draft.fromMonth}
                onChange={(v) => patchDraft({ fromMonth: v })}
                placeholder={monthPlaceholder}
                options={monthOptions}
              />
              <input
                type="number"
                className={styles.yearInput}
                placeholder={yearPlaceholder}
                value={draft.fromYear}
                onChange={(e) => patchDraft({ fromYear: e.target.value })}
                min={2000}
                max={2100}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.rowHint}>{toHint}</span>
              <Select
                fullWidth
                value={draft.toMonth}
                onChange={(v) => patchDraft({ toMonth: v })}
                placeholder={monthPlaceholder}
                options={monthOptions}
              />
              <input
                type="number"
                className={styles.yearInput}
                placeholder={yearPlaceholder}
                value={draft.toYear}
                onChange={(e) => patchDraft({ toYear: e.target.value })}
                min={2000}
                max={2100}
              />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.applyBtn} disabled={!canApply} onClick={apply}>
              {applyLabel}
            </button>
            {(value.fromMonth ||
              value.fromYear ||
              value.toMonth ||
              value.toYear ||
              draft.fromMonth ||
              draft.fromYear ||
              draft.toMonth ||
              draft.toYear) && (
              <button type="button" className={styles.clearBtn} onClick={clear}>
                {clearLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
