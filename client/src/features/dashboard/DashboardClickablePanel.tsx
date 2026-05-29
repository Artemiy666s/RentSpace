import type { KeyboardEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import styles from '@/pages/app/DashboardPage.module.css';

type PanelProps = {
  to: string;
  children: ReactNode;
  cardClassName?: string;
};

export function DashboardClickablePanel({ to, children, cardClassName }: PanelProps) {
  const navigate = useNavigate();

  const activate = () => navigate(to);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  return (
    <div
      className={styles.clickablePanel}
      role="link"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <Card className={`${styles.clickablePanelCard} ${cardClassName ?? ''}`.trim()}>{children}</Card>
    </div>
  );
}

type RowProps = {
  to: string;
  children: ReactNode;
  className?: string;
};

export function DashboardClickableRow({ to, children, className }: RowProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={`${styles.clickableRow} ${className ?? ''}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        navigate(to);
      }}
    >
      {children}
    </button>
  );
}

type PanelLinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
};

export function DashboardPanelLink({ to, children, className }: PanelLinkProps) {
  return (
    <Link to={to} className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}
