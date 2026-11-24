import { useEffect, useRef, useState } from 'react';
import { shareLinkUrl, useAccount } from '../store/account';
import { useStore } from '../store/store';
import { embeddedImageBytes } from '../utils/images';
import { copyText } from '../utils/io';
import { buildShareUrl, SHARE_URL_WARN } from '../utils/share';
import { Modal } from './Dialogs';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** クラウドの間取り 1 件の共有リンク（発行・コピー・停止・再発行） */
export function SharePanel({ floorplanId, name }: { floorplanId: string; name: string }) {
  const acc = useAccount();
  const notify = useStore((s) => s.notify);
  const share = acc.shares.find((s) => s.floorplanId === floorplanId);
  const url = share ? shareLinkUrl(share.token) : null;
  const busy = !!acc.busy;
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <div className="share-panel">
      {url ? (
        <>
          <p className="small">
            <span className="share-on">共有中</span> 発行 {fmt(share!.createdAt)}。リンクを知っている人は、ログインなしで「{name}」を<b>閲覧だけ</b>できます（編集はできません）。
          </p>
          <input className="share-link" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="共有リンク" />
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                if (await copyText(url)) notify('共有リンクをコピーしました。');
                else notify('リンクを選択してコピーしてください。');
              }}
            >
              リンクをコピー
            </button>
            {canNativeShare && (
              <button type="button" onClick={() => navigator.share({ title: name, url }).catch(() => undefined)}>
                ほかのアプリで送る
              </button>
            )}
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm('新しいリンクを発行しますか？ 今のリンクは使えなくなります。')) return;
                if (await acc.issueShare(floorplanId)) notify('新しい共有リンクを発行しました。前のリンクは使えなくなりました。');
              }}
            >
              リンクを再発行
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm('共有を停止しますか？ このリンクは使えなくなります（間取りは消えません）。')) return;
                if (await acc.revokeShare(floorplanId)) notify('共有を停止しました。');
              }}
            >
              共有を停止
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">共有していません。リンクを発行すると、受け取った人はログインなしで閲覧でき、「自分のデータとして保存」で複製を作れます。</p>
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={async () => (await acc.issueShare(floorplanId)) && notify('共有リンクを発行しました。')}>
              共有リンクを発行
            </button>
          </div>
        </>
      )}
      <p className="muted small">共有先には、クラウドに保存した最新の内容（すべての階・案・カスタムパーツ・画像・リンク・メモ）が表示されます。編集したら「上書き保存」すると共有先にも反映されます。</p>
    </div>
  );
}

/** 従来の共有: 間取りのデータを URL の「#」以降に入れて送る（サーバー不要。開くとコピーが編集できる） */
function LegacyUrlShare() {
  const project = useStore((s) => s.project);
  const notify = useStore((s) => s.notify);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const imageBytes = embeddedImageBytes(project);
  useEffect(() => {
    let alive = true;
    buildShareUrl(project).then(
      (u) => alive && setUrl(u),
      () => alive && setError('共有用URLを作成できませんでした。'),
    );
    return () => {
      alive = false;
    };
  }, [project]);
  return (
    <>
      <p className="muted small">
        このURLを開くと、今の間取り（すべての階・案）のコピーが開き、受け取った人が自由に編集できます（閲覧専用ではありません）。
        データは URL の中だけに入っていて、運営者のサーバーには保存されません。URLを知っている人は誰でも開けます。
      </p>
      {imageBytes > 0 && (
        <p className="save-warning">
          写真を埋め込んでいるため URL がとても長くなります（約 {(imageBytes / 1000).toFixed(0)}KB 分）。メッセージアプリなどでは途中で切れて開けないことがあります。上の「共有リンク」か、ファイルに保存して送ってください。
        </p>
      )}
      {error && <p className="error small">{error}</p>}
      {url && (
        <>
          <textarea ref={ref} className="transfer share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
          <p className="muted small">
            URLの長さ：{url.length.toLocaleString()} 文字
            {url.length > SHARE_URL_WARN && '（長いため、SNSやメッセージアプリでは途中で切れることがあります）'}
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                if (await copyText(url)) notify('共有用URLをコピーしました。');
                else {
                  ref.current?.focus();
                  ref.current?.select();
                  notify('URLを選択しました。コピーして共有してください。');
                }
              }}
            >
              URLをコピー
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** 共有（閲覧専用の共有リンク／従来の URL 共有） */
export function SharingDialog({ onClose, onOpenCloud }: { onClose: () => void; onOpenCloud: () => void }) {
  const acc = useAccount();
  const project = useStore((s) => s.project);
  useEffect(() => {
    void acc.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const linked = acc.link && acc.link.projectId === project.projectId && acc.items.some((i) => i.id === acc.link!.cloudId) ? acc.link : null;
  const legacyFirst = acc.mode === 'unconfigured';
  return (
    <Modal title="共有" onClose={onClose}>
      <section className="share-section">
        <h3>共有リンク（閲覧専用）</h3>
        {acc.mode === 'unconfigured' ? (
          <p className="small muted">共有リンクは準備中です（クラウド保存の準備ができると使えます）。今は下の「URL にデータを入れて送る」を使えます。</p>
        ) : !acc.ready ? (
          <p className="small muted">読み込み中…</p>
        ) : !acc.user ? (
          <>
            <p className="small">共有リンクを発行するには、ログインして間取りをクラウドに保存してください。</p>
            <div className="actions">
              <button type="button" className="primary" onClick={onOpenCloud}>
                ログイン・クラウド保存へ
              </button>
            </div>
          </>
        ) : linked ? (
          <SharePanel floorplanId={linked.cloudId} name={linked.name} />
        ) : (
          <>
            <p className="small">この間取りはまだクラウドに保存されていません。クラウドに保存すると共有リンクを発行できます（保存件数を 1 件使います）。</p>
            <div className="actions">
              <button type="button" className="primary" onClick={onOpenCloud}>
                クラウドに保存する
              </button>
            </div>
          </>
        )}
        {acc.error && <p className="error small">{acc.error}</p>}
      </section>
      <details className="share-section" open={legacyFirst}>
        <summary>URL にデータを入れて送る（従来の方式・閲覧専用ではありません）</summary>
        <LegacyUrlShare />
      </details>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
