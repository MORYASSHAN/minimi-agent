import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Source } from '../../shared/types';

/** Turn "[3]" / "[2, 5]" into links the renderer can recognise, outside code blocks only. */
function linkCitations(md: string): string {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_m, ids: string) =>
            ids
              .split(',')
              .map((id) => `[${id.trim()}](#cite-${id.trim()})`)
              .join(''),
          ),
    )
    .join('');
}

export const Markdown = memo(function Markdown({ text, sources }: { text: string; sources: Source[] }) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith('#cite-')) {
        const id = Number(href.slice(6));
        const source = byId.get(id);
        if (!source) return <span className="cite cite--missing">{id}</span>;
        return (
          <a className="cite" href={source.url} target="_blank" rel="noreferrer" title={`${source.title} — ${source.domain}`}>
            {id}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  };
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
});
