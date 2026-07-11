import type { WebContainer } from '@webcontainer/api';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { webcontainer as webcontainerPromise } from '@/lib/workbench/webcontainer';
import git, { type GitAuth, type PromiseFsClient } from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';

const lookupSavedPassword = (url: string) => {
  const domain = url.split('/')[2];
  const gitCreds = Cookies.get(`git:${domain}`);

  if (!gitCreds) {
    return null;
  }

  try {
    const { username, password } = JSON.parse(gitCreds || '{}');
    return { username, password };
  } catch (error) {
    console.log(`Failed to parse Git Cookie ${error}`);
    return null;
  }
};

const saveGitAuth = (url: string, auth: GitAuth) => {
  const domain = url.split('/')[2];
  // SECURITY (2026-07-11): cookie hardening — sameSite=lax blocks CSRF,
  // Secure blocks non-HTTPS exfil. HttpOnly must be set server-side;
  // that's deferred until we route auth via a server cookie endpoint.
  Cookies.set(`git:${domain}`, JSON.stringify(auth), {
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: 30,
  });
};

export function useGit() {
  const [ready, setReady] = useState(false);
  const [webcontainer, setWebcontainer] = useState<WebContainer>();
  const [fs, setFs] = useState<PromiseFsClient>();
  const fileData = useRef<Record<string, { data: any; encoding?: string }>>({});
  useEffect(() => {
    webcontainerPromise.then((container) => {
      fileData.current = {};
      setWebcontainer(container);
      setFs(getFs(container, fileData));
      setReady(true);
    });
  }, []);

  const gitClone = useCallback(
    async (url: string, retryCount = 0) => {
      if (!webcontainer || !fs || !ready) {
        throw new Error('Webcontainer not initialized. Please try again later.');
      }

      fileData.current = {};

      let branch: string | undefined;
      let baseUrl = url;

      if (url.includes('#')) {
        [baseUrl, branch] = url.split('#');
      }

      /*
       * Skip Git initialization for now - let isomorphic-git handle it
       * This avoids potential issues with our manual initialization
       */

      const headers: {
        [x: string]: string;
      } = {
        'User-Agent': 'bolt.diy',
      };

      const auth = lookupSavedPassword(url);

      if (auth) {
        headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      }

      try {
        // Add a small delay before retrying to allow for network recovery
        if (retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
          console.log(`Retrying git clone (attempt ${retryCount + 1})...`);
        }

        await git.clone({
          fs,
          http,
          dir: webcontainer.workdir,
          url: baseUrl,
          depth: 1,
          singleBranch: true,
          ref: branch,
          corsProxy: '/api/workbench/git-proxy',
          headers,
          onProgress: (event) => {
            console.log('Git clone progress:', event);
          },
          onAuth: (baseUrl) => {
            let auth = lookupSavedPassword(baseUrl);

            if (auth) {
              console.log('Using saved authentication for', baseUrl);
              return auth;
            }

            console.log('Repository requires authentication:', baseUrl);

            if (confirm('This repository requires authentication. Would you like to enter your GitHub credentials?')) {
              auth = {
                username: prompt('Enter username') || '',
                password: prompt('Enter password or personal access token') || '',
              };
              return auth;
            } else {
              return { cancel: true };
            }
          },
          onAuthFailure: (baseUrl, _auth) => {
            console.error(`Authentication failed for ${baseUrl}`);
            toast.error(
              `Authentication failed for ${baseUrl.split('/')[2]}. Please check your credentials and try again.`,
            );
            throw new Error(
              `Authentication failed for ${baseUrl.split('/')[2]}. Please check your credentials and try again.`,
            );
          },
          onAuthSuccess: (baseUrl, auth) => {
            console.log(`Authentication successful for ${baseUrl}`);
            saveGitAuth(baseUrl, auth);
          },
        });

        const data: Record<string, { data: any; encoding?: string }> = {};

        for (const [key, value] of Object.entries(fileData.current)) {
          data[key] = value;
        }

        return { workdir: webcontainer.workdir, data };
      } catch (error) {
        console.error('Git clone error:', error);

        // Handle specific error types
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for common error patterns
        if (errorMessage.includes('Authentication failed')) {
          toast.error(`Authentication failed. Please check your GitHub credentials and try again.`);
          throw error;
        } else if (
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ECONNREFUSED')
        ) {
          toast.error(`Network error while connecting to repository. Please check your internet connection.`);

          // Retry for network errors, up to 3 times
          if (retryCount < 3) {
            return gitClone(url, retryCount + 1);
          }

          throw new Error(
            `Failed to connect to repository after multiple attempts. Please check your internet connection.`,
          );
        } else if (errorMessage.includes('404')) {
          toast.error(`Repository not found. Please check the URL and make sure the repository exists.`);
          throw new Error(`Repository not found. Please check the URL and make sure the repository exists.`);
        } else if (errorMessage.includes('401')) {
          toast.error(`Unauthorized access to repository. Please connect your GitHub account with proper permissions.`);
          throw new Error(
            `Unauthorized access to repository. Please connect your GitHub account with proper permissions.`,
          );
        } else {
          toast.error(`Failed to clone repository: ${errorMessage}`);
          throw error;
        }
      }
    },
    [webcontainer, fs, ready],
  );

  // ── Snapshot API (post-clone commit + push) ───────────────────────────
  // Workflow: clone repo → edit files in WebContainer → click "Snapshot"
  // → we stage dirty files, commit, and push to GitHub.

  const gitEnsureRepo = useCallback(async () => {
    if (!webcontainer || !fs || !ready) {
      throw new Error('Webcontainer not initialized. Please try again later.');
    }

    const workdir = webcontainer.workdir;

    try {
      const has = await fs.promises.stat(`${workdir}/.git`).catch(() => null);
      if (has) return;
    } catch {
      /* init below */
    }

    await git.init({ fs, dir: workdir, defaultBranch: 'main' });

    // Default .gitignore so statusMatrix skips generated dirs.
    // node_modules alone is too large to push.
    const defaultIgnore = [
      'node_modules/',
      '.next/',
      'dist/',
      '.vercel/',
      '*.log',
      '.env',
      '.env.local',
      '.DS_Store',
      'bun.lockb',
      'package-lock.json',
      '.maya/',
    ].join('\n');

    await fs.promises
      .writeFile(`${workdir}/.gitignore`, defaultIgnore, 'utf-8')
      .catch((e: unknown) => console.warn('useGit: failed to write .gitignore', e));
  }, [webcontainer, fs, ready]);

  const gitCurrentBranch = useCallback(async (): Promise<string> => {
    if (!webcontainer || !fs || !ready) throw new Error('Webcontainer not initialized.');
    const branches = await git.listBranches({ fs, dir: webcontainer.workdir });
    if (branches.includes('main')) return 'main';
    if (branches.length > 0) return branches[0]!;
    return 'main';
  }, [webcontainer, fs, ready]);

  /**
   * Stage every changed file (excluding node_modules etc.) and commit.
   * Returns the commit SHA.
   */
  const gitCommit = useCallback(
    async (message: string) => {
      if (!webcontainer || !fs || !ready) {
        throw new Error('Webcontainer not initialized. Please try again later.');
      }

      const workdir = webcontainer.workdir;
      await gitEnsureRepo();

      const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.vercel', '.maya']);
      const SKIP_FILES = new Set([
        '.DS_Store',
        '.env',
        '.env.local',
        'bun.lockb',
        'package-lock.json',
      ]);

      const matrix = (await git.statusMatrix({
        fs,
        dir: workdir,
        filter: (filepath) => {
          if (!filepath || filepath === '.') return false;
          return !filepath.split('/').some((p) => SKIP_DIRS.has(p));
        },
      })) as Array<[string, number, number, number]>;

      for (const [filepath, headCode, workdirCode, stageCode] of matrix) {
        if (SKIP_FILES.has(filepath)) continue;

        // Stage anything where workdir ≠ stage, or stage ≠ HEAD.
        if (workdirCode !== stageCode || headCode !== stageCode) {
          try {
            await git.add({ fs, dir: workdir, filepath });
          } catch (err) {
            console.warn(`useGit: failed to add ${filepath}`, err);
          }
        }
      }

      const sha = await git.commit({
        fs,
        dir: workdir,
        message,
        author: { name: 'MAYA', email: 'noreply@maya.local' },
      });

      return sha;
    },
    [webcontainer, fs, ready, gitEnsureRepo],
  );

  /**
   * Push the current branch to origin using stored GitHub credentials.
   * Requires GitHub connection (cookie 'githubToken') and a configured
   * 'origin' remote (created by gitClone).
   */
  const gitPush = useCallback(async (): Promise<{ ref: string }> => {
    if (!webcontainer || !fs || !ready) {
      throw new Error('Webcontainer not initialized. Please try again later.');
    }

    const ref = await gitCurrentBranch();
    const token = Cookies.get('githubToken');

    const onAuth = () => {
      if (!token) {
        toast.error('Not authenticated with GitHub. Connect GitHub first.');
        return { cancel: true as const };
      }
      return { username: token, password: 'x-oauth-basic' };
    };

    try {
      await git.push({
        fs,
        http,
        dir: webcontainer.workdir,
        remote: 'origin',
        ref,
        onAuth,
        corsProxy: '/api/workbench/git-proxy',
      });

      return { ref };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Push failed: ${msg}`);
    }
  }, [webcontainer, fs, ready, gitCurrentBranch]);

  /**
   * One-click snapshot: stage + commit + push.
   */
  const gitSnapshot = useCallback(
    async (message: string): Promise<{ sha: string; ref: string }> => {
      const cleanMessage = (message || '').trim() || 'snapshot via MAYA';
      const sha = await gitCommit(cleanMessage);
      const { ref } = await gitPush();
      return { sha, ref };
    },
    [gitCommit, gitPush],
  );

  return { ready, gitClone, gitCommit, gitPush, gitSnapshot, gitEnsureRepo };
}

const getFs = (
  webcontainer: WebContainer,
  record: MutableRefObject<Record<string, { data: any; encoding?: string }>>,
) => ({
  promises: {
    readFile: async (path: string, options: any) => {
      const encoding = options?.encoding;
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        const result = await webcontainer.fs.readFile(relativePath, encoding);

        return result;
      } catch (error) {
        throw error;
      }
    },
    writeFile: async (path: string, data: any, options: any = {}) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      if (record.current) {
        record.current[relativePath] = { data, encoding: options?.encoding };
      }

      try {
        // Handle encoding properly based on data type
        if (data instanceof Uint8Array) {
          // For binary data, don't pass encoding
          const result = await webcontainer.fs.writeFile(relativePath, data);
          return result;
        } else {
          // For text data, use the encoding if provided
          const encoding = options?.encoding || 'utf8';
          const result = await webcontainer.fs.writeFile(relativePath, data, encoding);

          return result;
        }
      } catch (error) {
        throw error;
      }
    },
    mkdir: async (path: string, options: any) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        const result = await webcontainer.fs.mkdir(relativePath, { ...options, recursive: true });

        return result;
      } catch (error) {
        throw error;
      }
    },
    readdir: async (path: string, options: any) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        const result = await webcontainer.fs.readdir(relativePath, options);

        return result;
      } catch (error) {
        throw error;
      }
    },
    rm: async (path: string, options: any) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        const result = await webcontainer.fs.rm(relativePath, { ...(options || {}) });

        return result;
      } catch (error) {
        throw error;
      }
    },
    rmdir: async (path: string, options: any) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        const result = await webcontainer.fs.rm(relativePath, { recursive: true, ...options });

        return result;
      } catch (error) {
        throw error;
      }
    },
    unlink: async (path: string) => {
      const relativePath = pathUtils.relative(webcontainer.workdir, path);

      try {
        return await webcontainer.fs.rm(relativePath, { recursive: false });
      } catch (error) {
        throw error;
      }
    },
    stat: async (path: string) => {
      try {
        const relativePath = pathUtils.relative(webcontainer.workdir, path);
        const dirPath = pathUtils.dirname(relativePath);
        const fileName = pathUtils.basename(relativePath);

        // Special handling for .git/index file
        if (relativePath === '.git/index') {
          return {
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
            size: 12, // Size of our empty index
            mode: 0o100644, // Regular file
            mtimeMs: Date.now(),
            ctimeMs: Date.now(),
            birthtimeMs: Date.now(),
            atimeMs: Date.now(),
            uid: 1000,
            gid: 1000,
            dev: 1,
            ino: 1,
            nlink: 1,
            rdev: 0,
            blksize: 4096,
            blocks: 1,
            mtime: new Date(),
            ctime: new Date(),
            birthtime: new Date(),
            atime: new Date(),
          };
        }

        const resp = await webcontainer.fs.readdir(dirPath, { withFileTypes: true });
        const fileInfo = resp.find((x) => x.name === fileName);

        if (!fileInfo) {
          const err = new Error(`ENOENT: no such file or directory, stat '${path}'`) as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          err.errno = -2;
          err.syscall = 'stat';
          err.path = path;
          throw err;
        }

        return {
          isFile: () => fileInfo.isFile(),
          isDirectory: () => fileInfo.isDirectory(),
          isSymbolicLink: () => false,
          size: fileInfo.isDirectory() ? 4096 : 1,
          mode: fileInfo.isDirectory() ? 0o040755 : 0o100644, // Directory or regular file
          mtimeMs: Date.now(),
          ctimeMs: Date.now(),
          birthtimeMs: Date.now(),
          atimeMs: Date.now(),
          uid: 1000,
          gid: 1000,
          dev: 1,
          ino: 1,
          nlink: 1,
          rdev: 0,
          blksize: 4096,
          blocks: 8,
          mtime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          atime: new Date(),
        };
      } catch (error: any) {
        if (!error.code) {
          error.code = 'ENOENT';
          error.errno = -2;
          error.syscall = 'stat';
          error.path = path;
        }

        throw error;
      }
    },
    lstat: async (path: string) => {
      return await getFs(webcontainer, record).promises.stat(path);
    },
    readlink: async (path: string) => {
      throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
    },
    symlink: async (target: string, path: string) => {
      /*
       * Since WebContainer doesn't support symlinks,
       * we'll throw a "operation not supported" error
       */
      throw new Error(`EPERM: operation not permitted, symlink '${target}' -> '${path}'`);
    },

    chmod: async (_path: string, _mode: number) => {
      /*
       * WebContainer doesn't support changing permissions,
       * but we can pretend it succeeded for compatibility
       */
      return await Promise.resolve();
    },
  },
});

const pathUtils = {
  dirname: (path: string) => {
    // Handle empty or just filename cases
    if (!path || !path.includes('/')) {
      return '.';
    }

    // Remove trailing slashes
    path = path.replace(/\/+$/, '');

    // Get directory part
    return path.split('/').slice(0, -1).join('/') || '/';
  },

  basename: (path: string, ext?: string) => {
    // Remove trailing slashes
    path = path.replace(/\/+$/, '');

    // Get the last part of the path
    const base = path.split('/').pop() || '';

    // If extension is provided, remove it from the result
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }

    return base;
  },
  relative: (from: string, to: string): string => {
    // Handle empty inputs
    if (!from || !to) {
      return '.';
    }

    // Normalize paths by removing trailing slashes and splitting
    const normalizePathParts = (p: string) => p.replace(/\/+$/, '').split('/').filter(Boolean);

    const fromParts = normalizePathParts(from);
    const toParts = normalizePathParts(to);

    // Find common parts at the start of both paths
    let commonLength = 0;
    const minLength = Math.min(fromParts.length, toParts.length);

    for (let i = 0; i < minLength; i++) {
      if (fromParts[i] !== toParts[i]) {
        break;
      }

      commonLength++;
    }

    // Calculate the number of "../" needed
    const upCount = fromParts.length - commonLength;

    // Get the remaining path parts we need to append
    const remainingPath = toParts.slice(commonLength);

    // Construct the relative path
    const relativeParts = [...Array(upCount).fill('..'), ...remainingPath];

    // Handle empty result case
    return relativeParts.length === 0 ? '.' : relativeParts.join('/');
  },
};
