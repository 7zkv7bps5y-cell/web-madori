/**
 * 広告枠の有効化。VITE_ADSENSE_CLIENT が未設定の間は何もしない（枠は CSS で非表示）。
 * 広告は操作の邪魔にならない場所（コンテンツページ・エディタのパーツ一覧の下）にのみ置き、
 * 間取りキャンバス内には表示しない。
 */
export function initAds(root: ParentNode = document) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  const unit = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;
  if (!client) return;
  // 広告のスクリプト（自動広告を使う場合もこれだけで動く）
  if (!document.querySelector('script[data-adsense]')) {
    const s = document.createElement('script');
    s.async = true;
    s.dataset.adsense = '1';
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    document.head.appendChild(s);
  }
  // 広告ユニット ID がなければ枠は出さない（空の枠を表示しない）
  const slots = Array.from(root.querySelectorAll<HTMLElement>('.ad-slot'));
  if (!unit || slots.length === 0) return;
  document.body.classList.add('ads-on');
  for (const slot of slots) {
    if (slot.dataset.filled) continue;
    slot.dataset.filled = '1';
    slot.innerHTML = `<span class="ad-label">広告</span><ins class="adsbygoogle" style="display:block" data-ad-client="${client}" data-ad-slot="${unit}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    try {
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      /* 広告ブロッカーなど */
    }
  }
}

/** 広告なしプラン（有料）の利用者かどうかの記憶。エディタでサーバーのプランを確認したときに更新する */
const ADS_OFF_KEY = 'web-madori:ads-off';

export function rememberAdsOff(off: boolean) {
  try {
    if (off) localStorage.setItem(ADS_OFF_KEY, '1');
    else localStorage.removeItem(ADS_OFF_KEY);
  } catch {
    /* 保存できない環境 */
  }
}

export function adsOffRemembered(): boolean {
  try {
    return localStorage.getItem(ADS_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * プランに応じて広告を出す・消す。
 * 有料プラン（showAds = false）では広告を読み込まず、表示中の枠も隠す。
 */
export function applyAdsForPlan(showAds: boolean) {
  rememberAdsOff(!showAds);
  if (showAds) initAds();
  else document.body.classList.remove('ads-on');
}
