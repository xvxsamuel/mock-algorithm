import { useEffect, useState, type RefObject } from "react";

/**
 * True while a scrolling element has more content below what it shows, so
 * its bottom edge can fade: a card cut by the edge then reads as "more
 * below", not as broken. `key` re-attaches it when the element is replaced.
 */
export function useMoreBelow(
  ref: RefObject<HTMLElement | null>,
  key: unknown,
): boolean {
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = () =>
      setMore(
        element.scrollHeight - element.scrollTop - element.clientHeight > 2,
      );
    // A ResizeObserver reports once when it starts, so this also measures.
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [ref, key]);

  return more;
}
