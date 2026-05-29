import { Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.css';

export function AuthLayout() {
  return (
    <div className={styles.wrap}>
      <Outlet />
    </div>
  );
}
