import { useEffect, useRef, useState } from 'react';
import { isSafeImageUrl, isSafeLinkUrl, uid } from '../model/project';
import type { PartImage, PartInfo, Project } from '../model/types';
import { embeddedImageBytes, embedImageFile, ImageError, MAX_EMBEDDED_TOTAL_BYTES } from '../utils/images';

export const emptyInfo = (): PartInfo => ({ links: [], images: [] });

/** 情報が 1 つでも入っているか（空の情報は保存しない） */
export function hasPartInfo(i?: PartInfo): i is PartInfo {
  return (
    !!i &&
    (i.links.length > 0 ||
      i.images.length > 0 ||
      !!(i.title?.trim() || i.productName?.trim() || i.description?.trim() || i.memo?.trim() || i.specs?.trim()) ||
      i.price !== undefined)
  );
}

/** 空の項目を取り除く（中身がなければ undefined） */
export function normalizeInfo(i: PartInfo): PartInfo | undefined {
  const out: PartInfo = { links: i.links, images: i.images };
  for (const k of ['title', 'productName', 'description', 'specs', 'memo'] as const) {
    const v = i[k]?.trim();
    if (v) out[k] = v;
  }
  if (i.price !== undefined && Number.isFinite(i.price) && i.price >= 0) out.price = i.price;
  return hasPartInfo(out) ? out : undefined;
}

