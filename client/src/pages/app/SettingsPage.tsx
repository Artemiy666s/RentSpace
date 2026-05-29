import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { AppBackgroundId } from '@/constants/appBackgrounds';
import { isNightPeriod } from '@/constants/appBackgrounds';
import { getLocalizedBackgrounds } from '@/i18n/backgrounds';
import { useEffectiveAppBackgroundId } from '@/hooks/useEffectiveAppBackground';
import { useI18n, getRoleLabel } from '@/i18n/useI18n';
import { LOCALES, type Locale } from '@/i18n/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { hasRole, ORG_DATA_ADMIN_ROLES, ORG_USER_ADMIN_ROLES, MAP_EDITOR_ROLES } from '@/constants/roles';
import { SettingsUsersSection } from '@/features/settings/SettingsUsersSection';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { propertyId } = usePropertyStore();
  const appBackgroundId = usePreferencesStore((s) => s.appBackgroundId);
  const autoWallpaperByTime = usePreferencesStore((s) => s.autoWallpaperByTime);
  const setAppBackgroundId = usePreferencesStore((s) => s.setAppBackgroundId);
  const setAutoWallpaperByTime = usePreferencesStore((s) => s.setAutoWallpaperByTime);
  const effectiveBackgroundId = useEffectiveAppBackgroundId();
  const backgrounds = getLocalizedBackgrounds(locale);
  const activeBackgroundId = autoWallpaperByTime ? effectiveBackgroundId : appBackgroundId;

  const [name, setName] = useState(user?.name ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState(user?.email ?? '');

  useEffect(() => {
    setNewEmail(user?.email ?? '');
  }, [user?.email]);
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const mapPasswordApiError = (code?: string) => {
    if (code === 'wrong_current_password') return t('settings.wrongCurrentPassword');
    if (code === 'invalid_password') return t('settings.newPasswordTooShort');
    if (code === 'password_unchanged') return t('settings.passwordUnchanged');
    return t('settings.passwordChangeFailed');
  };

  const mapEmailApiError = (code?: string) => {
    if (code === 'wrong_current_password') return t('settings.wrongCurrentPassword');
    if (code === 'invalid_email') return t('settings.invalidEmail');
    if (code === 'email_taken') return t('settings.emailTaken');
    if (code === 'email_unchanged') return t('settings.emailUnchanged');
    return t('settings.emailChangeFailed');
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const res = await api.patch('/auth/me', { name: name.trim() });
      return res.data.data.user;
    },
    onSuccess: (u) => {
      updateUser({ name: u.name });
      setProfileMsg(t('common.profileSaved'));
      setTimeout(() => setProfileMsg(null), 3000);
    },
    onError: () => setProfileMsg(t('common.profileSaveFailed')),
  });

  const changeEmail = useMutation({
    mutationFn: async () => {
      const res = await api.patch('/auth/me/email', {
        email: newEmail.trim(),
        currentPassword: emailConfirmPassword,
      });
      return res.data.data.user;
    },
    onSuccess: (u) => {
      updateUser({ email: u.email });
      setEmailConfirmPassword('');
      setEmailError(null);
      setEmailMsg(t('settings.emailChanged'));
      setTimeout(() => setEmailMsg(null), 4000);
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setEmailMsg(null);
      setEmailError(mapEmailApiError(err.response?.data?.error));
    },
  });

  const submitEmailChange = () => {
    setEmailMsg(null);
    setEmailError(null);
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('settings.invalidEmail'));
      return;
    }
    if (trimmed === (user?.email ?? '').toLowerCase()) {
      setEmailError(t('settings.emailUnchanged'));
      return;
    }
    changeEmail.mutate();
  };

  const changePassword = useMutation({
    mutationFn: async () => {
      const res = await api.patch('/auth/me/password', {
        currentPassword,
        newPassword,
      });
      return res.data;
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setPasswordMsg(t('settings.passwordChanged'));
      setTimeout(() => setPasswordMsg(null), 4000);
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setPasswordMsg(null);
      setPasswordError(mapPasswordApiError(err.response?.data?.error));
    },
  });

  const submitPasswordChange = () => {
    setPasswordMsg(null);
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError(t('settings.newPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordsMismatch'));
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError(t('settings.passwordUnchanged'));
      return;
    }
    changePassword.mutate();
  };

  const importExcel = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('propertyId', String(propertyId || 1));
      const res = await api.post('/import/excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => setResult(data),
  });

  const isAdmin = hasRole(user?.role, ORG_DATA_ADMIN_ROLES);
  const canManageUsers = hasRole(user?.role, ORG_USER_ADMIN_ROLES);
  const canEditMaps = hasRole(user?.role, MAP_EDITOR_ROLES);
  const roleDisplay = getRoleLabel(t, user?.role);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>{t('settings.title')}</h1>
        <p className={styles.lead}>{t('settings.lead')}</p>
      </header>

      <div className={styles.grid}>
        <Card className={styles.section}>
          <h2>{t('settings.personal')}</h2>
          <p className={styles.muted}>{t('settings.nameInGreeting')}</p>
          <div className={styles.formStack}>
            <Input label={t('common.fullName')} required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={t('common.email')} value={user?.email ?? ''} disabled />
            <Input label={t('common.role')} value={roleDisplay} disabled />
          </div>
          {profileMsg && <p className={styles.success}>{profileMsg}</p>}
          <Button
            variant="primary"
            onClick={() => saveProfile.mutate()}
            disabled={!name.trim() || saveProfile.isPending}
          >
            {saveProfile.isPending ? t('common.saving') : t('common.saveProfile')}
          </Button>
        </Card>

        <Card className={styles.section}>
          <h2>{t('settings.emailChange')}</h2>
          <p className={styles.muted}>{t('settings.emailHint')}</p>
          <p className={styles.muted}>
            {t('common.email')}: <strong>{user?.email}</strong>
          </p>
          <div className={styles.formStack}>
            <Input
              label={t('settings.newEmail')}
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <PasswordInput
              label={t('settings.confirmWithPassword')}
              autoComplete="current-password"
              required
              value={emailConfirmPassword}
              onChange={(e) => setEmailConfirmPassword(e.target.value)}
            />
          </div>
          {emailMsg && <p className={styles.success}>{emailMsg}</p>}
          {emailError && <p className={styles.error}>{emailError}</p>}
          <Button
            variant="primary"
            onClick={submitEmailChange}
            disabled={
              !newEmail.trim() ||
              !emailConfirmPassword ||
              changeEmail.isPending
            }
          >
            {changeEmail.isPending ? t('common.saving') : t('settings.changeEmail')}
          </Button>
        </Card>

        <Card className={styles.section}>
          <h2>{t('settings.password')}</h2>
          <p className={styles.muted}>{t('settings.passwordHint')}</p>
          <div className={styles.formStack}>
            <PasswordInput
              label={t('settings.currentPassword')}
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <PasswordInput
              label={t('settings.newPassword')}
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordInput
              label={t('settings.confirmPassword')}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordMsg && <p className={styles.success}>{passwordMsg}</p>}
          {passwordError && <p className={styles.error}>{passwordError}</p>}
          <Button
            variant="primary"
            onClick={submitPasswordChange}
            disabled={
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              changePassword.isPending
            }
          >
            {changePassword.isPending ? t('common.saving') : t('settings.changePassword')}
          </Button>
        </Card>

        <Card className={styles.section}>
          <h2>{t('common.language')}</h2>
          <p className={styles.muted}>{t('common.languageHint')}</p>
          <div className={styles.langRow}>
            {LOCALES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`${styles.langBtn} ${locale === id ? styles.langBtnActive : ''}`}
                onClick={() => setLocale(id as Locale)}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.section}>
          <h2>{t('settings.workspaceBg')}</h2>
          <p className={styles.muted}>{t('settings.workspaceBgHint')}</p>
          <label className={styles.autoWallpaperRow}>
            <input
              type="checkbox"
              className={styles.autoWallpaperCheck}
              checked={autoWallpaperByTime}
              onChange={(e) => setAutoWallpaperByTime(e.target.checked)}
            />
            <span className={styles.autoWallpaperText}>
              <strong>{t('settings.autoWallpaper')}</strong>
              <span className={styles.autoWallpaperHint}>{t('settings.autoWallpaperHint')}</span>
            </span>
          </label>
          {autoWallpaperByTime && (
            <p className={styles.autoWallpaperStatus}>
              {isNightPeriod() ? t('settings.autoWallpaperNowNight') : t('settings.autoWallpaperNowDay')}
            </p>
          )}
          {autoWallpaperByTime && (
            <p className={styles.muted}>{t('settings.autoWallpaperPickerLocked')}</p>
          )}
          <div className={`${styles.bgGrid} ${autoWallpaperByTime ? styles.bgGridLocked : ''}`}>
            {backgrounds.map((bg) => (
              <button
                key={bg.id}
                type="button"
                disabled={autoWallpaperByTime}
                className={`${styles.bgOption} ${activeBackgroundId === bg.id ? styles.bgOptionActive : ''}`}
                onClick={() => setAppBackgroundId(bg.id as AppBackgroundId)}
              >
                <span
                  className={styles.bgPreview}
                  style={{
                    background: bg.imageUrl
                      ? `url(${bg.imageUrl}) center/cover no-repeat`
                      : bg.preview,
                  }}
                />
                <span className={styles.bgLabel}>{bg.label}</span>
                <span className={styles.bgDesc}>{bg.description}</span>
              </button>
            ))}
          </div>
        </Card>

        {canManageUsers && <SettingsUsersSection />}

        {isAdmin && (
          <Card className={`${styles.section} ${styles.sectionWide}`}>
            <h2>{t('settings.importExcel')}</h2>
            <p className={styles.muted}>
              {t('settings.importExcelHint')}{' '}
              <code>{t('settings.importFileName')}</code>
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Button
              variant="primary"
              onClick={() => importExcel.mutate()}
              disabled={!file || importExcel.isPending}
            >
              {importExcel.isPending ? t('common.import') : t('common.runImport')}
            </Button>
            {result && <pre className={styles.result}>{JSON.stringify(result, null, 2)}</pre>}
          </Card>
        )}

        {(canEditMaps || isAdmin) && (
          <Card className={styles.section}>
            <h2>{t('settings.mapAndPlans')}</h2>
            <p className={styles.muted}>
              <Link to="/map-editor">{t('settings.mapEditorLink')}</Link> {t('settings.mapEditorDesc')}
            </p>
            <p className={styles.muted}>
              <Link to="/map">{t('settings.roomMapLink')}</Link> {t('settings.roomMapDesc')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
