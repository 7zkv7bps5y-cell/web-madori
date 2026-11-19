/**
 * 広告枠の有効化。VITE_ADSENSE_CLIENT が未設定の間は何もしない（枠は CSS で非表示）。
 * 広告は操作の邪魔にならない場所（コンテンツページ・エディタのパーツ一覧の下）にのみ置き、
 * 間取りキャンバス内には表示しない。
 */
export function initAds(root: ParentNode = document) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  const slots = Array.from(root.querySelectorAll<HTMLElement>('.ad-slot'));
  if (!client || slots.length === 0) return;
  document.body.classList.add('ads-on');
  if (!document.querySelector('script[data-adsense]')) {
    const s = document.createElement('script');
    s.async = true;
    s.dataset.adsense = '1';
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    document.head.appendChild(s);
  }
  const unit = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;
  for (const slot of slots) {
    if (slot.dataset.filled || !unit) continue;
    slot.dataset.filled = '1';
    slot.innerHTML = `<span class="ad-label">広告</span><ins class="adsbygoogle" style="display:block" data-ad-client="${client}" data-ad-slot="${unit}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    try {
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      /* 広告ブロッカーなど */
    }
  }
}
