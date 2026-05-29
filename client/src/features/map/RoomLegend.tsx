import { ROOM_STATUS_COLORS, ROOM_STATUS_ORDER } from '@/constants/roomStatus';
import { useRoomStatusLabels } from '@/i18n/roomStatus';
import styles from './RoomLegend.module.css';

interface Props {
  active?: string | null;
  onToggle?: (status: string | null) => void;
}

export function RoomLegend({ active, onToggle }: Props) {
  const statusLabels = useRoomStatusLabels();
  return (
    <div className={styles.legend}>
      {ROOM_STATUS_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          className={`${styles.item} ${active === status ? styles.active : ''}`}
          onClick={() => onToggle?.(active === status ? null : status)}
        >
          <span className={styles.swatch} style={{ background: ROOM_STATUS_COLORS[status] }} />
          {statusLabels[status]}
        </button>
      ))}
    </div>
  );
}
