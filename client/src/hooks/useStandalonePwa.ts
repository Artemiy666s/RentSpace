import { useEffect } from 'react';

/** Помечает document для стилей «установленного» веб-приложения. */
export function useStandalonePwa() {
  useEffect(() => {
    const apply = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        // Safari iOS
        (typeof navigator !== 'undefined' &&
          'standalone' in navigator &&
          (navigator as Navigator & { standalone?: boolean }).standalone === true);
      document.documentElement.classList.toggle('pwa-standalone', standalone);
      document.documentElement.classList.toggle('mobile-app', true);
    };
    apply();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
