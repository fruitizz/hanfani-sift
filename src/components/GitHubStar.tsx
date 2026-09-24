import { useEffect, useState } from "react";
import { GITHUB_API, GITHUB_URL } from "../lib/github.ts";

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Star gate: link to the repo with a live stargazer count. */
export function GitHubStar({ className = "" }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(GITHUB_API, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { stargazers_count?: number };
        if (!cancelled && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
        }
      } catch {
        /* offline / rate limit — link still works without a count */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      className={"gh-star" + (className ? ` ${className}` : "")}
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Star on GitHub"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
        />
      </svg>
      <span className="gh-star-label">Star</span>
      {stars !== null && <span className="gh-star-count">{formatStars(stars)}</span>}
    </a>
  );
}
