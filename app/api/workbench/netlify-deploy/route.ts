// Source: bolt.diy/app/routes/api.netlify-deploy.ts
// Ported: Remix action -> Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface DeployRequestBody {
  siteId?: string;
  files: Record<string, string>;
  chatId: string;
  token: string;
}

async function readNetlifyError(response: Response) {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { message?: string; error?: string } | undefined;
      return data?.message || data?.error || JSON.stringify(data);
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { siteId, files, token, chatId } = (await request.json()) as DeployRequestBody;

    if (!token) {
      return NextResponse.json({ error: 'Not connected to Netlify' }, { status: 401 });
    }

    let targetSiteId = siteId;

    if (!targetSiteId) {
      const siteName = `maya-${chatId}-${Date.now()}`;
      const createSiteResponse = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName }),
      });

      if (!createSiteResponse.ok) {
        const err = await readNetlifyError(createSiteResponse);
        return NextResponse.json({ error: `Failed to create site: ${err}` }, { status: createSiteResponse.status });
      }

      const newSite = (await createSiteResponse.json()) as any;
      targetSiteId = newSite.id;
    }

    const fileDigests: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(files)) {
      const p = filePath.startsWith('/') ? filePath : '/' + filePath;
      fileDigests[p] = crypto.createHash('sha1').update(content).digest('hex');
    }

    const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: fileDigests, async: true, draft: false }),
    });

    if (!deployResponse.ok) {
      const err = await readNetlifyError(deployResponse);
      return NextResponse.json({ error: `Deploy failed: ${err}` }, { status: deployResponse.status });
    }

    const deploy = (await deployResponse.json()) as any;
    let retryCount = 0;
    let filesUploaded = false;

    while (retryCount < 60) {
      const statusRes = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys/${deploy.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!statusRes.ok) break;

      const status = (await statusRes.json()) as any;

      if (!filesUploaded && (status.state === 'prepared' || status.state === 'uploaded')) {
        for (const [filePath, content] of Object.entries(files)) {
          const p = filePath.startsWith('/') ? filePath : '/' + filePath;
          const encoded = p.split('/').map((s: string) => encodeURIComponent(s)).join('/');
          await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${encoded}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
            body: content,
          });
        }
        filesUploaded = true;
      }

      if (status.state === 'ready') {
        return NextResponse.json({ success: true, deploy: { id: status.id, state: status.state, url: status.ssl_url || status.url } });
      }
      if (status.state === 'error') {
        return NextResponse.json({ error: status.error_message || 'Deploy failed' }, { status: 500 });
      }

      retryCount++;
      await new Promise((r) => setTimeout(r, 1000));
    }

    return NextResponse.json({ success: true, deploy: { id: deploy.id, state: deploy.state } });
  } catch (error) {
    console.error('Deploy error:', error);
    return NextResponse.json({ error: 'Deployment failed' }, { status: 500 });
  }
}