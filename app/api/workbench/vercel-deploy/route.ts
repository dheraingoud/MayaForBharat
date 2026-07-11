// Source: bolt.diy/app/routes/api.vercel-deploy.ts
// Ported: Remix action/loader -> Next.js POST/GET handlers

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Bug 2026-07-11: the polling loop (60x2s = up to 2min) exceeded the Next.js
// Serverless default `maxDuration` (Hobby: 10s, Pro: 60s) and was terminated
// mid-deploy. Set explicitly to 300s so the route survives until polling
// completes or the upstream cap kicks in.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const token = searchParams.get('token');

  if (!projectId || !token) {
    return NextResponse.json({ error: 'Missing projectId or token' }, { status: 400 });
  }

  try {
    const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projectResponse.ok) return NextResponse.json({ error: 'Failed to fetch project' }, { status: 400 });

    const projectData = (await projectResponse.json()) as any;
    const deploymentsResponse = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!deploymentsResponse.ok) return NextResponse.json({ error: 'Failed to fetch deployments' }, { status: 400 });

    const deploymentsData = (await deploymentsResponse.json()) as any;
    const latestDeployment = deploymentsData.deployments?.[0];

    return NextResponse.json({
      project: { id: projectData.id, name: projectData.name, url: `https://${projectData.name}.vercel.app` },
      deploy: latestDeployment
        ? { id: latestDeployment.id, state: latestDeployment.state, url: latestDeployment.url ? `https://${latestDeployment.url}` : `https://${projectData.name}.vercel.app` }
        : null,
    });
  } catch (error) {
    console.error('Error fetching Vercel deployment:', error);
    return NextResponse.json({ error: 'Failed to fetch deployment' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Bug 2026-07-11: explicit size guard so callers hit a clear message
    // instead of NaN 4MB Next.js default limit with a generic 413.
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 3_500_000) {
      return NextResponse.json(
        { error: `Deployment too large (${(contentLength / 1_000_000).toFixed(1)}MB). Reduce source files or chunk the upload.` },
        { status: 413 },
      );
    }
    const { projectId, files, sourceFiles, token: clientToken, chatId, framework } = (await request.json()) as any;

    // Use client token if provided, otherwise fall back to global DEPLOY_TOKEN
    const token = clientToken || process.env.DEPLOY_TOKEN;

    if (!token) return NextResponse.json({ error: 'No deployment token configured' }, { status: 401 });

    let targetProjectId = projectId;
    let projectInfo: any;

    if (!targetProjectId) {
      const projectName = `maya-${chatId}-${Date.now()}`;
      const createRes = await fetch('https://api.vercel.com/v9/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, framework: framework || null }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json()) as any;
        return NextResponse.json({ error: `Failed to create project: ${err.error?.message || 'Unknown'}` }, { status: 400 });
      }
      const newProject = (await createRes.json()) as any;
      targetProjectId = newProject.id;
      projectInfo = { id: newProject.id, name: newProject.name, url: `https://${newProject.name}.vercel.app`, chatId };
    } else {
      const projRes = await fetch(`https://api.vercel.com/v9/projects/${targetProjectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (projRes.ok) {
        const existing = (await projRes.json()) as any;
        projectInfo = { id: existing.id, name: existing.name, url: `https://${existing.name}.vercel.app`, chatId };
      }
    }

    const deploymentFiles = [];
    const filesToUse = sourceFiles || files;
    for (const [filePath, content] of Object.entries(filesToUse)) {
      const p = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      deploymentFiles.push({ file: p, data: content });
    }

    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectInfo?.name, project: targetProjectId, target: 'production', files: deploymentFiles }),
    });

    if (!deployRes.ok) {
      const err = (await deployRes.json()) as any;
      return NextResponse.json({ error: `Deploy failed: ${err.error?.message || 'Unknown'}` }, { status: 400 });
    }

    const deployData = (await deployRes.json()) as any;
    let retryCount = 0;
    let deploymentUrl = '';
    let deploymentState = '';

    while (retryCount < 60) {
      const statusRes = await fetch(`https://api.vercel.com/v13/deployments/${deployData.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statusRes.ok) {
        const status = (await statusRes.json()) as any;
        deploymentState = status.readyState;
        deploymentUrl = status.url ? `https://${status.url}` : '';
        if (status.readyState === 'READY' || status.readyState === 'ERROR') break;
      }
      retryCount++;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (deploymentState === 'ERROR') return NextResponse.json({ error: 'Deployment failed' }, { status: 500 });

    return NextResponse.json({
      success: true,
      deploy: { id: deployData.id, state: deploymentState, url: projectInfo?.url || deploymentUrl },
      project: projectInfo,
    });
  } catch (error) {
    console.error('Vercel deploy error:', error);
    return NextResponse.json({ error: 'Deployment failed' }, { status: 500 });
  }
}