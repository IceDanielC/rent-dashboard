import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getApiHeaders } from '@/lib/api-headers'

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const pageIndex = Number(body.pageIndex) || 1
    const pageSize = Number(body.pageSize) || 20

    const headers = getApiHeaders()

    const res = await fetch(
      'https://api.youpin898.com/api/youpin/bff/trade/sale/v1/buy/list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pageSize,
          Version: '5.44.1',
          AppType: '3',
          orderStatus: 340,
          SessionId: headers['DeviceToken'],
          pageIndex,
          Platform: 'ios',
        }),
      }
    )

    const json = await decompressResponse(res) as {
      code: number
      data?: {
        total?: number | null
        orderList?: unknown[]
      }
    }

    if (json.code !== 0) {
      return NextResponse.json({ ok: false, error: `code=${json.code}` }, { status: 502 })
    }

    const orderList = json.data?.orderList ?? []
    return NextResponse.json({
      ok: true,
      orderList,
      hasMore: orderList.length === pageSize,
      pageIndex,
    })
  } catch (e) {
    console.error('[merchant-total/buy-list]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
