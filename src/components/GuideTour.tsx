import { useState, type ReactNode } from 'react';
import { Modal } from './Dialogs';

export const GUIDE_DONE_KEY = 'web-madori:guide-done';

export function guideDone(): boolean {
  try {
    return localStorage.getItem(GUIDE_DONE_KEY) === '1';
  } catch {
    return true; // 保存できない環境では毎回出さない
  }
}

function markDone() {
  try {
    localStorage.setItem(GUIDE_DONE_KEY, '1');
  } catch {
    /* 保存できない環境 */
  }
}

interface Step {
  icon: string;
  title: string;
  body: (touch: boolean) => ReactNode;
}

const STEPS: Step[] = [
  {
    icon: '🏠',
    title: 'Web間取りへようこそ',
    body: () => (
      <>
        <p>部屋をパズルのように組み合わせて、間取りを作るツールです。会員登録は不要で、作った間取りはこのブラウザに自動で保存されます。</p>
        <p>まずは基本の操作を 1 分で紹介します。</p>
      </>
    ),
  },
  {
    icon: '➕',
    title: '部屋を追加する',
    body: (touch) => (
      <>
        <p>
          {touch ? '画面下の「＋ パーツ」' : '左の「部屋」の一覧'}から部屋を選ぶと追加されます。何もない画面では「最初の部屋を追加」からでも始められます。
        </p>
        <p>
          部屋を{touch ? 'タップ' : 'クリック'}して選ぶと、上下左右に緑の <b>＋</b> が出ます。＋を押すと、その方向に隣の部屋を追加できます。
        </p>
        <p className="muted small">メニューの「テンプレートから始める」で、1K〜4LDK の見本から始めることもできます。</p>
      </>
    ),
  },
  {
    icon: '✋',
    title: '選択・移動・サイズ変更',
    body: (touch) => (
      <>
        <ul>
          <li>部屋をドラッグすると移動できます。</li>
          <li>選んだ部屋の四隅・辺の □ をドラッグすると大きさを変えられます。</li>
          <li>
            広さや種類は{touch ? '「⚙ 設定」（または選択時の「詳細」）' : '右側の設定欄'}で数字を入れて変更できます。
          </li>
          <li>{touch ? '2 本指で拡大・縮小、何もない所を 1 本指でドラッグすると画面が動きます。' : 'マウスホイールで拡大・縮小、何もない所をドラッグすると画面が動きます。'}</li>
          <li>📏 ボタンで、すべての部屋の寸法・畳数・面積を表示できます。</li>
        </ul>
      </>
    ),
  },
  {
    icon: '🚪',
    title: 'ドア・窓と家具',
    body: (touch) => (
      <>
        <p>
          パーツの「ドア・窓」から種類を選び、取り付けたい壁を{touch ? 'タップ' : 'クリック'}します。
        </p>
        <p>
          {touch ? '画面下の「家具配置へ」' : '画面上部の「家具配置」'}に切り替えると、ベッドやソファなどを実寸で置けます。ドアの開閉や通路幅のチェックもできます。
        </p>
      </>
    ),
  },
  {
    icon: '💾',
    title: '保存する',
    body: (touch) => (
      <>
        <p>編集内容はこのブラウザに自動で保存されます。</p>
        <p>
          {touch ? '画面上部の「保存」' : '右上の「保存」'}を押すと、再編集用のデータ・間取り図の画像・PDF をまとめて保存できます。
          別の端末で続きを作るときは、保存した <code>.floorplan</code> ファイルを「開く」で読み込みます。
        </p>
        <p className="muted small">このガイドは、右下の「？」ボタンからいつでも見られます。</p>
      </>
    ),
  },
];

/** 初回の操作ガイド（ステップ形式）。閉じると次回からは自動で出ない */
export function GuideTour({ touch, onClose, onTemplate }: { touch: boolean; onClose: () => void; onTemplate: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const close = () => {
    markDone();
    onClose();
  };
  const last = i === STEPS.length - 1;
  return (
    <Modal title={`操作ガイド（${i + 1}/${STEPS.length}）`} onClose={close}>
      <div className="guide-step">
        <div className="guide-icon" aria-hidden="true">
          {step.icon}
        </div>
        <h3>{step.title}</h3>
        {step.body(touch)}
      </div>
      <div className="guide-dots" aria-hidden="true">
        {STEPS.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="modal-actions">
        {i === 0 ? (
          <button type="button" onClick={close}>
            スキップ
          </button>
        ) : (
          <button type="button" onClick={() => setI(i - 1)}>
            戻る
          </button>
        )}
        {i === 1 && (
          <button
            type="button"
            onClick={() => {
              close();
              onTemplate();
            }}
          >
            テンプレートを見る
          </button>
        )}
        <button type="button" className="primary" onClick={() => (last ? close() : setI(i + 1))}>
          {last ? 'はじめる' : '次へ'}
        </button>
      </div>
    </Modal>
  );
}
