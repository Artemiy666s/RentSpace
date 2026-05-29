import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Map,
  Building2,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  ClipboardList,
  Table2,
  Receipt,
  TrendingUp,
  Wallet,
  CalendarCheck,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { getMainBackgroundStyle, isDarkWallpaper } from '@/constants/appBackgrounds';
import { useEffectiveAppBackgroundId } from '@/hooks/useEffectiveAppBackground';
import { useI18n, getRoleLabel } from '@/i18n/useI18n';
import styles from './AppLayout.module.css';

const SIDEBAR_COLLAPSED_KEY = 'rentspace-sidebar-collapsed';

const navItems = [
  {
    to: '/manager',
    icon: ClipboardList,
    labelKey: 'nav.home',
    roles: ['manager', 'director', 'owner', 'org_admin', 'super_admin'],
  },
  { to: '/map', icon: Map, labelKey: 'nav.roomMap', roles: ['manager', 'owner', 'director', 'org_admin', 'super_admin', 'accountant', 'viewer'] },
  { to: '/manager-data', icon: Database, labelKey: 'nav.allData', roles: ['manager', 'director', 'org_admin', 'super_admin'] },
  { to: '/rooms', icon: Building2, labelKey: 'nav.rooms', roles: ['manager', 'owner', 'director', 'org_admin', 'super_admin', 'accountant', 'viewer'] },
  { to: '/tenants-contracts', icon: Users, labelKey: 'nav.tenants', roles: ['manager', 'accountant', 'owner', 'director', 'org_admin', 'super_admin'] },
  { to: '/rent-register', icon: Receipt, labelKey: 'nav.rentRegister', roles: ['manager', 'accountant', 'owner', 'director', 'org_admin', 'super_admin'] },
  { to: '/charges', icon: FileText, labelKey: 'nav.charges', roles: ['accountant', 'org_admin', 'super_admin', 'manager', 'director'] },
  { to: '/payments', icon: CreditCard, labelKey: 'nav.payments', roles: ['accountant', 'manager', 'owner', 'director', 'org_admin', 'super_admin'] },
  { to: '/expenses', icon: Wallet, labelKey: 'nav.expenses', roles: ['manager', 'director', 'accountant', 'org_admin', 'super_admin'] },
  { to: '/plan-fact', icon: TrendingUp, labelKey: 'nav.planFact', roles: ['manager', 'owner', 'director', 'accountant', 'org_admin', 'super_admin'] },
  { to: '/month-close', icon: CalendarCheck, labelKey: 'nav.monthClose', roles: ['manager', 'director', 'org_admin', 'super_admin'] },
  { to: '/reports', icon: BarChart3, labelKey: 'nav.reports', roles: ['owner', 'director', 'accountant', 'org_admin', 'super_admin'] },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', roles: ['manager', 'org_admin', 'super_admin', 'owner', 'director', 'accountant'] },
  { to: '/map-editor', icon: Table2, labelKey: 'nav.mapEditor', roles: ['manager', 'director', 'org_admin', 'super_admin'] },
];

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleNav = useMemo(
    () => navItems.filter((item) => !user?.role || item.roles.includes(user.role)),
    [user?.role]
  );

  const homeRoute = ['manager', 'director', 'owner', 'org_admin', 'super_admin'].includes(user?.role ?? '')
    ? '/manager'
    : '/map';
  const toggleSidebar = () => setSidebarCollapsed((v) => !v);
  const effectiveBackgroundId = useEffectiveAppBackgroundId();
  const mainBgStyle = getMainBackgroundStyle(effectiveBackgroundId);
  const hasImageBg = effectiveBackgroundId !== 'gradient';
  const darkWallpaper = isDarkWallpaper(effectiveBackgroundId);
  const roleLabel = getRoleLabel(t, user?.role);
  const collapseTitle = sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar');

  return (
    <div className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ''}`}>
      <aside
        className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''} ${darkWallpaper ? styles.sidebarDark : ''}`}
      >
        <div className={styles.sidebarOverlay} aria-hidden />
        <div className={styles.sidebarInner}>
        <div className={styles.sidebarHeader}>
          <NavLink
            to={homeRoute}
            title={sidebarCollapsed ? t('common.appName') : undefined}
            className={({ isActive }) =>
              `${styles.navLink} ${styles.brandHome} ${isActive ? styles.active : styles.brandHomeIdle}`
            }
          >
            <img src="/images/logo-mark.png" alt="" className={styles.brandLogo} />
            <span className={`${styles.navLabel} ${styles.brandName}`}>{t('common.appName')}</span>
          </NavLink>
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={toggleSidebar}
            title={collapseTitle}
            aria-label={collapseTitle}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <div className={styles.propertyCard} title={sidebarCollapsed ? t('common.propertyName') : undefined}>
          <span className={styles.propertyLabel}>{t('common.object')}</span>
          <strong>{t('common.propertyName')}</strong>
          <small>{t('common.propertyCity')}</small>
        </div>
        <nav className={styles.nav}>
          {visibleNav.map(({ to, icon: Icon, labelKey }) => {
            const label = t(labelKey);
            return (
            <NavLink
              key={to}
              to={to}
              title={sidebarCollapsed ? label : undefined}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
            >
              <Icon size={20} className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
            </NavLink>
          );
          })}
        </nav>
        <div className={styles.userBlock}>
          <div className={styles.userInfo} title={sidebarCollapsed ? user?.name : undefined}>
            <strong>{user?.name}</strong>
            <small>{roleLabel}</small>
          </div>
          <button type="button" className={styles.logoutBtn} onClick={handleLogout} aria-label={t('common.logout')}>
            <LogOut size={18} />
          </button>
        </div>
        </div>
      </aside>
      <div
        className={`${styles.main} ${hasImageBg ? styles.mainWithImage : ''} ${darkWallpaper ? styles.mainDark : ''}`}
        style={mainBgStyle}
      >
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
