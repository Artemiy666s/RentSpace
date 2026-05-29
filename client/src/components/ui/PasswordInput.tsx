import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { isFieldEmpty } from '@/lib/isFieldEmpty';
import styles from './PasswordInput.module.css';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function PasswordInput({
  label,
  error,
  hint,
  required,
  id,
  className = '',
  value,
  disabled,
  ...props
}: PasswordInputProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
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
      <div className={styles.wrap}>
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`${styles.input} ${error ? styles.invalid : ''} ${className}`}
          value={value}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          aria-invalid={!!error || undefined}
          {...props}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
          tabIndex={0}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {error ? <span className={styles.error}>{error}</span> : null}
      {displayHint ? <span className={styles.hint}>{displayHint}</span> : null}
    </div>
  );
}
