// @ts-nocheck
import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import styles from './Markdown.module.scss';

const streamdownPlugins = { cjk, code, math, mermaid };

interface MarkdownProps {
  children: string;
  isStreaming?: boolean;
}

/**
 * Discards <boltArtifact>/<boltAction> XML from assistant prose so the chat
 * UI renders pure markdown. MAYA's real generation engine is the detached
 * Convex generateJobsHandler + extractBoltFiles (writes apps.fileTree →
 * mounts BuilderPage, survives browser close); bolt XML in the chat stream is
 * a cosmetic echo of the route.ts text and must NOT render as cards or raw
 * tags here. Handles complete, self-closing, mid-stream-unclosed, and
 * orphan-close forms.
 */
export const stripBoltXml = (input: string) => {
  if (!input) return input;
  let out = input;
  // Complete artifact (swallows nested boltAction content)
  out = out.replace(/<boltArtifact\b[\s\S]*?<\/boltArtifact>/gi, '');
  // Orphan boltAction outside an artifact
  out = out.replace(/<boltAction\b[\s\S]*?<\/boltAction>/gi, '');
  // Self-closing
  out = out.replace(/<bolt(?:Artifact|Action)\b[^>]*\/>/gi, '');
  // Mid-stream unclosed (block still streaming): drop open tag + rest
  out = out.replace(/<bolt(?:Artifact|Action)\b[\s\S]*$/gi, '');
  // Orphan close tags
  out = out.replace(/<\/bolt(?:Artifact|Action)>/gi, '');
  return out;
};

export const Markdown = memo(
  ({ children, isStreaming = false }: MarkdownProps) => (
    <Streamdown
      className={styles.MarkdownContent}
      mode={isStreaming ? 'streaming' : 'static'}
      plugins={streamdownPlugins}
      shikiTheme={['github-dark', 'github-dark']}
    >
      {stripBoltXml(children)}
    </Streamdown>
  ),
  // Re-render only when prose changes (or streaming state flips) — Streamdown
  // is internally memoized; with raw parts now feeding the chat the prose IS
  // the live token-by-token text so this preserves progressive streaming.
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && prevProps.isStreaming === nextProps.isStreaming,
);

/**
 * Removes code fence markers (```) surrounding an artifact element while preserving the artifact content.
 * This is necessary because artifacts should not be wrapped in code blocks when rendered for rendering action list.
 *
 * @param content - The markdown content to process
 * @returns The processed content with code fence markers removed around artifacts
 *
 * @example
 * // Removes code fences around artifact
 * const input = "```xml\n<div class='__boltArtifact__'></div>\n```";
 * stripCodeFenceFromArtifact(input);
 * // Returns: "\n<div class='__boltArtifact__'></div>\n"
 *
 * @remarks
 * - Only removes code fences that directly wrap an artifact (marked with __boltArtifact__ class)
 * - Handles code fences with optional language specifications (e.g. ```xml, ```typescript)
 * - Preserves original content if no artifact is found
 * - Safely handles edge cases like empty input or artifacts at start/end of content
 */
export const stripCodeFenceFromArtifact = (content: string) => {
  if (!content || !content.includes('__boltArtifact__')) {
    return content;
  }

  const lines = content.split('\n');
  const artifactLineIndex = lines.findIndex((line) => line.includes('__boltArtifact__'));

  // Return original content if artifact line not found
  if (artifactLineIndex === -1) {
    return content;
  }

  // Check previous line for code fence
  if (artifactLineIndex > 0 && lines[artifactLineIndex - 1]?.trim().match(/^```\w*$/)) {
    lines[artifactLineIndex - 1] = '';
  }

  if (artifactLineIndex < lines.length - 1 && lines[artifactLineIndex + 1]?.trim().match(/^```$/)) {
    lines[artifactLineIndex + 1] = '';
  }

  return lines.join('\n');
};
