/**
 * Tiny zero-dep highlighter for API doc samples (curl / JS / Python).
 * Escapes HTML, then wraps tokens in <span class="tok-*">.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Lang = "curl" | "js" | "python" | "json";

const JS_KW =
  /\b(const|let|var|await|async|if|else|return|throw|new|function|import|from|export|class|typeof|instanceof)\b/g;
const PY_KW =
  /\b(import|from|as|with|def|return|if|else|elif|for|in|True|False|None|print|async|await)\b/g;

/** Highlight a string/token stream inside one line (no newlines in `chunk`). */
function paintLine(line: string, lang: Lang): string {
  // Split strings first so keywords inside them stay plain.
  const parts: { t: "str" | "code"; v: string }[] = [];
  const strRe =
    lang === "python"
      ? /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g
      : /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(strRe.source, "g");
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push({ t: "code", v: line.slice(last, m.index) });
    parts.push({ t: "str", v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ t: "code", v: line.slice(last) });

  return parts
    .map((p) => {
      if (p.t === "str") {
        return `<span class="tok-str">${escapeHtml(p.v)}</span>`;
      }
      let html = escapeHtml(p.v);
      // Comments (after escape — # and // are safe)
      if (lang === "python" || lang === "curl") {
        html = html.replace(/(#[^\n]*)/g, '<span class="tok-cmt">$1</span>');
      }
      if (lang === "js") {
        html = html.replace(/(\/\/[^\n]*)/g, '<span class="tok-cmt">$1</span>');
      }
      // Keywords
      if (lang === "js") {
        html = html.replace(JS_KW, '<span class="tok-kw">$1</span>');
      }
      if (lang === "python") {
        html = html.replace(PY_KW, '<span class="tok-kw">$1</span>');
      }
      if (lang === "curl") {
        // Flags before keywords so `--get` isn't split by the `get` keyword.
        html = html.replace(
          /(^|\s)(-{1,2}[\w-]+)/g,
          '$1<span class="tok-flag">$2</span>',
        );
        html = html.replace(/(^|\s)(curl)\b/g, '$1<span class="tok-kw">$2</span>');
      }
      if (lang === "json") {
        html = html.replace(
          /&quot;([^&]+)&quot;(?=\s*:)/g,
          '<span class="tok-key">&quot;$1&quot;</span>',
        );
        html = html.replace(
          /(:\s*)(&quot;(?:\\.|[^&])*&quot;|\d+\.?\d*|true|false|null)/g,
          '$1<span class="tok-str">$2</span>',
        );
      }
      // Numbers
      html = html.replace(
        /\b(\d+\.?\d*)\b/g,
        '<span class="tok-num">$1</span>',
      );
      return html;
    })
    .join("");
}

export function highlightSource(code: string, lang: Lang): string {
  return code
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      // Full-line comments
      if (
        (lang === "python" || lang === "curl") &&
        /^\s*#/.test(line)
      ) {
        return `<span class="tok-cmt">${escapeHtml(line)}</span>`;
      }
      if (lang === "js" && /^\s*\/\//.test(line)) {
        return `<span class="tok-cmt">${escapeHtml(line)}</span>`;
      }
      return paintLine(line, lang);
    })
    .join("\n");
}

export type { Lang as HighlightLang };
