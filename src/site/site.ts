import './site.css';
import { adsOffRemembered, initAds } from './ads';

// スマートフォン用メニュー
const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
const nav = document.getElementById('site-nav');
toggle?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open') ?? false;
  toggle.setAttribute('aria-expanded', String(open));
});

for (const el of document.querySelectorAll('[data-year]')) el.textContent = String(new Date().getFullYear());

// お問い合わせフォーム（サーバーを持たないため、送信先メールアドレスが設定されていればメールアプリで送信）
const form = document.querySelector<HTMLFormElement>('#contact-form');
if (form) {
  const to = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
  const status = document.getElementById('contact-status');
  if (!to) {
    form.querySelectorAll('input, select, textarea, button').forEach((el) => el.setAttribute('disabled', ''));
    if (status) status.textContent = '現在、お問い合わせ窓口を準備中です。公開までしばらくお待ちください。';
  } else {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const subject = `[Web間取り] ${data.get('category') ?? 'お問い合わせ'}`;
      const body = `お名前: ${data.get('name') ?? ''}\n返信先: ${data.get('email') ?? ''}\n\n${data.get('message') ?? ''}`;
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (status) status.textContent = 'メールアプリを開きました。内容を確認して送信してください。';
    });
  }
}

// 広告なしプランの利用者（エディタで確認済み）には広告を出さない
if (!adsOffRemembered()) initAds();
