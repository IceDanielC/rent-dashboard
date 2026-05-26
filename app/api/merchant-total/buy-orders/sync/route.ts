import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getApiHeaders } from '@/lib/api-headers'
import { getDb } from '@/lib/db'

const PAGE_SIZE = 20

function safeJsonParse(text: string): unknown {
  return JSON.parse(text.replace(/:\s*(\d{16,})/g, ': "$1"'))
}

async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    return safeJsonParse(gunzipSync(Buffer.from(bytes)).toString('utf-8'))
  }
  return safeJsonParse(Buffer.from(bytes).toString('utf-8'))
}

interface OrderItem {
  orderNo?: string
  totalAmount?: number
  finishOrderTime?: number
  createOrderTime?: number
  sellerUserName?: string
  productDetail?: {
    commodityName?: string
    exteriorName?: string
    abrade?: string | null
    iconUrl?: string
    typeName?: string
    rarityName?: string
    rarityColor?: string
  }
}

export async function POST(): Promise<Response> {
  try {
    const db = getDb()
    const insert = db.prepare(`
      INSERT OR IGNORE INTO buy_orders
        (order_no, commodity_name, exterior_name, abrade, icon_url,
         type_name, rarity_name, rarity_color,
         total_amount, finish_order_time, create_order_time, seller_user_name)
      VALUES
        (@order_no, @commodity_name, @exterior_name, @abrade, @icon_url,
         @type_name, @rarity_name, @rarity_color,
         @total_amount, @finish_order_time, @create_order_time, @seller_user_name)
    `)

    let page = 1
    let added = 0
    let totalFetched = 0

    while (true) {
      const headers = getApiHeaders()
      const res = await fetch(
        'https://api.youpin898.com/api/youpin/bff/trade/sale/v1/buy/list',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pageSize: PAGE_SIZE,
            Version: '5.44.1',
            AppType: '3',
            orderStatus: 340,
            SessionId: headers['DeviceToken'],
            pageIndex: page,
            Platform: 'ios',
          }),
        }
      )

      const json = await decompressResponse(res) as {
        code: number
        data?: { orderList?: OrderItem[] }
      }

      if (json.code !== 0) {
        return NextResponse.json({ ok: false, error: `code=${json.code} at page ${page}` }, { status: 502 })
      }

      const list = json.data?.orderList ?? []
      totalFetched += list.length

      for (const order of list) {
        if (!order.orderNo) continue
        const p = order.productDetail ?? {}
        const result = insert.run({
          order_no:          order.orderNo,
          commodity_name:    p.commodityName   ?? '',
          exterior_name:     p.exteriorName    ?? '',
          abrade:            p.abrade          ?? '',
          icon_url:          p.iconUrl         ?? '',
          type_name:         p.typeName        ?? '',
          rarity_name:       p.rarityName      ?? '',
          rarity_color:      p.rarityColor     ?? '',
          total_amount:      order.totalAmount  ?? 0,
          finish_order_time: order.finishOrderTime  ?? null,
          create_order_time: order.createOrderTime  ?? null,
          seller_user_name:  order.sellerUserName   ?? '',
        })
        if (result.changes > 0) added++
      }

      // 不足 PAGE_SIZE 说明已到最后一页
      if (list.length < PAGE_SIZE) break

      page++
      await new Promise(r => setTimeout(r, 500))
    }

    const total = (db.prepare('SELECT COUNT(*) as c FROM buy_orders').get() as { c: number }).c
    return NextResponse.json({ ok: true, added, pages: page, totalFetched, totalInDb: total })
  } catch (e) {
    console.error('[buy-orders/sync]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
