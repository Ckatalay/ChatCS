import { memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CheckIcon, CopyIcon } from "./icons";

/** Pull `language-xxx` off the <code> hast node that rehype-highlight tagged. */
function languageOf(node: unknown): string {
  const child = (node as { children?: { properties?: { className?: unknown } }[] })
    ?.children?.[0];
  const classes = child?.properties?.className;
  if (!Array.isArray(classes)) return "text";

  const tag = classes.find(
    (c): c is string => typeof c === "string" && c.startsWith("language-")
  );
  return tag ? tag.slice("language-".length) : "text";
}

function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: ReactNode;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(preRef.current?.textContent ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — leave the
      // code selectable and say nothing.
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span>{language}</span>
        <button type="button" className="copy-button" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    return <CodeBlock language={languageOf(node)}>{children}</CodeBlock>;
  },
  table({ children }) {
    return (
      <div className="table-scroll">
        <table>{children}</table>
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

const remarkPlugins = [remarkGfm];
// detect:false — guessing a language for an unlabelled fence mislabels plain
// config/log output (an sshd_config block gets tagged "perl") and colours it wrong.
const rehypePlugins = [
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
];

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={rehypePlugins as any}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
