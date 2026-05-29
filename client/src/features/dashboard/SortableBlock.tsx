import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import styles from '@/pages/app/DashboardPage.module.css';

type SortableBlockProps = {
  id: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
};

export function SortableBlock({
  id,
  children,
  className,
  contentClassName,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: SortableBlockProps) {
  const { t } = useI18n();
  const label = t('dashboard.dragBlock');

  return (
    <div
      className={[
        styles.sortableBlock,
        isDragging && styles.sortableDragging,
        isOver && styles.sortableOver,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => onDragOver(e, id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, id)}
    >
      <button
        type="button"
        className={styles.dragHandle}
        draggable
        aria-label={label}
        title={label}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(e, id);
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <div className={`${styles.sortableContent} ${contentClassName ?? ''}`.trim()}>{children}</div>
    </div>
  );
}
