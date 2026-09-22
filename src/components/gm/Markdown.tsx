"use client";
/**
 * Minimal markdown renderer for GM narration.
 *
 * Styled to match the design language: serif prose, hairline rules,
 * sharp corners — nothing decorated. GFM (tables, task lists) supported.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings: serif, smaller than default, with a hairline rule.
        h1: (p) => <h2 className="mt-4 mb-1 border-b border-ink-200 pb-1 font-serif text-lg font-semibold" {...p} />,
        h2: (p) => <h3 className="mt-3 mb-1 font-serif text-base font-semibold" {...p} />,
        h3: (p) => <h4 className="mt-2 font-serif text-sm font-semibold uppercase tracking-wide text-ink-600" {...p} />,
        h4: (p) => <h5 className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500" {...p} />,
        p: (p) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...p} />,
        ul: (p) => <ul className="my-1.5 ml-4 list-disc space-y-0.5" {...p} />,
        ol: (p) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5" {...p} />,
        li: (p) => <li className="pl-0.5" {...p} />,
        blockquote: (p) => (
          <blockquote className="my-2 border-l-2 border-accent/60 pl-3 italic text-ink-600" {...p} />
        ),
        hr: () => <hr className="my-3 border-ink-200" />,
        strong: (p) => <strong className="font-semibold text-ink-900" {...p} />,
        em: (p) => <em className="italic" {...p} />,
        a: (p) => <a className="underline underline-offset-2 hover:text-accent" target="_blank" rel="noreferrer" {...p} />,
        code: ({ className, children, ...props }) => {
          const isBlock = typeof className === "string" && className.includes("language-");
          return isBlock ? (
            <code className="mono block overflow-x-auto border border-ink-200 bg-ink-100 p-2 text-xs" {...props}>
              {children}
            </code>
          ) : (
            <code className="mono rounded-sm border border-ink-200 px-1 text-xs" {...props}>
              {children}
            </code>
          );
        },
        pre: (p) => <pre className="my-2" {...p} />,
        table: (p) => (
          <table className="my-2 w-full border-collapse text-xs" {...p} />
        ),
        th: (p) => <th className="border border-ink-300 bg-ink-100 px-2 py-1 text-left font-semibold" {...p} />,
        td: (p) => <td className="border border-ink-200 px-2 py-1" {...p} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
});
