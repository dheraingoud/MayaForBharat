// Source: bolt.diy/app/utils/markdown.ts
// Ported: removed rehype-sanitize (different version), simplified for Next.js

import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import type { PluggableList, Plugin } from 'unified';

export const allowedHTMLElements = [
  'a', 'b', 'button', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins',
  'kbd', 'li', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'source', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'var', 'think', 'header',
];

// Custom remark plugin to handle <think> tags from reasoning models
function remarkThinkRawContent() {
  return (tree: any) => {
    const { visit } = require('unist-util-visit');
    visit(tree, (node: any) => {
      if (node.type === 'html' && node.value && node.value.startsWith('<think>')) {
        const cleanedContent = node.value.slice(7);
        node.value = `<div class="__boltThought__">${cleanedContent}`;
        return;
      }
      if (node.type === 'html' && node.value && node.value.startsWith('</think>')) {
        const cleanedContent = node.value.slice(8);
        node.value = `</div>${cleanedContent}`;
      }
    });
  };
}

export function remarkPlugins(limitedMarkdown: boolean) {
  const plugins: PluggableList = [remarkGfm];

  if (limitedMarkdown) {
    plugins.unshift(limitedMarkdownPlugin);
  }

  plugins.unshift(remarkThinkRawContent);

  return plugins;
}

export function rehypePlugins(html: boolean) {
  const plugins: PluggableList = [];

  if (html) {
    plugins.push(rehypeRaw);
  }

  return plugins;
}

const limitedMarkdownPlugin: Plugin = () => {
  return (tree: any, file: any) => {
    const { visit, SKIP } = require('unist-util-visit');
    const contents = file.toString();

    visit(tree, (node: any, index: number | null, parent: any) => {
      if (
        index == null ||
        ['paragraph', 'text', 'inlineCode', 'code', 'strong', 'emphasis'].includes(node.type) ||
        !node.position
      ) {
        return true;
      }

      let value = contents.slice(node.position.start.offset, node.position.end.offset);

      if (node.type === 'heading') {
        value = `\n${value}`;
      }

      parent.children[index] = {
        type: 'text',
        value,
      } as any;

      return [SKIP, index] as const;
    });
  };
};
