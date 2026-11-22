import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 縦スクロールできる領域。右端に、実際のスクロール位置と連動する細いバーを表示する。
 * - スクロールできないときはバーを出さない
 * - スクロール中は少し濃く表示
 * - バーは pointer-events: none なので操作の邪魔をしない
 * スマートフォンのブラウザは標準のスクロールバーがほぼ見えないため、続きがあることに気づけるようにする。
 */
export function ScrollArea({
  children,
  className = '',
  contentClassName = '',
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setBar(null);
      return;
    }
    const track = clientHeight - 8; // 上下 4px の余白
    const height = Math.max(28, (clientHeight / scrollHeight) * track);
    const max = scrollHeight - clientHeight;
    const top = 4 + (max > 0 ? (scrollTop / max) * (track - height) : 0);
    setBar((b) => (b && Math.abs(b.top - top) < 0.5 && Math.abs(b.height - height) < 0.5 ? b : { top, height }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(content);
    return () => ro.disconnect();
  }, [update]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className={`scroll-area ${className}`}>
      <div
        ref={scrollerRef}
        className="scroll-area-viewport"
        onScroll={() => {
          update();
          setActive(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setActive(false), 900);
        }}
      >
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      </div>
      {bar && (
        <div className={`scroll-thumb ${active ? 'active' : ''}`} style={{ top: bar.top, height: bar.height }} aria-hidden="true" />
      )}
    </div>
  );
}
