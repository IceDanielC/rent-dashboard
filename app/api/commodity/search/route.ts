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
  const keyword = req.nextUrl.searchParams.get('keyword')
  if (!keyword) {
    return NextResponse.json({ error: '缺少参数 keyword' }, { status: 400 })
  }

  try {
    const headers = getApiHeaders()
    const res = await fetch(
      'https://api.youpin898.com/api/homepage/search/match',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          AppType: '3',
          Platform: 'ios',
          Version: '5.43.0',
          SessionId: headers['DeviceToken'],
          userId: process.env.YOUPIN_USER_ID ?? '',
          gameId: 730,
          listType: '10',
          keyWords: keyword,
        }),
      }
    )

    const json = await decompressResponse(res) as {
      Code: number
      Msg?: string
      Data?: {
        dataList?: Array<{
          templateId: number
          commodityName: string
        }>
      }
    }

    if (json.Code !== 0) {
      return NextResponse.json({ ok: false, error: `code=${json.Code} ${json.Msg ?? ''}`, items: [] })
    }

    const items = (json.Data?.dataList ?? [])
      .filter(item => item.templateId && item.commodityName)
      .map(item => ({
        templateId: item.templateId,
        commodityName: item.commodityName,
      }))

    return NextResponse.json({ ok: true, items })
  } catch (e) {
    console.error('[commodity/search]', e)
    return NextResponse.json({ ok: false, error: String(e), items: [] }, { status: 500 })
  }
}
