import type { ReactNode } from 'react';
import styles from './StatusBadge.module.css';

interface Props {
  status: string;
  children: ReactNode;
}

export function StatusBadge({ status, children }: Props) {
  const statusClass = styles[status as keyof typeof styles];
  return (
    <span className={`${styles.badge} ${statusClass ?? ''}`}>
      {children}
    </span>
  );
}
