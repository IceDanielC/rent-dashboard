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
  const day = parseInt(req.nextUrl.searchParams.get('day') ?? '30', 10) || 30

  try {
    const headers = getApiHeaders()
    const res = await fetch(
      'https://api.youpin898.com/api/youpin/price/trend/data',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          day,
          orderType: 2,
          templateId: Number(templateId),
        }),
      }
    )

    const json = await decompressResponse(res) as {
      code: number
      data?: {
        tradeDataList?: Array<{ price: string }>
      }
    }

    if (json.code !== 0) {
      return NextResponse.json({ templateId, avgRent: null, code: json.code })
    }

    const list = json.data?.tradeDataList ?? []
    if (list.length === 0) {
      return NextResponse.json({ templateId, avgRent: null })
    }

    const avg = list.reduce((sum, item) => sum + parseFloat(item.price), 0) / list.length
    return NextResponse.json({ templateId, avgRent: parseFloat(avg.toFixed(2)) })
  } catch (e) {
    console.error('[commodity/rent-trend]', e)
    return NextResponse.json({ templateId, avgRent: null })
  }
}
