import type { InputHTMLAttributes } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { isFieldEmpty } from '@/lib/isFieldEmpty';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Подсказка под полем (для необязательных полей). */
  hint?: string;
  /** Обязательное поле: звёздочка в подписи и подсказка, пока пусто. */
  required?: boolean;
}

export function Input({
  label,
  error,
  hint,
  required,
  id,
  className = '',
  value,
  disabled,
  ...props
}: InputProps) {
  const { t } = useI18n();
  const inputId = id || props.name;
  const empty = isFieldEmpty(value);
  const requiredHint = required && empty && !disabled ? t('validation.required') : undefined;
  const displayHint = error ? undefined : requiredHint ?? hint;

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && !disabled ? <span className={styles.requiredMark} aria-hidden="true"> *</span> : null}
        </label>
      )}
      <input
        id={inputId}
        className={`${styles.input} ${error ? styles.invalid : ''} ${className}`}
        value={value}
        disabled={disabled}
        required={required}
        aria-required={required || undefined}
        aria-invalid={!!error || undefined}
        {...props}
      />
      {error ? <span className={styles.error}>{error}</span> : null}
      {displayHint ? <span className={styles.hint}>{displayHint}</span> : null}
    </div>
  );
}
