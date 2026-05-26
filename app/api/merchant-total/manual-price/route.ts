import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

// GET /api/merchant-total/manual-price — 返回所有手动录入的购买价
export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT order_no, buy_price FROM sell_manual_prices').all() as {
      order_no: string
      buy_price: number
    }[]
    return NextResponse.json({ ok: true, prices: rows })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// POST /api/merchant-total/manual-price — upsert { orderNo, buyPrice }
export async function POST(req: NextRequest) {
  try {
    const { orderNo, buyPrice } = await req.json()
    if (!orderNo || typeof buyPrice !== 'number' || buyPrice <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 })
    }
    const db = getDb()
    db.prepare(`
      INSERT INTO sell_manual_prices (order_no, buy_price, updated_at)
      VALUES (?, ?, datetime('now','localtime'))
      ON CONFLICT(order_no) DO UPDATE SET buy_price = excluded.buy_price, updated_at = excluded.updated_at
    `).run(orderNo, buyPrice)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// DELETE /api/merchant-total/manual-price — { orderNo }
export async function DELETE(req: NextRequest) {
  try {
    const { orderNo } = await req.json()
    if (!orderNo) return NextResponse.json({ ok: false, error: 'missing orderNo' }, { status: 400 })
    const db = getDb()
    db.prepare('DELETE FROM sell_manual_prices WHERE order_no = ?').run(orderNo)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
