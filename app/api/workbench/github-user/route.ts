// Source: bolt.diy/app/routes/api.github-user.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getApiKeysFromCookie } from '@/lib/workbench/api/cookies';
import { withSecurity } from '@/lib/workbench/security';

async function githubUserLoader({ request }: { request: Request }) {
  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get GitHub token from various sources
    const githubToken =
      apiKeys.GITHUB_API_KEY ||
      apiKeys.VITE_GITHUB_ACCESS_TOKEN ||
      process.env?.GITHUB_TOKEN ||
      process.env?.VITE_GITHUB_ACCESS_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.VITE_GITHUB_ACCESS_TOKEN;

    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not found' }, { status: 401 });
    }

    // Make server-side request to GitHub API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'bolt.diy-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ error: 'Invalid GitHub token' }, { status: 401 });
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = (await response.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
      type: string;
    };

    return NextResponse.json({
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
      type: userData.type,
    });
  } catch (error) {
    console.error('Error fetching GitHub user:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch GitHub user information',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Remix loader converted to GET handler
export const GET = withSecurity(githubUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function githubUserAction({ request }: { request: Request }) {
  try {
    let action: string | null = null;
    let repoFullName: string | null = null;
    let searchQuery: string | null = null;
    let perPage: number = 30;

    // Handle both JSON and form data
    const contentType = request.headers.get('Content-Type') || '';

    if (contentType.includes('application/json')) {
      const jsonData = (await request.json()) as any;
      action = jsonData.action;
      repoFullName = jsonData.repo;
      searchQuery = jsonData.query;
      perPage = jsonData.per_page || 30;
    } else {
      const formData = await request.formData();
      action = formData.get('action') as string;
      repoFullName = formData.get('repo') as string;
      searchQuery = formData.get('query') as string;
      perPage = parseInt(formData.get('per_page') as string) || 30;
    }

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get GitHub token from various sources
    const githubToken =
      apiKeys.GITHUB_API_KEY ||
      apiKeys.VITE_GITHUB_ACCESS_TOKEN ||
      process.env?.GITHUB_TOKEN ||
      process.env?.VITE_GITHUB_ACCESS_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.VITE_GITHUB_ACCESS_TOKEN;

    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not found' }, { status: 401 });
    }

    if (action === 'get_repos') {
      // Fetch user repositories
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
          'User-Agent': 'bolt.diy-app',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const repos = (await response.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        html_url: string;
        description: string | null;
        private: boolean;
        language: string | null;
        updated_at: string;
        stargazers_count: number;
        forks_count: number;
        topics: string[];
      }>;

      return NextResponse.json({
        repos: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          private: repo.private,
          language: repo.language,
          updated_at: repo.updated_at,
          stargazers_count: repo.stargazers_count || 0,
          forks_count: repo.forks_count || 0,
          topics: repo.topics || [],
        })),
      });
    }

    if (action === 'get_branches') {
      if (!repoFullName) {
        return NextResponse.json({ error: 'Repository name is required' }, { status: 400 });
      }

      // Fetch repository branches
      const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
          'User-Agent': 'bolt.diy-app',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const branches = (await response.json()) as Array<{
        name: string;
        commit: {
          sha: string;
          url: string;
        };
        protected: boolean;
      }>;

      return NextResponse.json({
        branches: branches.map((branch) => ({
          name: branch.name,
          commit: {
            sha: branch.commit.sha,
            url: branch.commit.url,
          },
          protected: branch.protected,
        })),
      });
    }

    if (action === 'get_token') {
      // SECURITY FIX (2026-07-11): previously returned the full GitHub PAT in
      // the response body, which any same-origin JS (XSS or malicious client
      // code) could exfiltrate by calling this endpoint. The token MUST stay
      // server-side — store it as an httpOnly cookie via /api/auth if/when
      // any client flow actually needs the auth header. Until then, refuse
      // the request outright.
      return NextResponse.json(
        { error: 'get_token action removed for security — token is server-only' },
        { status: 410 },
      );
    }

    if (action === 'search_repos') {
      if (!searchQuery) {
        return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
      }

      // Search repositories using GitHub API
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${perPage}&sort=updated`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${githubToken}`,
            'User-Agent': 'bolt.diy-app',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const searchData = (await response.json()) as {
        total_count: number;
        incomplete_results: boolean;
        items: Array<{
          id: number;
          name: string;
          full_name: string;
          html_url: string;
          description: string | null;
          private: boolean;
          language: string | null;
          updated_at: string;
          stargazers_count: number;
          forks_count: number;
          topics: string[];
          owner: {
            login: string;
            avatar_url: string;
          };
        }>;
      };

      return NextResponse.json({
        repos: searchData.items.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          private: repo.private,
          language: repo.language,
          updated_at: repo.updated_at,
          stargazers_count: repo.stargazers_count || 0,
          forks_count: repo.forks_count || 0,
          topics: repo.topics || [],
          owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
          },
        })),
        total_count: searchData.total_count,
        incomplete_results: searchData.incomplete_results,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in GitHub user action:', error);
    return NextResponse.json(
      {
        error: 'Failed to process GitHub request',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Remix action converted to POST handler
export const POST = withSecurity(githubUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
