import { Link } from 'react-router-dom';
import {
  FileSearch,
  AlertTriangle,
  CalendarX,
  Wallet,
  Clock,
  Mail,
  Users,
  Rocket,
  Play,
  Phone,
} from 'lucide-react';
import { landingBgUrl } from '@/lib/assetUrls';
import styles from './LandingPage.module.css';

const PROBLEMS = [
  { icon: FileSearch, title: 'Нет актуальной картины', text: 'Данные в разных файлах — невозможно быстро увидеть свободные площади и долги.' },
  { icon: AlertTriangle, title: 'Ошибки и дубли', text: 'Ручной ввод в Excel приводит к ошибкам в начислениях и договорах.' },
  { icon: CalendarX, title: 'Срывы сроков', text: 'Просроченные договоры и платежи теряются без единой системы напоминаний.' },
  { icon: Wallet, title: 'Потери денег', text: 'Неточный учёт площадей и ставок снижает доход от аренды.' },
  { icon: Clock, title: 'Потеря времени', text: 'Часы уходят на сводки вместо работы с арендаторами.' },
];

const STEPS = [
  { num: 1, icon: FileSearch, title: 'Аудит и перенос данных', text: 'Импортируем ваш Excel: арендаторы, договоры, начисления.' },
  { num: 2, icon: Mail, title: 'Настройка и план здания', text: 'Интерактивные SVG-планы по схемам ТРК и объектов.' },
  { num: 3, icon: Users, title: 'Обучение команды', text: 'Заведующая, бухгалтер и директор работают в одной системе.' },
  { num: 4, icon: Rocket, title: 'Запуск и поддержка', text: 'Сопровождение после внедрения и развитие платформы.' },
];

const LEGEND = [
  { color: '#5FD068', label: 'Свободно' },
  { color: '#FFFFFF', label: 'Сдано', border: true },
  { color: '#FFE69A', label: 'Переговоры' },
  { color: '#FFD4A8', label: 'Бронь' },
  { color: '#FFB8B8', label: 'Задолженность' },
  { color: '#E8E8E8', label: 'Ремонт' },
];

