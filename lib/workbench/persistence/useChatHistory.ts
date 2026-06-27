// @ts-nocheck
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type UIMessage } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { logStore } from '@/lib/workbench/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
} from './db';
import type { FileMap } from '@/lib/workbench/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '@/lib/workbench/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '@/lib/workbench/utils/projectCommands';
import type { ContextAnnotation } from '@/lib/workbench/types/context';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: UIMessage[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !process.env.NEXT_PUBLIC_DISABLE_PERSISTENCE;

let _dbPromise: ReturnType<typeof openDatabase> | undefined;
function getDb() {
  if (!persistenceEnabled) return undefined;
  if (!_dbPromise) _dbPromise = openDatabase();
  return _dbPromise;
}


// Lazy-initialized db promise — resolved on demand inside useEffect
export let db: Awaited<ReturnType<typeof openDatabase>> | undefined;

// Internal promise for hooks to await
export function getDbPromise(): Promise<Awaited<ReturnType<typeof openDatabase>> | undefined> {
  if (typeof window === 'undefined' || !persistenceEnabled) {
    return Promise.resolve(undefined);
  }
  return (getDb() ?? Promise.resolve(undefined)).then((d) => {
    db = d;
    return d;
  }).catch(() => {
    db = undefined;
    return undefined;
  });
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);
export function useChatHistory() {
  const navigate = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const mixedId = (params?.id as string) || undefined;

  const [archivedMessages, setArchivedMessages] = useState<UIMessage[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    // Await the DB promise to avoid race condition where db is undefined on first render
    getDbPromise().then((resolvedDb) => {
      if (!resolvedDb) {
        setReady(true);

        if (persistenceEnabled) {
          const error = new Error('Chat persistence is unavailable');
          logStore.logError('Chat persistence initialization failed', error);
          toast.error('Chat persistence is unavailable');
        }

        return;
      }

      if (!mixedId) {
        setReady(true);
        return;
      }

      Promise.all([
        getMessages(resolvedDb, mixedId),
        getSnapshot(resolvedDb, mixedId),
      ])
        .then(async ([storedMessages, snapshot]) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            /*
             * const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`); // Remove localStorage usage
             * const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} }; // Use snapshot from DB
             */
            const validSnapshot = snapshot || { chatIndex: '', files: {} }; // Ensure snapshot is not undefined
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;
            const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: UIMessage[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x); // Type assertion
              const projectCommands = await detectProjectCommands(files);

              // Call the modified function to get only the command actions string
              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`, // Removed newline
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',

                  // Combine followup UIMessage and the artifact with files and command actions
                  content: `MAYA Restored your chat from a snapshot. You can revert this UIMessage to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `, // Added commandActionsString, followupMessage, updated id and title
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },

                // Remove the separate user and assistant messages for commands
                /*
                 *...(commands !== null // This block is no longer needed
                 *  ? [ ... ]
                 *  : []),
                 */
                ...filteredMessages,
              ];
              restoreSnapshot(mixedId, validSnapshot);
            }

            setInitialMessages(filteredMessages);

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);
          } else {
            // No messages found — start fresh with empty chat (don't redirect)
            // The URL ID may be an app ID rather than a chat ID
            chatId.set(mixedId);
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);
          logStore.logError('Failed to load chat messages or snapshot', error);
          toast.error('Failed to load chat: ' + (error instanceof Error ? error.message : String(error)));
          setReady(true);
        });
    });
  }, [mixedId, navigate, searchParams]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();
      const resolvedDb = await getDbPromise();

      if (!id || !resolvedDb) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      try {
        await setSnapshot(resolvedDb, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [],
  );

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    const container = await webcontainer;
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    // First pass: create folders (must be done before files)
    for (const [key, value] of Object.entries(validSnapshot.files)) {
      if (value?.type === 'folder') {
        const normalizedKey = key.startsWith(container.workdir)
          ? key.replace(container.workdir, '')
          : key;
        try {
          await container.fs.mkdir(normalizedKey, { recursive: true });
        } catch {
          // Folder may already exist
        }
      }
    }

    // Second pass: write files
    for (const [key, value] of Object.entries(validSnapshot.files)) {
      if (value?.type === 'file') {
        const normalizedKey = key.startsWith(container.workdir)
          ? key.replace(container.workdir, '')
          : key;
        try {
          await container.fs.writeFile(normalizedKey, value.content, {
            encoding: value.isBinary ? undefined : 'utf8',
          });
        } catch (error) {
          console.warn(`[restoreSnapshot] Failed to write ${normalizedKey}:`, error);
        }
      }
    }
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();
      const resolvedDb = await getDbPromise();

      if (!resolvedDb || !id) {
        return;
      }

      try {
        await setMessages(resolvedDb, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: UIMessage[]) => {
      const resolvedDb = await getDbPromise();

      if (!resolvedDb || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      // Only generate artifact-based URL when chatId is not already set from an appId.
      // When chatId is pre-set (e.g., from BuilderPage with appId="5"), we must NOT
      // navigate to a different URL, or the ID mismatch will lose messages on reload.
      const existingChatId = chatId.get();
      if (!urlId && !existingChatId && firstArtifact?.id) {
        const newUrlId = await getUrlId(resolvedDb, firstArtifact.id);
        _urlId = newUrlId;
        navigateChat(newUrlId);
        setUrlId(newUrlId);
      } else if (!urlId && existingChatId) {
        // Use the existing chatId as the urlId to keep IDB key aligned with URL
        _urlId = existingChatId;
        setUrlId(existingChatId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      // Filter out node_modules, .git, and other heavy directories before snapshot
      const allFiles = workbenchStore.files.get();
      const filteredSnapshotFiles: typeof allFiles = {};
      const EXCLUDE_PATTERNS = ['/node_modules/', '/.git/', '/dist/', '/.next/', '/build/'];
      for (const [path, value] of Object.entries(allFiles)) {
        if (value && !EXCLUDE_PATTERNS.some(p => path.includes(p))) {
          filteredSnapshotFiles[path] = value;
        }
      }
      takeSnapshot(messages[messages.length - 1].id, filteredSnapshotFiles, _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      // Only generate a new ID if chatId is completely unset.
      // If BuilderPage already set chatId (e.g., from appId prop), don't override it.
      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(resolvedDb);

        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      // Ensure chatId.get() is used for the final setMessages call
      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      await setMessages(
        resolvedDb,
        finalChatId,
        [...archivedMessages, ...messages],
        _urlId,
        description.get(),
        undefined,
        chatMetadata.get(),
      );
    },
    duplicateCurrentChat: async (listItemId: string) => {
      const resolvedDb = await getDbPromise();

      if (!resolvedDb || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(resolvedDb, mixedId || listItemId);
        navigate.push(`/workbench/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: UIMessage[], metadata?: IChatMetadata) => {
      const resolvedDb = await getDbPromise();

      if (!resolvedDb) {
        toast.error('Chat persistence is unavailable');
        return;
      }

      try {
        const newId = await createChatFromMessages(resolvedDb, description, messages, metadata);
        window.location.href = `/workbench/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        toast.error('Failed to import chat: ' + (error instanceof Error ? error.message : String(error)));
      }
    },
    exportChat: async (id = urlId) => {
      const resolvedDb = await getDbPromise();

      if (!resolvedDb || !id) {
        return;
      }

      const chat = await getMessages(resolvedDb, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/workbench/${nextId}`;

  window.history.replaceState({}, '', url);
}
