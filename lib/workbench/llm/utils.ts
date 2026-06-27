// Source: bolt.diy/app/lib/.server/llm/utils.ts
// Ported: Message → UIMessage, DEFAULT_PROVIDER → LLMManager, message.content → parts-aware

import type { UIMessage } from 'ai';
import { DEFAULT_MODEL, MODEL_REGEX, PROVIDER_REGEX } from '@/lib/workbench/utils/constants';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import ignore from 'ignore';
import type { ContextAnnotation } from '@/lib/workbench/types/context';

export function extractPropertiesFromMessage(message: Omit<UIMessage, 'id'> | any): {
  model: string;
  provider: string;
  content: string;
} {
  // AI SDK v6: UIMessage uses parts, but we also handle legacy content string
  let textContent: string;
  if (typeof message.content === 'string') {
    textContent = message.content;
  } else if (Array.isArray(message.parts)) {
    textContent = message.parts
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('');
  } else if (Array.isArray(message.content)) {
    textContent = message.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('');
  } else {
    textContent = String(message.content || '');
  }

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;
  // Default to first provider if not specified
  const provider = providerMatch ? providerMatch[1] : 'NvidiaNIM';

  const cleanedContent = textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyBoltActions(input: string): string {
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean) {
  const ig = ignore().add(IGNORE_PATTERNS);
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x]!.type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = path.replace('/home/project/', '');
      }

      return `<boltAction type="file" filePath="${filePath}">${codeWithLinesNumbers}</boltAction>`;
    });

  return `<boltArtifact id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n</boltArtifact>`;
}

export function extractCurrentContext(messages: UIMessage[]) {
  const lastAssistantMessage = messages.filter((x) => x.role == 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!(lastAssistantMessage as any).annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < (lastAssistantMessage as any).annotations.length; i++) {
    const annotation = (lastAssistantMessage as any).annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!annotation.type) {
      continue;
    }

    if (annotation.type === 'codeContext') {
      codeContext = annotation;
      break;
    } else if (annotation.type === 'chatSummary') {
      summary = annotation;
      break;
    }
  }

  return { summary, codeContext };
}
