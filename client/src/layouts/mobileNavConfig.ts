import type { LucideIcon } from 'lucide-react';
import {
  Map,
  Users,
  BarChart3,
  Settings,
  ClipboardList,
  Table2,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export type NavItemDef = {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  roles: string[];
};

/** Упрощённое меню под заказчика: без помещений, платежей, начислений, закрытия месяца и «всех данных». */
export const NAV_ITEMS: NavItemDef[] = [
  {
    to: '/manager',
    icon: ClipboardList,
    labelKey: 'nav.home',
    roles: ['manager', 'director', 'owner', 'org_admin', 'super_admin'],
  },
  {
    to: '/map',
    icon: Map,
    labelKey: 'nav.roomMap',
    roles: ['manager', 'owner', 'director', 'org_admin', 'super_admin', 'accountant', 'viewer'],
  },
  {
    to: '/tenants-contracts',
    icon: Users,
    labelKey: 'nav.tenants',
    roles: ['manager', 'accountant', 'owner', 'director', 'org_admin', 'super_admin'],
  },
  {
    to: '/rent-register',
    icon: Receipt,
    labelKey: 'nav.rentRegister',
    roles: ['manager', 'accountant', 'owner', 'director', 'org_admin', 'super_admin'],
  },
  {
    to: '/expenses',
    icon: Wallet,
    labelKey: 'nav.expenses',
    roles: ['manager', 'director', 'accountant', 'org_admin', 'super_admin'],
  },
  {
    to: '/plan-fact',
    icon: TrendingUp,
    labelKey: 'nav.planFact',
    roles: ['manager', 'owner', 'director', 'accountant', 'org_admin', 'super_admin'],
  },
  {
    to: '/reports',
    icon: BarChart3,
    labelKey: 'nav.reports',
    roles: ['owner', 'director', 'accountant', 'org_admin', 'super_admin'],
  },
  {
    to: '/map-editor',
    icon: Table2,
    labelKey: 'nav.mapEditor',
    roles: ['manager', 'director', 'org_admin', 'super_admin'],
  },
  {
    to: '/settings',
    icon: Settings,
    labelKey: 'nav.settings',
    roles: ['manager', 'org_admin', 'super_admin', 'owner', 'director', 'accountant'],
  },
];

export const MOBILE_TAB_PRIORITY = [
  '/manager',
  '/map',
  '/tenants-contracts',
  '/rent-register',
] as const;

export const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/manager': 'nav.home',
  '/dashboard': 'nav.home',
  '/map': 'nav.roomMap',
  '/map-editor': 'nav.mapEditor',
  '/tenants-contracts': 'nav.tenants',
  '/rent-register': 'nav.rentRegister',
  '/expenses': 'nav.expenses',
  '/plan-fact': 'nav.planFact',
  '/reports': 'nav.reports',
  '/settings': 'nav.settings',
};

export function filterNavByRole(items: NavItemDef[], role?: string) {
  return items.filter((item) => !role || item.roles.includes(role));
}

export function splitMobileNav(items: NavItemDef[]) {
  const tabPaths = new Set<string>();
  const tabs: NavItemDef[] = [];
  for (const path of MOBILE_TAB_PRIORITY) {
    const item = items.find((i) => i.to === path);
    if (item && tabs.length < 4) {
      tabs.push(item);
      tabPaths.add(path);
    }
  }
  if (tabs.length < 4) {
    for (const item of items) {
      if (tabs.length >= 4 || tabPaths.has(item.to)) continue;
      tabs.push(item);
      tabPaths.add(item.to);
    }
  }
  const more = items.filter((i) => !tabPaths.has(i.to));
  return { tabs, more };
}

export function getHomeRoute(role?: string) {
  return ['manager', 'director', 'owner', 'org_admin', 'super_admin'].includes(role ?? '')
    ? '/manager'
    : '/map';
}
