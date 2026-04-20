import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getApiHeaders } from '@/lib/api-headers'

async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(bytes))
    return JSON.parse(decompressed.toString('utf-8'))
  }
  return JSON.parse(Buffer.from(bytes).toString('utf-8'))
}

interface InventoryItem {
  templateId: number
  templateUniqueKey: string
  commodityName: string
  assetBuyPrice: string
  assetMergeCount: number
  marketPrice: string
  iconUrl: string
  profitAndLossPrice: string
  profitAndLossRange: string
}

export async function GET() {
  try {
    const headers = getApiHeaders()
    const res = await fetch(
      'https://api.youpin898.com/api/youpin/commodity-agg/inventory/trend/data',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          AppType: '3',
          Platform: 'ios',
          Version: '5.43.0',
          SessionId: headers['DeviceToken'],
          pageIndex: 1,
          pageSize: 500,
          queryType: 1,
          forceRefresh: true,
        }),
      }
    )

    const json = await decompressResponse(res) as {
      code: number
      data?: {
        itemsInfos?: InventoryItem[]
        buyPriceTotal?: string
        totalCount?: string
        profitAndLossTotal?: string
        totalPages?: number
      }
    }

    if (json.code !== 0) {
      return NextResponse.json({ error: `接口返回 code=${json.code}` }, { status: 502 })
    }

    const items = (json.data?.itemsInfos ?? []).map(item => ({
      templateId:         item.templateId,
      commodityName:      item.commodityName,
      assetBuyPrice:      parseFloat(item.assetBuyPrice ?? '0') || 0,
      assetMergeCount:    item.assetMergeCount ?? 0,
      marketPrice:        parseFloat(item.marketPrice ?? '0') || 0,
      iconUrl:            item.iconUrl ?? '',
      profitAndLossPrice: parseFloat(item.profitAndLossPrice ?? '0') || 0,
      profitAndLossRange: parseFloat(item.profitAndLossRange ?? '0') || 0,
    }))

    return NextResponse.json({
      ok: true,
      items,
      buyPriceTotal:       parseFloat(json.data?.buyPriceTotal ?? '0') || 0,
      totalCount:          parseInt(json.data?.totalCount ?? '0') || 0,
      profitAndLossTotal:  parseFloat(json.data?.profitAndLossTotal ?? '0') || 0,
    })
  } catch (e) {
    console.error('[commodity/inventory]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
