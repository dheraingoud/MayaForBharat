import { atom } from 'nanostores';
import type { VercelConnection } from '@/lib/workbench/types/vercel';
import { logStore } from './logs';
import { toast } from 'react-toastify';

/**
 * Vercel connection store — uses MAYA's global DEPLOY_TOKEN.
 *
 * The user does NOT need to connect their own Vercel account.
 * All deployments go through MAYA's Vercel account using DEPLOY_TOKEN from .env.
 */

// Read the global deploy token from env (server-side: DEPLOY_TOKEN, client-side: NEXT_PUBLIC_DEPLOY_TOKEN, legacy: VITE_VERCEL_ACCESS_TOKEN)
const envToken =
  process.env?.DEPLOY_TOKEN ||
  process.env?.NEXT_PUBLIC_DEPLOY_TOKEN ||
  process.env?.VITE_VERCEL_ACCESS_TOKEN ||
  '';

// Initialize — always use the env token, skip localStorage for user accounts
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('vercel_connection') : null;
let initialConnection: VercelConnection;

if (storedConnection) {
  try {
    const parsed = JSON.parse(storedConnection);
    // If stored connection has a user and token, use it
    if (parsed.user && parsed.token) {
      initialConnection = parsed;
    } else {
      // Clear incomplete connection, use env token
      if (typeof window !== 'undefined') {
        localStorage.removeItem('vercel_connection');
      }
      initialConnection = {
        user: null,
        token: envToken,
        stats: undefined,
      };
    }
  } catch {
    initialConnection = {
      user: null,
      token: envToken,
      stats: undefined,
    };
  }
} else {
  initialConnection = {
    user: null,
    token: envToken,
    stats: undefined,
  };
}

export const vercelConnection = atom<VercelConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

export const updateVercelConnection = (updates: Partial<VercelConnection>) => {
  const currentState = vercelConnection.get();
  const newState = { ...currentState, ...updates };
  vercelConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('vercel_connection', JSON.stringify(newState));
  }
};

/**
 * Auto-connect to Vercel using the global DEPLOY_TOKEN.
 * Called automatically on app init — no user interaction needed.
 */
export async function autoConnectVercel() {
  const token = envToken;

  if (!token) {
    console.warn('[Vercel] No DEPLOY_TOKEN found in environment — deployment will not work');
    return { success: false, error: 'No deploy token configured' };
  }

  // If already connected, skip
  const current = vercelConnection.get();
  if (current.user) {
    return { success: true };
  }

  try {
    isConnecting.set(true);

    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const userData = (await response.json()) as any;

    updateVercelConnection({
      user: userData.user || userData,
      token,
    });

    logStore.logInfo('Auto-connected to Vercel', {
      type: 'system',
      message: `Connected to Vercel as ${userData.user?.username || userData.username}`,
    });

    // Fetch stats in background
    fetchVercelStats(token).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error('[Vercel] Auto-connect failed:', error);
    logStore.logError(`Vercel connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      type: 'system',
      message: 'Vercel auto-connection failed',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    isConnecting.set(false);
  }
}

export function initializeVercelConnection() {
  if (envToken && !vercelConnection.get().user) {
    autoConnectVercel().catch(() => {});
  }
}

export const fetchVercelStatsViaAPI = fetchVercelStats;

export async function fetchVercelStats(token: string) {
  try {
    isFetchingStats.set(true);

    const projectsResponse = await fetch('https://api.vercel.com/v9/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
    }

    const projectsData = (await projectsResponse.json()) as any;
    const projects = projectsData.projects || [];

    // Fetch latest deployment for each project
    const projectsWithDeployments = await Promise.all(
      projects.map(async (project: any) => {
        try {
          const deploymentsResponse = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            },
          );

          if (deploymentsResponse.ok) {
            const deploymentsData = (await deploymentsResponse.json()) as any;
            return {
              ...project,
              latestDeployments: deploymentsData.deployments || [],
            };
          }

          return project;
        } catch (error) {
          console.error(`Error fetching deployments for project ${project.id}:`, error);
          return project;
        }
      }),
    );

    const currentState = vercelConnection.get();
    updateVercelConnection({
      ...currentState,
      stats: {
        projects: projectsWithDeployments,
        totalProjects: projectsWithDeployments.length,
      },
    });
  } catch (error) {
    console.error('Vercel API Error:', error);
    logStore.logError('Failed to fetch Vercel stats', { error });
  } finally {
    isFetchingStats.set(false);
  }
}