/** 画像の拡大表示 */
export function Lightbox({ images, index, onClose }: { images: PartImage[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const im = images[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(images.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);
  if (!im) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="画像の拡大表示" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <img src={im.src} alt={im.caption ?? ''} referrerPolicy="no-referrer" />
      {im.caption && <p className="lightbox-caption">{im.caption}</p>}
      <div className="lightbox-bar">
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="前の画像">
          ‹
        </button>
        <span>
          {i + 1} / {images.length}
        </span>
        <button type="button" disabled={i === images.length - 1} onClick={() => setI(i + 1)} aria-label="次の画像">
          ›
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
      </div>
    </div>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

/** 参考情報の表示（閲覧用）。外部リンクは安全な属性で新しいタブに開く */
export function PartInfoView({ info }: { info: PartInfo }) {
  const [zoom, setZoom] = useState<number | null>(null);
  return (
    <div className="part-info-view">
      {info.title && <h4>{info.title}</h4>}
      {(info.productName || info.price !== undefined) && (
        <p className="pi-product">
          {info.productName}
          {info.price !== undefined && <span className="pi-price">{info.price.toLocaleString('ja-JP')}円</span>}
        </p>
      )}
      {info.images.length > 0 && (
        <ul className="pi-images">
          {info.images.map((im, k) => (
            <li key={im.id}>
              <button type="button" className="thumb" onClick={() => setZoom(k)} aria-label={`画像を拡大${im.caption ? `（${im.caption}）` : ''}`}>
                <img src={im.src} alt={im.caption ?? ''} loading="lazy" referrerPolicy="no-referrer" />
              </button>
              {im.caption && <span className="small muted">{im.caption}</span>}
            </li>
          ))}
        </ul>
      )}
      {info.description && <p className="pi-text">{info.description}</p>}
      {info.specs && (
        <p className="pi-text">
          <span className="muted small">寸法・仕様　</span>
          {info.specs}
        </p>
      )}
      {info.links.length > 0 && (
        <ul className="pi-links">
          {info.links.map((l, k) => (
            <li key={k}>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc">
                {l.label || hostOf(l.url)} ↗
              </a>
              <span className="small muted">{hostOf(l.url)}</span>
            </li>
          ))}
        </ul>
      )}
      {info.memo && (
        <p className="pi-text pi-memo">
          <span className="muted small">メモ　</span>
          {info.memo}
        </p>
      )}
      {zoom !== null && <Lightbox images={info.images} index={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Field({
  label,
  value,
  onCommit,
  multiline,
  maxLength = 200,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  const common = {
    value: t,
    maxLength,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setT(e.target.value),
    onBlur: () => t !== value && onCommit(t),
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />}
    </label>
  );
}

/** 参考情報の編集（必要な項目だけ使える）。画像は図面には描かない */
export function PartInfoEditor({ info, onChange, project }: { info?: PartInfo; onChange: (i: PartInfo | undefined) => void; project: Project }) {
  const cur = info ?? emptyInfo();
  const save = (patch: Partial<PartInfo>) => onChange(normalizeInfo({ ...cur, ...patch }));
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const used = embeddedImageBytes(project);

  return (
    <div className="part-info-editor">
      <p className="muted small">画像・URL・メモは間取り図（画面・PNG・PDF）には描かれません。パーツを選んだときに表示されます。</p>
      <Field label="タイトル" value={cur.title ?? ''} onCommit={(v) => save({ title: v })} />
      <div className="props-row">
        <Field label="商品名" value={cur.productName ?? ''} onCommit={(v) => save({ productName: v })} />
        <label className="field">
          <span className="field-label">価格（円）</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={cur.price ?? ''}
            key={cur.price ?? 'none'}
            onBlur={(e) => {
              const v = e.target.value.trim();
              save({ price: v === '' ? undefined : Math.max(0, Math.round(Number(v))) });
            }}
          />
        </label>
      </div>
      <Field label="説明" value={cur.description ?? ''} onCommit={(v) => save({ description: v })} multiline maxLength={4000} />
      <Field label="寸法・仕様" value={cur.specs ?? ''} onCommit={(v) => save({ specs: v })} maxLength={2000} />

      <div className="pi-edit-block">
        <span className="field-label">画像（{cur.images.length} / 20）</span>
        {cur.images.length > 0 && (
          <ul className="pi-images edit">
            {cur.images.map((im) => (
              <li key={im.id}>
                <img src={im.src} alt="" referrerPolicy="no-referrer" />
                <input
                  type="text"
                  placeholder="説明（任意）"
                  defaultValue={im.caption ?? ''}
                  maxLength={200}
                  onBlur={(e) => save({ images: cur.images.map((x) => (x.id === im.id ? { ...x, caption: e.target.value.trim() || undefined } : x)) })}
                />
                <button
                  type="button"
                  className="danger"
                  aria-label="画像を削除"
                  onClick={() => window.confirm('この画像を削除しますか？') && save({ images: cur.images.filter((x) => x.id !== im.id) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pi-add">
          <button type="button" disabled={busy || cur.images.length >= 20} onClick={() => fileRef.current?.click()}>
            {busy ? '変換中…' : '端末の写真を追加'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setMsg(null);
              setBusy(true);
              try {
                const src = await embedImageFile(file);
                const bytes = Math.floor(((src.length - src.indexOf(',') - 1) * 3) / 4);
                if (used + bytes > MAX_EMBEDDED_TOTAL_BYTES) {
                  setMsg(`この間取りに入れられる写真の合計（${MAX_EMBEDDED_TOTAL_BYTES / 1_000_000}MB）を超えます。不要な写真を消すか、画像の URL で登録してください。`);
                  return;
                }
                save({ images: [...cur.images, { id: uid('img'), kind: 'embedded', src }] });
              } catch (err) {
                setMsg(err instanceof ImageError ? err.message : '画像を追加できませんでした。');
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="muted small">写真の合計 {(used / 1_000_000).toFixed(2)} / {MAX_EMBEDDED_TOTAL_BYTES / 1_000_000}MB</span>
        </div>
        <form
          className="pi-add"
          onSubmit={(e) => {
            e.preventDefault();
            const u = imgUrl.trim();
            if (!isSafeImageUrl(u)) return setMsg('画像の URL は https:// で始まるものだけ使えます。');
            save({ images: [...cur.images, { id: uid('img'), kind: 'url', src: u }] });
            setImgUrl('');
            setMsg(null);
          }}
        >
          <input type="url" placeholder="画像の URL（https://…）" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} maxLength={2000} />
          <button type="submit" disabled={!imgUrl.trim() || cur.images.length >= 20}>
            追加
          </button>
        </form>
      </div>

      <div className="pi-edit-block">
        <span className="field-label">リンク（{cur.links.length} / 20）</span>
        {cur.links.length > 0 && (
          <ul className="pi-links edit">
            {cur.links.map((l, k) => (
              <li key={k}>
                <span className="ellipsis">{l.label || l.url}</span>
                <button
                  type="button"
                  className="danger"
                  aria-label="リンクを削除"
                  onClick={() => save({ links: cur.links.filter((_, j) => j !== k) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="pi-add column"
          onSubmit={(e) => {
            e.preventDefault();
            const u = linkUrl.trim();
            if (!isSafeLinkUrl(u)) return setMsg('リンクは http:// または https:// で始まる URL だけ使えます。');
            save({ links: [...cur.links, { url: u, ...(linkLabel.trim() ? { label: linkLabel.trim() } : {}) }] });
            setLinkUrl('');
            setLinkLabel('');
            setMsg(null);
          }}
        >
          <input type="url" placeholder="URL（商品ページ・メーカー・施工事例など）" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={2000} />
          <div className="pi-add">
            <input type="text" placeholder="表示名（任意）" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={200} />
            <button type="submit" disabled={!linkUrl.trim() || cur.links.length >= 20}>
              追加
            </button>
          </div>
        </form>
      </div>
      <Field label="メモ" value={cur.memo ?? ''} onCommit={(v) => save({ memo: v })} multiline maxLength={4000} />
      {msg && (
        <p className="error small" role="alert">
          {msg}
        </p>
      )}
    </div>
  );
}

/** 設定欄に置く「参考情報」セクション（編集と表示の切り替え付き） */
export function PartInfoSection({ info, onChange, project }: { info?: PartInfo; onChange: (i: PartInfo | undefined) => void; project: Project }) {
  const filled = hasPartInfo(info);
  const [editing, setEditing] = useState(!filled);
  return (
    <details className="props-group part-info" open={filled}>
      <summary>
        参考情報（画像・URL・メモ）{filled && <span className="pi-count">{(info!.images.length || '') && `画像${info!.images.length}`}{info!.links.length > 0 && ` リンク${info!.links.length}`}</span>}
      </summary>
      {filled && (
        <div className="segmented" role="tablist" aria-label="表示の切り替え">
          <button type="button" role="tab" aria-selected={!editing} className={!editing ? 'active' : ''} onClick={() => setEditing(false)}>
            表示
          </button>
          <button type="button" role="tab" aria-selected={editing} className={editing ? 'active' : ''} onClick={() => setEditing(true)}>
            編集
          </button>
        </div>
      )}
      {filled && !editing ? <PartInfoView info={info!} /> : <PartInfoEditor info={info} onChange={onChange} project={project} />}
    </details>
  );
}
