// Source: bolt.diy/app/utils/markdown.ts — stripped to allowedHTMLElements only.
// Chat markdown is now rendered by Streamdown (see chat/Markdown.tsx); the
// remark/rehype plugin functions + the rehype-raw dependency were removed in M1.
// `allowedHTMLElements` remains because prompt/LLM utils (prompts.ts,
// new-prompt.ts, stream-text.ts) still import it to constrain model output.

export const allowedHTMLElements = [
  'a', 'b', 'button', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins',
  'kbd', 'li', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'source', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'var', 'think', 'header',
];
