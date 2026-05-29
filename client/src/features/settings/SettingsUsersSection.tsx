import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { UserPlus } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useI18n, getRoleLabel } from '@/i18n/useI18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Select } from '@/components/ui/Select';
import styles from '@/pages/app/SettingsPage.module.css';

type OrgUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt?: string | null;
};

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: string;
};

const EMPTY_FORM: CreateUserPayload = {
  name: '',
  email: '',
  password: '',
  role: 'manager',
};

function mapCreateError(t: (k: string) => string, code?: string) {
  if (code === 'email_taken') return t('settings.users.emailTaken');
  if (code === 'role_not_allowed') return t('settings.users.roleNotAllowed');
  if (code === 'invalid_email') return t('settings.users.invalidEmail');
  if (code === 'invalid_password') return t('settings.users.passwordTooShort');
  if (code === 'organization_missing') return t('settings.users.organizationMissing');
  if (code === 'invalid_data') return t('settings.users.invalidData');
  return t('settings.users.createFailed');
}

function validateCreatePayload(
  t: (k: string) => string,
  payload: CreateUserPayload
): string | null {
  const name = payload.name.trim();
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const role = payload.role?.trim();

  if (!name) return t('settings.users.nameRequired');
  if (!email) return t('settings.users.emailRequired');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('settings.users.invalidEmail');
  if (!password || password.length < 8) return t('settings.users.passwordTooShort');
  if (!role) return t('settings.users.roleRequired');
  return null;
}

