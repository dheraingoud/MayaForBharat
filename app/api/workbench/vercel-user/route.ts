// Source: bolt.diy/app/routes/api.vercel-user.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { getApiKeysFromCookie } from '@/lib/workbench/api/cookies';
import { withSecurity } from '@/lib/workbench/security';

async function vercelUserLoader({ request }: { request: Request }) {
  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Vercel token from various sources
    let vercelToken =
      apiKeys.VITE_VERCEL_ACCESS_TOKEN ||
      process.env?.VITE_VERCEL_ACCESS_TOKEN ||
      process.env.VITE_VERCEL_ACCESS_TOKEN;

    // Also check for token in request headers (for direct API calls)
    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return NextResponse.json({ error: 'Vercel token not found' }, { status: 401 });
    }

    // Make server-side request to Vercel API
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'User-Agent': 'bolt.diy-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ error: 'Invalid Vercel token' }, { status: 401 });
      }

      throw new Error(`Vercel API error: ${response.status}`);
    }

    const userData = (await response.json()) as {
      user: {
        id: string;
        name: string | null;
        email: string;
        avatar: string | null;
        username: string;
      };
    };

    return NextResponse.json({
      id: userData.user.id,
      name: userData.user.name,
      email: userData.user.email,
      avatar: userData.user.avatar,
      username: userData.user.username,
    });
  } catch (error) {
    console.error('Error fetching Vercel user:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch Vercel user information',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Remix loader converted to GET handler
export const GET = withSecurity(vercelUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function vercelUserAction({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const action = formData.get('action');

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Vercel token from various sources
    let vercelToken =
      apiKeys.VITE_VERCEL_ACCESS_TOKEN ||
      process.env?.VITE_VERCEL_ACCESS_TOKEN ||
      process.env.VITE_VERCEL_ACCESS_TOKEN;

    // Also check for token in request headers (for direct API calls)
    if (!vercelToken) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader && authHeader.startsWith('Bearer ')) {
        vercelToken = authHeader.substring(7);
      }
    }

    if (!vercelToken) {
      return NextResponse.json({ error: 'Vercel token not found' }, { status: 401 });
    }

    if (action === 'get_projects') {
      // Fetch user projects
      const response = await fetch('https://api.vercel.com/v13/projects', {
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'User-Agent': 'bolt.diy-app',
        },
      });

      if (!response.ok) {
        throw new Error(`Vercel API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        projects: Array<{
          id: string;
          name: string;
          framework: string | null;
          public: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
      };

      return NextResponse.json({
        projects: data.projects.map((project) => ({
          id: project.id,
          name: project.name,
          framework: project.framework,
          public: project.public,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
        totalProjects: data.projects.length,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in Vercel user action:', error);
    return NextResponse.json(
      {
        error: 'Failed to process Vercel request',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Remix action converted to POST handler
export const POST = withSecurity(vercelUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
