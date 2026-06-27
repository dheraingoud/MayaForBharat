import { NextResponse } from 'next/server'
import { getMayaTiers, getRouterStatus } from '@/lib/workbench/llm/nim-router'

/**
 * GET /api/maya-models
 *
 * Returns the MAYA tier model configuration + NIM router status.
 * All data comes from nim-router.ts — the single source of truth.
 *
 * To change models: edit .env (MAYA_MINI, MAYA_FAST, MAYA_MAX, MAYA_VERIFIER)
 * To add new models to the catalog: edit nim-router.ts NIM_MODEL_CATALOG
 */
export async function GET() {
  const tiers = getMayaTiers()
  const status = getRouterStatus()

  return NextResponse.json({
    ...tiers,
    _meta: {
      catalogSize: status.catalogSize,
      nimEndpoint: status.endpoint,
      nimKeysConfigured: status.keys.totalKeys,
      nimKeysHealthy: status.keys.healthyKeys,
    },
  })
}
