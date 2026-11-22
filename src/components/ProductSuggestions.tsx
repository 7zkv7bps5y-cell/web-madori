import { useEffect, useState } from 'react';
import type { Furniture } from '../model/types';
import { loadProductCatalog, SIZE_STANDARD_LABEL, type Product } from '../products/catalog';
import { bedSizeStandard, relatedProducts, similarProducts } from '../products/recommend';
import { useStore } from '../store/store';

function ProductCard({ p, onUseSize }: { p: Product; onUseSize?: () => void }) {
  const href = p.affiliateUrl ?? p.url;
  return (
    <li className="product-card">
      {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" width={56} height={56} />}
      <div>
        <a href={href} target="_blank" rel="sponsored noopener noreferrer">
          {p.name}
        </a>
        <span className="muted small">
          {p.shop}
          {p.priceJpy !== undefined && `・${p.priceJpy.toLocaleString('ja-JP')}円`}
          {p.dimensions && `・幅${Math.round(p.dimensions.w / 10)}×奥行${Math.round(p.dimensions.d / 10)}cm`}
          {p.sizeStandards?.length ? `・${p.sizeStandards.map((s) => SIZE_STANDARD_LABEL[s]).join('/')}` : ''}
        </span>
        {onUseSize && (
          <button type="button" className="link small" onClick={onUseSize}>
            この商品の寸法にする
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * 家具に合う商品（類似商品・関連商品）。商品カタログに合う商品があるときだけ表示する。
 * 広告であることが分かるよう「PR」を表示し、リンクには rel="sponsored" を付ける。
 */
export function ProductSuggestions({ item }: { item: Furniture }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadProductCatalog().then((p) => alive && setProducts(p));
    return () => {
      alive = false;
    };
  }, []);
  if (!products || products.length === 0) return null;
  const similar = similarProducts(item, products);
  const related = relatedProducts(item, products);
  const linked = item.productId ? products.find((p) => p.id === item.productId) : undefined;
  if (similar.length === 0 && related.length === 0 && !linked) return null;
  const size = bedSizeStandard(item);
  const st = useStore.getState();
  return (
    <div className="props-group products">
      <h3>
        商品を探す <span className="pr-badge">PR</span>
      </h3>
      {linked && <p className="small">選んだ商品：{linked.name}</p>}
      {similar.length > 0 && (
        <>
          <p className="muted small">この大きさに近い商品</p>
          <ul className="product-list">
            {similar.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                onUseSize={
                  p.dimensions
                    ? () =>
                        st.updateFurniture(item.id, {
                          w: p.dimensions!.w,
                          d: p.dimensions!.d,
                          ...(p.dimensions!.h ? { height: p.dimensions!.h } : {}),
                          productId: p.id,
                        })
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      {related.length > 0 && (
        <>
          <p className="muted small">一緒に使う商品{size && `（${SIZE_STANDARD_LABEL[size]}用）`}</p>
          <ul className="product-list">
            {related.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </ul>
        </>
      )}
      <p className="muted small">リンク先での購入により、運営者が紹介料を受け取ることがあります。価格・在庫はリンク先でご確認ください。</p>
    </div>
  );
}
