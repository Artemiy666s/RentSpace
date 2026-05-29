import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/useI18n';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import listingStyles from '@/styles/listingPage.module.css';

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
