import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/app/HomePage';
import { useAuthStore } from '@/store/authStore';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { LandingPage } from '@/pages/public/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { MapPage } from '@/pages/app/MapPage';
import { TenantsContractsPage } from '@/pages/app/TenantsContractsPage';
import { ReportsPage } from '@/pages/app/ReportsPage';
import { SettingsPage } from '@/pages/app/SettingsPage';
import { MapEditorPage } from '@/pages/app/MapEditorPage';
import { RentRegisterPage } from '@/pages/app/RentRegisterPage';
import { PlanFactPage } from '@/pages/app/PlanFactPage';
import { ExpensesPage } from '@/pages/app/ExpensesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/manager" element={<HomePage />} />
        <Route path="/dashboard" element={<Navigate to="/manager" replace />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/map-editor" element={<MapEditorPage />} />
        <Route path="/tenants-contracts" element={<TenantsContractsPage />} />
        <Route path="/rent-register" element={<RentRegisterPage />} />
        <Route path="/plan-fact" element={<PlanFactPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Устаревшие разделы — редиректы для закладок */}
        <Route path="/rooms" element={<Navigate to="/map" replace />} />
        <Route path="/payments" element={<Navigate to="/rent-register" replace />} />
        <Route path="/charges" element={<Navigate to="/rent-register" replace />} />
        <Route path="/month-close" element={<Navigate to="/manager" replace />} />
        <Route path="/manager-data" element={<Navigate to="/manager" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
