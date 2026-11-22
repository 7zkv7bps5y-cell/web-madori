import { useEffect, useState } from 'react';
import { canCreateCloudSave, PLANS } from '../billing/plans';
import { currentPlan, useAccount } from '../store/account';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import { saveProjectFile } from '../utils/io';
import { Modal } from './Dialogs';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** クラウド保存（保存済み一覧・新規保存・上書き・再編集・複製・削除・ダウンロード） */
export function CloudDialog({ onClose, onOpenLocalSave }: { onClose: () => void; onOpenLocalSave: () => void }) {
  const acc = useAccount();
  const project = useStore((s) => s.project);
  const notify = useStore((s) => s.notify);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [name, setName] = useState(project.projectName);

  useEffect(() => {
    void acc.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setName(project.projectName), [project.projectName]);

  const localNote = (
    <p className="muted small">
      クラウドに保存しなくても、編集中の内容はこのブラウザに自動保存されています。ファイルへの保存・画像・PDF は制限なく使えます。
    </p>
  );

  // ---- 未設定: 動いているように見せない ----
  if (acc.mode === 'unconfigured') {
    return (
      <Modal title="クラウド保存" onClose={onClose}>
        <div className="cloud-notice">
          <h3>クラウド保存は準備中です</h3>
          <p>
            ログインして間取りをクラウドに保存し、別の端末から続きを編集できる機能を準備しています（無料プランで {PLANS.free.cloudLimit} 件まで保存できる予定です）。
          </p>
        </div>
        <p>今は「保存」から編集用データ（.floorplan）をファイルに保存し、別の端末で「開く」と続きから編集できます。</p>
        {localNote}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            閉じる
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onClose();
              onOpenLocalSave();
            }}
          >
            ファイルに保存する
          </button>
        </div>
      </Modal>
    );
  }

  const mockBadge =
    acc.mode === 'mock' ? <p className="cloud-mock">テスト用の模擬クラウドです（このブラウザ内だけに保存。本番では使われません）</p> : null;

  if (!acc.ready) {
    return (
      <Modal title="クラウド保存" onClose={onClose}>
        {mockBadge}
        <p className="muted">読み込み中…</p>
      </Modal>
    );
  }

  // ---- 未ログイン ----
  if (!acc.user) {
    return (
      <Modal title="クラウド保存" onClose={onClose}>
        {mockBadge}
        <p>ログインすると、作った間取りをクラウドに保存して、別の端末（スマホ・パソコン）から続きを編集できます。</p>
        <ul className="cloud-plans">
          <li>
            <b>{PLANS.free.name}</b>：{PLANS.free.cloudLimit} 件まで保存（期限なし）
          </li>
          <li>
            <b>{PLANS.premium.name}</b>（月額 {PLANS.premium.monthlyPriceJpy} 円・準備中）：{PLANS.premium.cloudLimit} 件まで保存・広告なし
          </li>
        </ul>
        {sent ? (
          <p className="cloud-sent" role="status">
            {email} にログイン用のメールを送りました。メールのリンクを開くとログインできます。
          </p>
        ) : (
          <form
            className="cloud-login"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await acc.signIn(email)) setSent(acc.mode !== 'mock');
            }}
          >
            <label className="field">
              <span className="field-label">メールアドレス（パスワードは不要です）</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </label>
            <button type="submit" className="primary" disabled={!!acc.busy}>
              {acc.busy ?? 'ログイン用のメールを送る'}
            </button>
          </form>
        )}
        {acc.error && <p className="error small">{acc.error}</p>}
        {localNote}
        <p className="muted small">
          ログインには<a href="/terms/" target="_blank" rel="noopener">利用規約</a>と<a href="/privacy/" target="_blank" rel="noopener">プライバシーポリシー</a>への同意が必要です。
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </Modal>
    );
  }

  // ---- ログイン済み ----
  const st = acc.status;
  const plan = currentPlan(st);
  const used = st?.used ?? acc.items.length;
  const limit = st?.cloudLimit ?? plan.cloudLimit;
  const full = !canCreateCloudSave(used, limit);
  const linked = acc.link && acc.link.projectId === project.projectId && acc.items.some((i) => i.id === acc.link!.cloudId) ? acc.link : null;
  const busy = !!acc.busy;

  const openItem = async (id: string) => {
    const p = await acc.open(id);
    if (!p) return;
    useStore.getState().loadProject(p);
    useView.getState().requestFit();
    notify('クラウドの間取りを開きました（元に戻すで前の間取りに戻せます）。');
    onClose();
  };

  return (
    <Modal title="クラウド保存" onClose={onClose}>
      {mockBadge}
      <div className="cloud-account">
        <div>
          <span className="muted small">{acc.user.email}</span>
          <strong>
            {plan.name}・保存 {used} / {limit} 件
          </strong>
        </div>
        <button type="button" className="link" onClick={() => void acc.signOut()} disabled={busy}>
          ログアウト
        </button>
      </div>
      <div className="cloud-meter" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%` }} className={full ? 'full' : ''} />
      </div>

      <section className="cloud-current">
        <h3>編集中の間取り</h3>
        {linked ? (
          <>
            <p className="small">
              クラウドの「<b>{linked.name}</b>」と結びついています。上書き保存しても保存件数は増えません。
            </p>
            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (await acc.overwrite(linked.cloudId, linked.name, useStore.getState().project)) notify('クラウドに上書き保存しました。');
                }}
              >
                上書き保存
              </button>
              <button type="button" onClick={() => acc.unlink()} disabled={busy}>
                別の間取りとして保存する
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">保存名</span>
              <input type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={busy || full || !name.trim()}
                onClick={async () => {
                  if (await acc.saveNew(name.trim(), useStore.getState().project)) notify('クラウドに保存しました。');
                }}
              >
                新規保存（1 件使います）
              </button>
            </div>
            {full && (
              <p className="cloud-full" role="status">
                保存枠（{limit} 件）がいっぱいです。新しく保存するには、下の一覧から不要な間取りを削除するか、「この内容で上書き」で既存の間取りに上書きしてください。
                保存枠は月が変わっても増えません。編集中の内容は消えません。
              </p>
            )}
          </>
        )}
      </section>

      {acc.error && (
        <p className="error small" role="alert">
          {acc.error}
        </p>
      )}

      <section>
        <h3>保存済みの間取り</h3>
        {acc.items.length === 0 ? (
          <p className="muted small">まだ保存していません。</p>
        ) : (
          <ul className="cloud-list">
            {acc.items.map((it) => (
              <li key={it.id} className={linked?.cloudId === it.id ? 'linked' : ''}>
                <div className="cloud-item-head">
                  <strong className="ellipsis">{it.name}</strong>
                  <span className="muted small">更新 {fmtDate(it.updatedAt)}</span>
                </div>
                <div className="cloud-item-actions">
                  <button type="button" className="primary" disabled={busy} onClick={() => void openItem(it.id)}>
                    開いて編集
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(`「${it.name}」を、今編集している間取りで上書きしますか？`)) return;
                      if (await acc.overwrite(it.id, it.name, useStore.getState().project)) notify(`「${it.name}」に上書き保存しました。`);
                    }}
                  >
                    この内容で上書き
                  </button>
                  <button
                    type="button"
                    disabled={busy || full}
                    title={full ? '保存枠がいっぱいのため複製できません' : '複製（1 件使います）'}
                    onClick={async () => {
                      if (await acc.duplicate(it.id)) notify('複製しました。');
                    }}
                  >
                    複製
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const p = await useAccount.getState().backend?.load(it.id).catch(() => null);
                      if (p) saveProjectFile(p);
                      else notify('ダウンロードできませんでした。', 'error');
                    }}
                  >
                    ファイルにダウンロード
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(`「${it.name}」をクラウドから削除しますか？ 元に戻せません（編集中の間取りやファイルには影響しません）。`)) return;
                      if (await acc.remove(it.id)) notify('削除しました。');
                    }}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {localNote}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
