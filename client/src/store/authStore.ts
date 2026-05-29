import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'owner'
  | 'director'
  | 'manager'
  | 'accountant'
  | 'viewer';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  organizationId: number | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'rentspace-auth' }
  )
);
