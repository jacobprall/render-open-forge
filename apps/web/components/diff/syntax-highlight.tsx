import React, { type ReactNode } from "react";

interface Token {
  text: string;
  type: "keyword" | "string" | "comment" | "number" | "default";
}

const COLORS: Record<Token["type"], string> = {
  keyword: "text-purple-400",
  string: "text-amber-300",
  comment: "text-zinc-500 italic",
  number: "text-sky-400",
  default: "",
};

type LangRules = Array<{ type: Token["type"]; pattern: RegExp }>;

const RULES_JS: LangRules = [
  { type: "comment", pattern: /\/\/.*$|\/\*[\s\S]*?\*\//gm },
  { type: "string", pattern: /`(?:\\[\s\S]|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
  { type: "keyword", pattern: /\b(?:abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\b/g },
  { type: "number", pattern: /\b(?:0[xX][\dA-Fa-f]+|0[oO][0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g },
];

const RULES_PYTHON: LangRules = [
  { type: "comment", pattern: /#.*$/gm },
  { type: "string", pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
  { type: "keyword", pattern: /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|self|try|True|False|while|with|yield)\b/g },
  { type: "number", pattern: /\b(?:0[xX][\dA-Fa-f]+|0[oO][0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g },
];

const RULES_GO: LangRules = [
  { type: "comment", pattern: /\/\/.*$|\/\*[\s\S]*?\*\//gm },
  { type: "string", pattern: /`[^`]*`|"(?:\\.|[^"\\])*"/g },
  { type: "keyword", pattern: /\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|nil|true|false|iota)\b/g },
  { type: "number", pattern: /\b(?:0[xX][\dA-Fa-f]+|0[oO][0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g },
];

const RULES_RUST: LangRules = [
  { type: "comment", pattern: /\/\/.*$|\/\*[\s\S]*?\*\//gm },
  { type: "string", pattern: /"(?:\\.|[^"\\])*"/g },
  { type: "keyword", pattern: /\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|union|unsafe|use|where|while)\b/g },
  { type: "number", pattern: /\b(?:0[xX][\dA-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?[\d_]+)?)\b/g },
];

const RULES_HTML: LangRules = [
  { type: "comment", pattern: /<!--[\s\S]*?-->/g },
  { type: "string", pattern: /"[^"]*"|'[^']*'/g },
  { type: "keyword", pattern: /\b(?:html|head|body|div|span|a|p|h[1-6]|ul|ol|li|table|tr|td|th|form|input|button|img|link|script|style|meta|title|nav|section|article|header|footer|main|class|id|src|href|type|rel|name|value|placeholder)\b/g },
  { type: "number", pattern: /\b\d+\.?\d*\b/g },
];

const RULES_CSS: LangRules = [
  { type: "comment", pattern: /\/\*[\s\S]*?\*\//g },
  { type: "string", pattern: /"[^"]*"|'[^']*'/g },
  { type: "keyword", pattern: /\b(?:import|media|keyframes|font-face|supports|charset)\b|@[\w-]+/g },
  { type: "number", pattern: /\b\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/g },
];

const RULES_JSON: LangRules = [
  { type: "string", pattern: /"(?:\\.|[^"\\])*"/g },
  { type: "keyword", pattern: /\b(?:true|false|null)\b/g },
  { type: "number", pattern: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g },
];

const RULES_YAML: LangRules = [
  { type: "comment", pattern: /#.*$/gm },
  { type: "string", pattern: /"(?:\\.|[^"\\])*"|'[^']*'/g },
  { type: "keyword", pattern: /\b(?:true|false|null|yes|no|on|off)\b/gi },
  { type: "number", pattern: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g },
];

const RULES_SHELL: LangRules = [
  { type: "comment", pattern: /#.*$/gm },
  { type: "string", pattern: /"(?:\\.|[^"\\])*"|'[^']*'/g },
  { type: "keyword", pattern: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|source|local|readonly|declare|typeset|unset|shift|eval|exec|set|trap)\b/g },
  { type: "number", pattern: /\b\d+\b/g },
];

const LANG_MAP: Record<string, LangRules> = {
  js: RULES_JS,
  jsx: RULES_JS,
  ts: RULES_JS,
  tsx: RULES_JS,
  javascript: RULES_JS,
  typescript: RULES_JS,
  py: RULES_PYTHON,
  python: RULES_PYTHON,
  go: RULES_GO,
  rust: RULES_RUST,
  rs: RULES_RUST,
  html: RULES_HTML,
  htm: RULES_HTML,
  css: RULES_CSS,
  scss: RULES_CSS,
  json: RULES_JSON,
  yaml: RULES_YAML,
  yml: RULES_YAML,
  sh: RULES_SHELL,
  bash: RULES_SHELL,
  zsh: RULES_SHELL,
  shell: RULES_SHELL,
};

function tokenize(line: string, rules: LangRules): Token[] {
  const marks = new Uint8Array(line.length); // 0 = unclaimed
  const tokens: Array<{ start: number; end: number; type: Token["type"] }> = [];

  for (const rule of rules) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (marks[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = start; i < end; i++) marks[i] = 1;
        tokens.push({ start, end, type: rule.type });
      }
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  const result: Token[] = [];
  let pos = 0;
  for (const t of tokens) {
    if (t.start > pos) {
      result.push({ text: line.slice(pos, t.start), type: "default" });
    }
    result.push({ text: line.slice(t.start, t.end), type: t.type });
    pos = t.end;
  }
  if (pos < line.length) {
    result.push({ text: line.slice(pos), type: "default" });
  }
  return result;
}

export function highlightLine(line: string, lang: string): ReactNode {
  const rules = LANG_MAP[lang.toLowerCase()];
  if (!rules) return line;

  const tokens = tokenize(line, rules);
  if (tokens.length <= 1 && tokens[0]?.type === "default") return line;

  return (
    <>
      {tokens.map((tok, i) => {
        const cls = COLORS[tok.type];
        return cls ? (
          <span key={i} className={cls}>
            {tok.text}
          </span>
        ) : (
          <React.Fragment key={i}>{tok.text}</React.Fragment>
        );
      })}
    </>
  );
}

export function detectLangFromDiff(raw: string): string {
  const fileMatch = raw.match(/^diff --git a\/(.+?) b\//m);
  if (!fileMatch) return "";
  const filename = fileMatch[1]!;
  const ext = filename.split(".").pop() ?? "";
  return ext;
}
