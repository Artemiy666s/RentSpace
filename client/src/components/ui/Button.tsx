import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'surface' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[variant]} ${fullWidth ? styles.full : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
