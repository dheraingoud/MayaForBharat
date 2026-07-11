// Source: bolt.diy/app/routes/api.bug-report.ts
// Ported: Remix action -> Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const bugReportSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  stepsToReproduce: z.string().max(1000).optional(),
  expectedBehavior: z.string().max(1000).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  includeEnvironmentInfo: z.boolean().default(false),
  environmentInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    screenResolution: z.string().optional(),
    boltVersion: z.string().optional(),
    aiProviders: z.string().optional(),
    projectType: z.string().optional(),
    currentModel: z.string().optional(),
  }).optional(),
});

function sanitizeInput(input: string): string {
  return input.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(ip);
  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 3600000 });
    return true;
  }
  if (limit.count >= 5) return false;
  limit.count++;
  return true;
}

function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
}

function formatIssueBody(data: z.infer<typeof bugReportSchema>): string {
  let body = '**Bug Report** (User Submitted)\n\n';
  body += `**Description:**\n${data.description}\n\n`;
  if (data.stepsToReproduce) body += `**Steps to Reproduce:**\n${data.stepsToReproduce}\n\n`;
  if (data.expectedBehavior) body += `**Expected Behavior:**\n${data.expectedBehavior}\n\n`;
  if (data.includeEnvironmentInfo && data.environmentInfo) {
    body += '**Environment Info:**\n';
    const env = data.environmentInfo;
    if (env.browser) body += `- Browser: ${env.browser}\n`;
    if (env.os) body += `- OS: ${env.os}\n`;
    if (env.screenResolution) body += `- Screen: ${env.screenResolution}\n`;
    if (env.boltVersion) body += `- Version: ${env.boltVersion}\n`;
    body += '\n';
  }
  if (data.contactEmail) body += `**Contact:** ${data.contactEmail}\n\n`;
  body += '---\n*Submitted via MAYA bug report feature*';
  return body;
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const formData = await request.formData();
    const rawData: any = Object.fromEntries(formData.entries());

    if (rawData.environmentInfo && typeof rawData.environmentInfo === 'string') {
      try { rawData.environmentInfo = JSON.parse(rawData.environmentInfo); } catch { rawData.environmentInfo = undefined; }
    }
    rawData.includeEnvironmentInfo = rawData.includeEnvironmentInfo === 'true';

    const validatedData = bugReportSchema.parse(rawData);
    const sanitizedData = {
      ...validatedData,
      title: sanitizeInput(validatedData.title),
      description: sanitizeInput(validatedData.description),
      stepsToReproduce: validatedData.stepsToReproduce ? sanitizeInput(validatedData.stepsToReproduce) : undefined,
      expectedBehavior: validatedData.expectedBehavior ? sanitizeInput(validatedData.expectedBehavior) : undefined,
    };

    const githubToken = process.env.GITHUB_BUG_REPORT_TOKEN;
    const targetRepo = process.env.BUG_REPORT_REPO || 'stackblitz-labs/bolt.diy';

    if (!githubToken) {
      return NextResponse.json({ error: 'Bug reporting not configured.' }, { status: 500 });
    }

    const octokit = new Octokit({ auth: githubToken, userAgent: 'maya-bug-reporter' });
    const [owner, repo] = targetRepo.split('/');
    const issue = await octokit.rest.issues.create({
      owner, repo,
      title: sanitizedData.title,
      body: formatIssueBody(sanitizedData),
      labels: ['bug', 'user-reported'],
    });

    return NextResponse.json({
      success: true,
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
      message: 'Bug report submitted successfully!',
    });
  } catch (error) {
    console.error('Error creating bug report:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to submit bug report.' }, { status: 500 });
  }
}