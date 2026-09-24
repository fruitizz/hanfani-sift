import { useEffect, useState } from "react";

/** Matches `.docs-topbar` height in styles.css */
const HEADER_OFFSET_PX = 54;

export type ReadingProgressProps = {
  /** Element id of the scrollable article/content to measure. */
  contentId: string;
};

/**
 * Fixed L→R reading progress bar (same pattern as CHAI Registry /guideline/api).
 * Scoped to a content element; sits just under the sticky docs topbar.
 */
export function ReadingProgress({ contentId }: ReadingProgressProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const content = document.getElementById(contentId);
    if (!content) return;

    let frame = 0;

    const update = () => {
      const rect = content.getBoundingClientRect();
      const contentTop = window.scrollY + rect.top;
      const contentHeight = Math.max(content.offsetHeight, 1);
      const viewportHeight = window.innerHeight;
      const start = contentTop - HEADER_OFFSET_PX;
      const end = contentTop + contentHeight - viewportHeight;
      const range = Math.max(end - start, 1);
      const next = Math.min(1, Math.max(0, (window.scrollY - start) / range));

      setProgress(next);
      setVisible(window.scrollY >= start - 8);
    };

    const onScrollOrResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [contentId]);

  const percent = Math.round(progress * 100);

  return (
    <div
      className={"reading-progress" + (visible ? " show" : "")}
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-hidden={!visible}
    >
      <div className="reading-progress-fill" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