const FLOOR_ROOMS = [
  ['#5FD068', '#fff', '#FFE69A', '#fff', '#FFB8B8', '#fff', '#E8E8E8', '#5FD068'],
  ['#fff', '#5FD068', '#fff', '#FFD4A8', '#fff', '#FFE69A', '#fff', '#5FD068'],
];

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.siteHeader}>
        <div className={styles.siteHeaderInner}>
          <Link to="/" className={styles.logo}>
            <img src="/images/logo.png" alt="" className={styles.logoImg} />
            <span className={styles.logoText}>RentSpace.by</span>
          </Link>
          <nav className={styles.nav}>
            <a href="#features">Возможности</a>
            <a href="#solutions">Решения</a>
            <a href="#clients">Клиенты</a>
            <a href="#pricing">Тарифы</a>
            <a href="#about">О компании</a>
          </nav>
          <div className={styles.headerRight}>
            <a href="tel:+375291234567" className={styles.phone}>
              <Phone size={16} />
              +375 29 123-45-67
            </a>
            <Link to="/login" className={styles.btnCabinet}>
              Личный кабинет
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div
          className={styles.heroBg}
          style={{ backgroundImage: `url(${landingBgUrl})` }}
          aria-hidden
        />
        <div className={styles.heroShell}>
        <div className={styles.heroBody}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1>
              <span className={styles.green}>Управляйте арендой</span>
              <br />
              пространств в ТРЦ и коммерческой недвижимости
            </h1>
            <p className={styles.heroSub}>
              Единая платформа для управления арендаторами, площадями, договорами и платежами — всё в одном месте.
            </p>
            <div className={styles.heroCta}>
              <a href="#contact" className={styles.btnDemo}>
                Запросить демо
              </a>
              <a href="#features" className={styles.btnOutline}>
                Посмотреть как это работает
              </a>
            </div>
            <div className={styles.heroStats}>
              <div>
                <strong>№1</strong>
                <span>платформа для управления арендой</span>
              </div>
              <div>
                <strong>&gt; 150</strong>
                <span>управляемых объектов используют RentSpace.by</span>
              </div>
              <div>
                <strong>99,9%</strong>
                <span>доступность сервиса</span>
              </div>
            </div>

            <div className={styles.videoCard}>
              <div className={styles.videoThumb}>
                <button type="button" className={styles.playBtn} aria-label="Смотреть видео">
                  <Play size={18} fill="currentColor" />
                </button>
              </div>
              <div>
                <strong>Краткий обзор платформы</strong>
                <span>2:15 мин</span>
                <p>Посмотрите, как RentSpace.by упрощает управление арендой</p>
              </div>
            </div>
          </div>
          <div className={styles.heroVisual} aria-hidden />
        </div>
        </div>
        </div>
      </section>

      {/* Excel problems */}
      <section id="features" className={styles.sectionLight}>
        <h2 className={styles.sectionTitle}>Excel больше не справляется?</h2>
        <div className={styles.problemsGrid}>
          {PROBLEMS.map(({ icon: Icon, title, text }) => (
            <article key={title} className={styles.problemCard}>
              <div className={styles.problemIcon}>
                <Icon size={28} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4 steps */}
      <section id="solutions" className={styles.sectionLight}>
        <h2 className={styles.sectionTitle}>Внедрение за 4 простых шага</h2>
        <div className={styles.stepsRow}>
          {STEPS.map((step, i) => (
            <div key={step.num} className={styles.stepWrap}>
              {i > 0 && <span className={styles.stepArrow} aria-hidden>→</span>}
              <article className={styles.stepCard}>
                <span className={styles.stepNum}>{step.num}</span>
                <div className={styles.stepIcon}>
                  <step.icon size={32} strokeWidth={1.5} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            </div>
          ))}
        </div>
      </section>

      {/* Floor plan */}
      <section id="clients" className={styles.sectionLight}>
        <div className={styles.floorHeader}>
          <h2 className={styles.floorTitle}>Интерактивный план помещений</h2>
          <div className={styles.legend}>
            {LEGEND.map((item) => (
              <span key={item.label} className={styles.legendItem}>
                <i
                  className={styles.legendSwatch}
                  style={{
                    background: item.color,
                    border: item.border ? '1px solid #ccc' : 'none',
                  }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.floorBlock}>
          <div className={styles.floorPlan}>
            {FLOOR_ROOMS.map((row, ri) => (
              <div key={ri} className={styles.floorRow}>
                {row.map((color, ci) => (
                  <div
                    key={ci}
                    className={styles.floorCell}
                    style={{
                      background: color,
                      border: color === '#fff' ? '1px solid #d0d8e4' : 'none',
                    }}
                  >
                    {101 + ri * 8 + ci}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.floorSide}>
            <button type="button" className={styles.floorBtnActive}>Этаж 1</button>
            <button type="button" className={styles.floorBtn}>Этаж 2</button>
            <button type="button" className={styles.floorBtn}>Этаж 3</button>
          </div>
        </div>
        <Link to="/login" className={styles.btnPlanDemo}>
          Смотреть демо плана
        </Link>
      </section>

      <section id="pricing" className={styles.sectionLight}>
        <div id="contact" className={styles.ctaBox}>
          <h2>Готовы перейти с Excel на RentSpace.by?</h2>
          <p>Оставьте заявку — покажем демо на данных вашего объекта</p>
          <form className={styles.ctaForm} onSubmit={(e) => e.preventDefault()}>
            <input type="text" placeholder="Ваше имя" />
            <input type="tel" placeholder="+375 (__) ___-__-__" />
            <button type="submit" className={styles.btnDemo}>
              Отправить заявку
            </button>
          </form>
        </div>
      </section>

      <footer className={styles.footer}>
        <img src="/images/logo.png" alt="" className={styles.footerLogo} />
        <span>© RentSpace.by, {new Date().getFullYear()}. Все права защищены.</span>
      </footer>
    </div>
  );
}
