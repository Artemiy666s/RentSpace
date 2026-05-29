import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import styles from './Modal.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, wide }: Props) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.dialog} ${wide ? styles.wide : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className={styles.header}>
          <h3>{title}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
