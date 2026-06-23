import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getApiHeaders } from '@/lib/api-headers'

const VERSION = '5.45.0'
const GAME_ID = 730
const SOON_DUE_URL = 'https://api.youpin898.com/api/youpin/bff/new/commodity/v1/commodity/zero/cd/soon/due/list'
const LEASE_LIST_URL = 'https://api.youpin898.com/api/homepage/v3/detail/commodity/list/lease'
const PRICE_CHANGE_URL = 'https://api.youpin898.com/api/commodity/Commodity/PriceChangeWithLeaseV2'

function safeJsonParse(text: string): unknown {
  return JSON.parse(text.replace(/:\s*(\d{16,})/g, ': "$1"'))
}

async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(bytes))
    return safeJsonParse(decompressed.toString('utf-8'))
  }
  return safeJsonParse(Buffer.from(bytes).toString('utf-8'))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }
  if (typeof value !== 'string') {
    return NaN
  }
  const normalized = value.replace(/[,¥￥\s]/g, '')
  if (!normalized) {
    return NaN
  }
  return parseFloat(normalized)
}

function toMoneyString(value: number): string {
  return value.toFixed(2)
}

function isYoupinOk(json: unknown): json is { code?: number; Code?: number; msg?: string; Msg?: string; message?: string; data?: unknown; Data?: unknown } {
  if (typeof json !== 'object' || json === null) {
    return false
  }
  const data = json as { code?: unknown; Code?: unknown }
  return data.code === 0 || data.Code === 0
}

async function postYoupin(
  url: string,
  body: Record<string, unknown>,
  endpointName: string,
  method: 'POST' | 'PUT' = 'POST'
): Promise<unknown> {
  const headers = getApiHeaders()
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  })

  const json = await decompressResponse(res)

  if (!res.ok) {
    throw new Error(`${endpointName} HTTP ${res.status}`)
  }
  if (!isYoupinOk(json)) {
    const data = json as { code?: unknown; Code?: unknown; msg?: unknown; Msg?: unknown; message?: unknown }
    const code = data?.code ?? data?.Code ?? 'unknown'
    const message = data?.msg ?? data?.Msg ?? data?.message ?? ''
    throw new Error(`${endpointName} code=${String(code)} ${String(message)}`.trim())
  }
  return json
}

interface SoonDueItem {
  id?: string | number
  templateId?: string | number
  referencePrice?: string | number
}

interface PreparedItem {
  commodityId: string | number
  templateId: number
  referencePrice: number
  leaseDeposit: string
  leaseUnitPrice: string
  status: 'prepared' | 'skipped'
}

function buildCommonBody(headers: Record<string, string>): Record<string, string> {
  return {
    AppType: '3',
    Platform: 'ios',
    Version: VERSION,
    SessionId: headers['DeviceToken'],
  }
}

function buildCommodityPayload(item: PreparedItem) {
  return {
    NomarlChargePercent: '0.25',
    VipChargePercent: '0.2',
    OriginCompensationType: 7,
    PrivateLeaseCommodity: 0,
    LeaseDeposit: item.leaseDeposit,
    OpenLeaseActivity: 0,
    CompensationType: 7,
    Remark: '',
    LeaseUnitPrice: item.leaseUnitPrice,
    UseDepositSafeguard: 1,
    SupportZeroCD: 1,
    OpenUltraLongLease: 0,
    ZeroCDConfig: {
      SubletRate: '',
      MinCoefficient: '90',
      PricingType: 0,
    },
    VipSwitchStatus: 1,
    IsCanLease: true,
    LeaseMaxDays: 8,
    IsCanSold: false,
    LongLeaseDays: 21,
    CommodityId: item.commodityId,
  }
}

export async function POST(): Promise<Response> {
  const result: {
    total: number
    prepared: number
    submitted: number
    skipped: number
    errors: string[]
    items: PreparedItem[]
  } = { total: 0, prepared: 0, submitted: 0, skipped: 0, errors: [], items: [] }

  try {
    const headers = getApiHeaders()
    const commonBody = buildCommonBody(headers)

    const soonDueJson = await postYoupin(SOON_DUE_URL, commonBody, 'soonDueList') as {
      data?: { commodityInfoList?: SoonDueItem[] }
      Data?: { commodityInfoList?: SoonDueItem[]; CommodityInfoList?: SoonDueItem[] }
    }
    const commodities = soonDueJson.data?.commodityInfoList
      ?? soonDueJson.Data?.commodityInfoList
      ?? soonDueJson.Data?.CommodityInfoList
      ?? []
    result.total = commodities.length

    for (const commodity of commodities) {
      const commodityId = commodity.id
      const templateId = Number(commodity.templateId)
      const referencePrice = parseMoney(commodity.referencePrice)

      if (!commodityId || !Number.isFinite(templateId) || templateId <= 0 || !Number.isFinite(referencePrice)) {
        result.skipped++
        result.errors.push(`商品 ${String(commodityId ?? 'unknown')}: 缺少 id/templateId/referencePrice`)
        continue
      }

      await delay(500)

      try {
        const leaseJson = await postYoupin(LEASE_LIST_URL, {
          SessionId: headers['DeviceToken'],
          stickerAbrade: 0,
          haveBuZhangType: 0,
          sortTypeKey: 'LEASE_DEFAULT',
          Version: VERSION,
          gameId: GAME_ID,
          templateId,
          sortType: 1,
          listType: 30,
          Platform: 'ios',
        }, `leaseList templateId=${templateId}`) as {
          data?: { CommodityList?: Array<{ LeaseUnitPrice?: string | number }> }
          Data?: { CommodityList?: Array<{ LeaseUnitPrice?: string | number }> }
          CommodityList?: Array<{ LeaseUnitPrice?: string | number }>
        }

        const leaseUnitPrice = leaseJson.data?.CommodityList?.[0]?.LeaseUnitPrice
          ?? leaseJson.Data?.CommodityList?.[0]?.LeaseUnitPrice
          ?? leaseJson.CommodityList?.[0]?.LeaseUnitPrice
        const rentPrice = parseMoney(leaseUnitPrice) - 0.01

        if (!Number.isFinite(rentPrice)) {
          result.skipped++
          result.errors.push(`商品 ${String(commodityId)}: 未获取到有效 LeaseUnitPrice`)
          continue
        }

        result.items.push({
          commodityId,
          templateId,
          referencePrice,
          leaseDeposit: toMoneyString(referencePrice * 1.7),
          leaseUnitPrice: toMoneyString(rentPrice),
          status: 'prepared',
        })
        result.prepared++
      } catch (e) {
        result.skipped++
        result.errors.push(`商品 ${String(commodityId)}: ${String(e)}`)
      }
    }

    if (result.items.length === 0) {
      return NextResponse.json({
        ok: true,
        ...result,
        message: `未找到可提交商品，跳过 ${result.skipped} 个`,
      })
    }

    await postYoupin(PRICE_CHANGE_URL, {
      Commoditys: result.items.map(buildCommodityPayload),
      Version: VERSION,
      Platform: 'ios',
      GameID: String(GAME_ID),
      AppType: '3',
      SessionId: headers['DeviceToken'],
    }, 'priceChangeWithLeaseV2', 'PUT')

    result.submitted = result.items.length

    return NextResponse.json({
      ok: true,
      ...result,
      message: `设置完成：提交 ${result.submitted} 个，跳过 ${result.skipped} 个`,
    })
  } catch (e) {
    console.error('[commodity/one-click-set-lease-price]', e)
    return NextResponse.json({ ok: false, error: String(e), ...result }, { status: 500 })
  }
}
