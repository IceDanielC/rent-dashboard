import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getApiHeaders } from '@/lib/api-headers'

async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(bytes))
    const text = decompressed.toString('utf-8')
    console.log('[hash-name] raw text:', text.slice(0, 300))
    return JSON.parse(text)
  }
  const text = Buffer.from(bytes).toString('utf-8')
  console.log('[hash-name] raw text:', text.slice(0, 300))
  return JSON.parse(text)
}

export async function GET(req: NextRequest) {
  const templateId = req.nextUrl.searchParams.get('templateId')
  if (!templateId) {
    return NextResponse.json({ error: '缺少参数 templateId' }, { status: 400 })
  }

  try {
    const headers = getApiHeaders()
    const res = await fetch(
      'https://api.youpin898.com/api/homepage/v3/detail/commodity/list/sell',
      {
        method: 'POST',
        headers: {
          ...headers,
          'Host': 'api.youpin898.com',
          'apptype': '3',
          'uk': process.env.YOUPIN_DEVICE_UK ?? '',
          'tracestate': 'bnro=iOS/26.4.2_iOS/8.15.100_NSURLSession',
          ...(process.env.YOUPIN_COOKIE ? { 'Cookie': process.env.YOUPIN_COOKIE } : {}),
        },
        body: JSON.stringify({
          AppType: '3',
          Platform: 'ios',
          Version: '5.43.0',
          appVersion: '5.43.0',
          SessionId: headers['DeviceToken'],
          userId: process.env.YOUPIN_USER_ID ?? '',
          templateId: Number(templateId),
          gameId: 730,
          listType: 10,
          sortType: 1,
          listSortType: 1,
          pageIndex: 1,
          pageSize: 1,
          mergeFlag: 0,
          hasSold: 'true',
          pageSourceCode: 'PG3000003',
          presaleMoreZones: 2,
          stickerAbrade: 0,
          haveBuZhangType: 0,
          autoDelivery: 0,
        }),
      }
    )

    const json = await decompressResponse(res) as {
      code: number
      data?: {
        commodityList?: Array<{ commodityHashName?: string }>
      }
    }

    if (json.code !== 0) {
      return NextResponse.json({ templateId, hashName: null, code: json.code })
    }

    const hashName = json.data?.commodityList?.[0]?.commodityHashName ?? null
    return NextResponse.json({ templateId, hashName })
  } catch (e) {
    console.error('[commodity/hash-name]', e)
    return NextResponse.json({ templateId, hashName: null })
  }
}
