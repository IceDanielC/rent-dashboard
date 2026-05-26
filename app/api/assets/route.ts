import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    // 查询所有资产，并关联 records 表求和出租收益
    const rows = db.prepare(`
      SELECT
        a.id,
        a.item_name,
        a.wear_value,
        a.buy_time,
        a.sell_time,
        a.buy_price,
        a.sell_price,
        COALESCE(SUM(r.actual_income), 0) AS rent_income
      FROM assets a
      LEFT JOIN records r
        ON ROUND(r.wear_value, 6) = ROUND(a.wear_value, 6)
      GROUP BY a.id
      ORDER BY a.buy_time DESC
    `).all() as {
      id: number
      item_name: string
      wear_value: number
      buy_time: string
      sell_time: string
      buy_price: number
      sell_price: number
      rent_income: number
    }[]

    return NextResponse.json({ ok: true, assets: rows })
  } catch (e) {
    console.error('[assets GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const { item_name, wear_value, buy_time, sell_time, buy_price, sell_price } = await req.json()

    if (!item_name || buy_time == null || buy_price == null) {
      return NextResponse.json({ error: '缺少必填字段：item_name、buy_time、buy_price' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const result = db.prepare(`
      INSERT INTO assets (item_name, wear_value, buy_time, sell_time, buy_price, sell_price)
      VALUES (@item_name, @wear_value, @buy_time, @sell_time, @buy_price, @sell_price)
    `).run({
      item_name,
      wear_value: parseFloat(wear_value ?? '0') || 0,
      buy_time,
      sell_time: sell_time ?? today,
      buy_price: parseFloat(buy_price) || 0,
      sell_price: parseFloat(sell_price ?? '0') || 0,
    })

    return NextResponse.json({ ok: true, id: result.lastInsertRowid })
  } catch (e) {
    console.error('[assets POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDb()
    const { id, item_name, wear_value, buy_time, sell_time, buy_price, sell_price } = await req.json()

    if (!id) {
      return NextResponse.json({ error: '缺少参数 id' }, { status: 400 })
    }
    if (!item_name || buy_time == null || buy_price == null) {
      return NextResponse.json({ error: '缺少必填字段：item_name、buy_time、buy_price' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const result = db.prepare(`
      UPDATE assets
      SET item_name = @item_name,
          wear_value = @wear_value,
          buy_time = @buy_time,
          sell_time = @sell_time,
          buy_price = @buy_price,
          sell_price = @sell_price
      WHERE id = @id
    `).run({
      id,
      item_name,
      wear_value: parseFloat(wear_value ?? '0') || 0,
      buy_time,
      sell_time: sell_time ?? today,
      buy_price: parseFloat(buy_price) || 0,
      sell_price: parseFloat(sell_price ?? '0') || 0,
    })

    if (result.changes === 0) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[assets PUT]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = getDb()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少参数 id' }, { status: 400 })
    }
    const result = db.prepare('DELETE FROM assets WHERE id = ?').run(id)
    if (result.changes === 0) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[assets DELETE]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
