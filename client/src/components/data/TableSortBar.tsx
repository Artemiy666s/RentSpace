import { useMemo } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { Select } from '@/components/ui/Select';
import type { SortPresetId } from '@/hooks/useTableSort';
import styles from './TableSortBar.module.css';

interface Props {
  value: SortPresetId;
  onChange: (preset: SortPresetId) => void;
  className?: string;
  showNamePresets?: boolean;
  showDatePresets?: boolean;
  /** Без подписи над полем — для компактной панели фильтров */
  inline?: boolean;
}

export function TableSortBar({
  value,
  onChange,
  className = '',
  showNamePresets = true,
  showDatePresets = true,
  inline = false,
}: Props) {
  const { t } = useI18n();

  const options = useMemo(() => {
    const list = [{ value: 'default', label: t('tableSort.default') }];
    if (showDatePresets) {
      list.push(
        { value: 'newest', label: t('tableSort.newest') },
        { value: 'oldest', label: t('tableSort.oldest') }
      );
    }
    if (showNamePresets) {
      list.push(
        { value: 'nameAsc', label: t('tableSort.nameAsc') },
        { value: 'nameDesc', label: t('tableSort.nameDesc') }
      );
    }
    return list;
  }, [t, showDatePresets, showNamePresets]);

  return (
    <Select
      className={`${styles.sortSelect} ${className}`.trim()}
      label={inline ? undefined : t('tableSort.label')}
      aria-label={inline ? t('tableSort.label') : undefined}
      value={value}
      onChange={(v) => onChange(v as SortPresetId)}
      options={options}
    />
  );
}
