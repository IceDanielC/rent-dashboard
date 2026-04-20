import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(req: NextRequest) {
  const templateId = req.nextUrl.searchParams.get('templateId')
  if (!templateId) {
    return NextResponse.json({ error: '缺少参数 templateId' }, { status: 400 })
  }

  try {
    const headers = getApiHeaders()
    const res = await fetch(
      'https://api.youpin898.com/api/youpin/bff/trade/purchase/order/getTemplatePurchaseOrderPageList',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          AppType: '3',
          Platform: 'ios',
          Version: '5.43.0',
          SessionId: headers['DeviceToken'],
          templateId,
          pageIndex: 1,
          pageSize: 50,
          showMaxPriceFlag: false,
          maxAbrade: '1',
          minAbrade: '0',
        }),
      }
    )

    const json = await decompressResponse(res) as {
      code: number
      data?: {
        responseList?: Array<{ purchasePrice: number }>
      }
    }

    if (json.code !== 0) {
      console.warn(`[purchase-price] templateId=${templateId} code=${json.code}`, JSON.stringify(json))
      return NextResponse.json({ templateId, purchasePrice: null, code: json.code })
    }

    const list = json.data?.responseList ?? []
    const purchasePrice = list.length > 0 ? list[0].purchasePrice : null

    return NextResponse.json({ templateId, purchasePrice })
  } catch (e) {
    console.error('[commodity/purchase-price]', e)
    return NextResponse.json({ templateId, purchasePrice: null })
  }
}
