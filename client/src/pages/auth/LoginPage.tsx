import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  Briefcase,
  UserCog,
  Calculator,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { loginBgUrl } from '@/lib/assetUrls';
import { useI18n, getRoleLabel } from '@/i18n/useI18n';
import styles from './LoginPage.module.css';

type FormData = { email: string; password: string };

const ROLE_IDS = [
  { id: 'director', icon: Briefcase, email: 'director@rentspace.by' },
  { id: 'manager', icon: UserCog, email: 'manager@rentspace.by' },
  { id: 'accountant', icon: Calculator, email: 'accountant@rentspace.by' },
] as const;

export function LoginPage() {
  const { t } = useI18n();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('login.emailInvalid')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t]
  );

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyBg = body.style.background;
    const prevHtmlHeight = html.style.height;
    const prevBodyHeight = body.style.height;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';
    body.style.background = '#fff';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.height = prevBodyHeight;
      body.style.background = prevBodyBg;
    };
  }, []);

  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const emailValue = watch('email');
  const passwordValue = watch('password');

  const selectRole = (role: (typeof ROLE_IDS)[number]) => {
    setSelectedRole(role.id);
    setValue('email', role.email);
    setValue('password', 'demo1234');
  };

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      const { token, user } = res.data.data;
      setAuth(token, user);
      const dest = ['manager', 'director', 'owner', 'org_admin', 'super_admin'].includes(user.role)
        ? '/manager'
        : '/map';
      navigate(dest);
    } catch {
      setError(t('login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <aside className={styles.left} aria-hidden>
        <img src={loginBgUrl} alt="" className={styles.leftImg} />
      </aside>

      <main className={styles.right}>
        <div className={styles.formCard}>
          <h2>{t('login.title')}</h2>
          <p className={styles.subtitle}>{t('login.lead')}</p>

          <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
            <label className={styles.fieldLabel}>
              <span className={styles.inputWrap}>
                <Mail size={18} className={styles.inputIcon} />
                <input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  {...register('email')}
                />
              </span>
              {errors.email ? (
                <span className={styles.fieldError}>{errors.email.message}</span>
              ) : !emailValue?.trim() ? (
                <span className={styles.fieldHint}>{t('validation.required')}</span>
              ) : null}
            </label>

            <label className={styles.fieldLabel}>
              <span className={styles.inputWrap}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder={t('login.password')}
                  autoComplete="current-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errors.password ? (
                <span className={styles.fieldError}>{errors.password.message}</span>
              ) : !passwordValue?.trim() ? (
                <span className={styles.fieldHint}>{t('validation.required')}</span>
              ) : null}
            </label>

            {error && <p className={styles.formError}>{error}</p>}

            <div className={styles.formRow}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className={`${styles.checkbox} ${remember ? styles.checkboxOn : ''}`}>
                  {remember && <Check size={12} strokeWidth={3} />}
                </span>
                {t('login.remember')}
              </label>
              <a href="#forgot" className={styles.forgot}>
                {t('login.forgot')}
              </a>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? t('login.signingIn') : t('login.submit')}
            </button>
          </form>

          <div className={styles.divider}>
            <span>{t('login.or')}</span>
          </div>

          <p className={styles.roleTitle}>{t('login.pickRole')}</p>
          <div className={styles.roleGrid}>
            {ROLE_IDS.map((role) => {
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  type="button"
                  className={`${styles.roleCard} ${selectedRole === role.id ? styles.roleCardActive : ''}`}
                  onClick={() => selectRole(role)}
                >
                  <Icon size={28} strokeWidth={1.5} />
                  <span>{getRoleLabel(t, role.id)}</span>
                </button>
              );
            })}
          </div>

          <Link to="/" className={styles.backLink}>
            {t('login.backHome')}
          </Link>

          <p className={styles.copyright}>{t('login.copyright')}</p>
        </div>
      </main>
    </div>
  );
}