export function SettingsUsersSection() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const { data: assignableRoles = [] } = useQuery({
    queryKey: ['org-assignable-roles'],
    queryFn: () =>
      api.get('/org/users/assignable-roles').then((r) => r.data.data.roles as string[]),
  });

  const roleOptions = useMemo(
    () =>
      assignableRoles.map((role) => ({
        value: role,
        label: getRoleLabel(t, role),
      })),
    [assignableRoles, t]
  );

  useEffect(() => {
    if (assignableRoles.length && !assignableRoles.includes(form.role)) {
      setForm((f) => ({ ...f, role: assignableRoles[0] }));
    }
  }, [assignableRoles, form.role]);

  const {
    data: users = [],
    isLoading,
    isError: usersError,
  } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => api.get('/org/users').then((r) => r.data.data as OrgUser[]),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-users'] });

  const createUser = useMutation({
    mutationFn: (payload: CreateUserPayload) =>
      api.post('/org/users', {
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        role: payload.role,
      }),
    onSuccess: (_res, payload) => {
      setForm({ ...EMPTY_FORM, role: payload.role });
      setFormError(null);
      setFormSuccess(t('settings.users.created'));
      setTimeout(() => setFormSuccess(null), 4000);
      invalidate();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setFormSuccess(null);
      setFormError(mapCreateError(t, err.response?.data?.error));
    },
  });

  const updateUser = useMutation({
    mutationFn: (payload: { id: number; status?: string; role?: string }) =>
      api.patch(`/org/users/${payload.id}`, {
        status: payload.status,
        role: payload.role,
      }),
    onSuccess: () => invalidate(),
  });

  const resetPwd = useMutation({
    mutationFn: () => api.patch(`/org/users/${resetUserId}/password`, { newPassword: resetPassword }),
    onSuccess: () => {
      setResetUserId(null);
      setResetPassword('');
      setFormSuccess(t('settings.users.passwordReset'));
      setTimeout(() => setFormSuccess(null), 4000);
    },
    onError: () => {
      setFormError(t('settings.users.passwordResetFailed'));
    },
  });

  const syncPassword = (value: string) => {
    setForm((f) => (f.password === value ? f : { ...f, password: value }));
  };

  const submitCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const validationError = validateCreatePayload(t, form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    createUser.mutate({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
    });
  };

  const statusLabel = (status: string) => {
    if (status === 'active') return t('settings.users.statusActive');
    if (status === 'blocked') return t('settings.users.statusBlocked');
    if (status === 'archived') return t('settings.users.statusArchived');
    return status;
  };

  const formatLastLogin = (iso?: string | null) => {
    if (!iso) return t('settings.users.neverLoggedIn');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t('common.dash');
    return d.toLocaleString();
  };

  return (
    <Card className={`${styles.section} ${styles.sectionWide}`}>
      <h2>{t('settings.users.title')}</h2>
      <p className={styles.muted}>{t('settings.users.lead')}</p>

      {formSuccess && <p className={styles.success}>{formSuccess}</p>}
      {formError && <p className={styles.error}>{formError}</p>}

      <form className={styles.usersCreate} onSubmit={submitCreate} noValidate>
        <h3 className={styles.usersSubheading}>{t('settings.users.createTitle')}</h3>
        <div className={styles.usersFormGrid}>
          <Input
            label={t('common.fullName')}
            name="newUserName"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label={t('common.email')}
            name="newUserEmail"
            type="email"
            required
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <PasswordInput
            label={t('settings.users.initialPassword')}
            name="newUserPassword"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => syncPassword(e.target.value)}
            onInput={(e) => syncPassword(e.currentTarget.value)}
          />
          <Select
            label={t('common.role')}
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            options={roleOptions.length ? roleOptions : [{ value: 'manager', label: getRoleLabel(t, 'manager') }]}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={createUser.isPending}
        >
          <UserPlus size={18} />{' '}
          {createUser.isPending ? t('common.saving') : t('settings.users.createBtn')}
        </Button>
      </form>

      <h3 className={styles.usersSubheading}>{t('settings.users.listTitle')}</h3>
      {usersError && <p className={styles.error}>{t('settings.users.loadFailed')}</p>}
      <div className={styles.usersTableWrap}>
        <table className={styles.usersTable}>
          <thead>
            <tr>
              <th>{t('common.fullName')}</th>
              <th>{t('common.email')}</th>
              <th>{t('common.role')}</th>
              <th>{t('common.status')}</th>
              <th>{t('settings.users.lastLogin')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6}>{t('common.loading')}</td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6}>{t('common.noData')}</td>
              </tr>
            )}
            {!isLoading &&
              users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {isSelf ? (
                        getRoleLabel(t, u.role)
                      ) : (
                        <Select
                          inline
                          className={styles.usersRoleSelect}
                          value={u.role}
                          onChange={(role) => updateUser.mutate({ id: u.id, role })}
                          options={roleOptions}
                          disabled={updateUser.isPending}
                        />
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          u.status === 'active' ? styles.userStatusActive : styles.userStatusBlocked
                        }
                      >
                        {statusLabel(u.status)}
                      </span>
                    </td>
                    <td className={styles.usersMutedCell}>{formatLastLogin(u.lastLoginAt)}</td>
                    <td>
                      <div className={styles.usersActions}>
                        {!isSelf && (
                          <Button
                            variant="surface"
                            type="button"
                            disabled={updateUser.isPending}
                            onClick={() =>
                              updateUser.mutate({
                                id: u.id,
                                status: u.status === 'active' ? 'blocked' : 'active',
                              })
                            }
                          >
                            {u.status === 'active'
                              ? t('settings.users.block')
                              : t('settings.users.unblock')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => {
                            setResetUserId(u.id);
                            setResetPassword('');
                            setFormError(null);
                          }}
                        >
                          {t('settings.users.resetPassword')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {resetUserId != null && (
        <div className={styles.usersResetBox}>
          <h3 className={styles.usersSubheading}>
            {t('settings.users.resetPasswordFor', {
              name: users.find((u) => u.id === resetUserId)?.name ?? '',
            })}
          </h3>
          <div className={styles.usersResetRow}>
            <PasswordInput
              label={t('settings.users.newPasswordLabel')}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button
              variant="primary"
              type="button"
              disabled={resetPassword.length < 8 || resetPwd.isPending}
              onClick={() => resetPwd.mutate()}
            >
              {resetPwd.isPending ? t('common.saving') : t('settings.users.savePassword')}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setResetUserId(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
