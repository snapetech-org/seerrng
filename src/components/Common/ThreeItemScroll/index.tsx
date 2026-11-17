import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';

export const visibleItemsHeight = (heights: number[], gap: number) =>
  heights.slice(0, 3).reduce((sum, height) => sum + height, 0) +
  Math.max(0, Math.min(3, heights.length) - 1) * gap;

// Measure actual cards so wrapped titles and responsive layouts do not reveal
// a fourth card or require hard-coded per-page heights.
export default function ThreeItemScroll({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const update = () => {
      const cards = Array.from(list.children).slice(0, 3);
      const height = visibleItemsHeight(
        cards.map((card) => card.getBoundingClientRect().height),
        parseFloat(getComputedStyle(list).rowGap) || 0
      );
      if (
        height > 0 &&
        list.parentElement?.style.getPropertyValue('--three-item-height') !==
          `${height}px`
      )
        list.parentElement?.style.setProperty(
          '--three-item-height',
          `${height}px`
        );
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(list);
    Array.from(list.children)
      .slice(0, 3)
      .forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [count]);
  return (
    <div
      className="scrollable-card three-item-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <div ref={ref} className="three-item-scroll-list">
        {children}
      </div>
    </div>
  );
}
