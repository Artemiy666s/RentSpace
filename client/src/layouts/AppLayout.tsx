import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  LayoutGrid,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getMainBackgroundStyle, isDarkWallpaper } from '@/constants/appBackgrounds';
import { useEffectiveAppBackgroundId } from '@/hooks/useEffectiveAppBackground';
import { useStandalonePwa } from '@/hooks/useStandalonePwa';
import { useI18n, getRoleLabel } from '@/i18n/useI18n';
import {
  NAV_ITEMS,
  ROUTE_TITLE_KEYS,
  filterNavByRole,
  splitMobileNav,
  getHomeRoute,
} from './mobileNavConfig';
import styles from './AppLayout.module.css';

const SIDEBAR_COLLAPSED_KEY = 'rentspace-sidebar-collapsed';

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  useStandalonePwa();

  const [moreOpen, setMoreOpen] = useState(false);
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

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleNav = useMemo(() => filterNavByRole(NAV_ITEMS, user?.role), [user?.role]);
  const { tabs: mobileTabs, more: mobileMore } = useMemo(() => splitMobileNav(visibleNav), [visibleNav]);

  const homeRoute = getHomeRoute(user?.role);
  const toggleSidebar = () => setSidebarCollapsed((v) => !v);
  const effectiveBackgroundId = useEffectiveAppBackgroundId();
  const mainBgStyle = getMainBackgroundStyle(effectiveBackgroundId);
  const hasImageBg = effectiveBackgroundId !== 'gradient';
  const darkWallpaper = isDarkWallpaper(effectiveBackgroundId);
  const roleLabel = getRoleLabel(t, user?.role);
  const collapseTitle = sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar');

  const pageTitleKey = ROUTE_TITLE_KEYS[location.pathname];
  const pageTitle = pageTitleKey ? t(pageTitleKey) : t('common.appName');

  const moreActive = mobileMore.some((item) => location.pathname === item.to);

  return (
    <div
      className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ''} ${moreOpen ? styles.shellMoreOpen : ''}`}
    >
      {/* ——— Desktop sidebar ——— */}
      <aside
        className={`${styles.sidebar} ${styles.sidebarDesktop} ${sidebarCollapsed ? styles.sidebarCollapsed : ''} ${darkWallpaper ? styles.sidebarDark : ''}`}
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
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
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

      {/* ——— Main ——— */}
      <div
        className={`${styles.main} ${hasImageBg ? styles.mainWithImage : ''} ${darkWallpaper ? styles.mainDark : ''}`}
        style={mainBgStyle}
      >
        <header className={styles.mobileHeader}>
          <div className={styles.mobileHeaderMain}>
            <h1 className={styles.mobilePageTitle}>{pageTitle}</h1>
            <p className={styles.mobilePageMeta}>
              {t('common.propertyName')} · {roleLabel}
            </p>
          </div>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${styles.mobileHeaderAction} ${isActive ? styles.mobileHeaderActionActive : ''}`}
            aria-label={t('nav.settings')}
          >
            <img src="/images/logo-mark.png" alt="" width={28} height={28} />
          </NavLink>
        </header>

        <div className={styles.content}>
          <Outlet />
        </div>

        {/* ——— Mobile bottom navigation ——— */}
        <nav className={styles.bottomNav} aria-label={t('nav.mobileMain')}>
          {mobileTabs.map(({ to, icon: Icon, labelKey }) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `${styles.bottomTab} ${isActive ? styles.bottomTabActive : ''}`}
              >
                <Icon size={22} strokeWidth={2} aria-hidden />
                <span>{label}</span>
              </NavLink>
            );
          })}
          {mobileMore.length > 0 && (
            <button
              type="button"
              className={`${styles.bottomTab} ${moreOpen || moreActive ? styles.bottomTabActive : ''}`}
              onClick={() => setMoreOpen(true)}
              aria-label={t('nav.more')}
              aria-expanded={moreOpen}
            >
              <LayoutGrid size={22} strokeWidth={2} aria-hidden />
              <span>{t('nav.more')}</span>
            </button>
          )}
        </nav>
      </div>

      {/* ——— «Ещё» — нижняя панель ——— */}
      {mobileMore.length > 0 && (
        <>
          <button
            type="button"
            className={`${styles.moreBackdrop} ${moreOpen ? styles.moreBackdropVisible : ''}`}
            aria-label={t('common.closeMenu')}
            tabIndex={moreOpen ? 0 : -1}
            onClick={() => setMoreOpen(false)}
          />
          <div
            className={`${styles.moreSheet} ${moreOpen ? styles.moreSheetOpen : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.more')}
          >
            <div className={styles.moreSheetHandle} aria-hidden />
            <div className={styles.moreSheetHead}>
              <strong>{t('nav.more')}</strong>
              <button type="button" className={styles.moreClose} onClick={() => setMoreOpen(false)} aria-label={t('common.closeMenu')}>
                <X size={22} />
              </button>
            </div>
            <div className={styles.moreUser}>
              <div>
                <strong>{user?.name}</strong>
                <small>{roleLabel}</small>
              </div>
              <button type="button" className={styles.moreLogout} onClick={handleLogout}>
                <LogOut size={18} />
                {t('common.logout')}
              </button>
            </div>
            <div className={styles.moreGrid}>
              {mobileMore.map(({ to, icon: Icon, labelKey }) => {
                const label = t(labelKey);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `${styles.moreItem} ${isActive ? styles.moreItemActive : ''}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon size={22} aria-hidden />
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
