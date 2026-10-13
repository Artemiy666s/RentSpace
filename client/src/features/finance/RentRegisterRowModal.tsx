import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/useI18n';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import listingStyles from '@/styles/listingPage.module.css';

export type RentRegisterRoom = {
  roomId?: number | null;
  roomNumber?: string | null;
  label: string;
  area: number;
  rateWithoutVat: number;
  amountWithoutVat: number;
  amountWithVat: number;
  formula?: string;
};

export type RentRegisterRow = {
  rowNum: number;
  contractId: number;
  tenantName: string;
  contractLabel: string;
  area: number;
  rateWithoutVat: number;
  totalRent: number;
  totalUtil: number;
  debt: number;
  status: string;
  rooms?: RentRegisterRoom[];
  areaFormula?: string | null;
};

type Props = {
  row: RentRegisterRow | null;
  year: number;
  open: boolean;
  onClose: () => void;
};

export function RentRegisterRowModal({ row, year, open, onClose }: Props) {
  const { t } = useI18n();
  if (!row) return null;
  const rooms = row.rooms || [];

  return (
    <Modal open={open} title={row.tenantName} onClose={onClose} wide>
      <dl className={listingStyles.metaGrid}>
        <dt>{t('common.contract')}</dt>
        <dd>{row.contractLabel}</dd>
        <dt>{t('common.area')}</dt>
        <dd>
          {row.area.toFixed(2)} {t('common.sqm')}
        </dd>
        <dt>{t('common.rateWithoutVat')}</dt>
        <dd>{row.rateWithoutVat.toFixed(2)}</dd>
        {rooms.length > 0 && (
          <>
            <dt>{t('rentRegister.roomBreakdown')}</dt>
            <dd>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {rooms.map((room) => (
                  <li key={room.roomId ?? room.label}>
                    {room.label}: {room.area.toFixed(2)} × {room.rateWithoutVat.toFixed(2)} ={' '}
                    {room.amountWithoutVat.toFixed(2)}
                  </li>
                ))}
              </ul>
              {row.areaFormula ? <div style={{ marginTop: 6 }}>{row.areaFormula}</div> : null}
            </dd>
          </>
        )}
        <dt>{t('common.totalRent')}</dt>
        <dd>
          {row.totalRent.toFixed(2)} {t('common.currencyByn')} ({year})
        </dd>
        <dt>{t('common.totalReimb')}</dt>
        <dd>
          {row.totalUtil.toFixed(2)} {t('common.currencyByn')}
        </dd>
        <dt>{t('common.debt')}</dt>
        <dd>
          {row.debt.toFixed(2)} {t('common.currencyByn')}
        </dd>
        <dt>{t('common.status')}</dt>
        <dd>{row.status}</dd>
      </dl>
      <div className={listingStyles.formActions}>
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Link to="/tenants-contracts" onClick={onClose}>
          <Button variant="primary">{t('rentRegister.openTenants')}</Button>
        </Link>
      </div>
    </Modal>
  );
}
