import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

interface Row {
  id: number
  commodity_name: string
  exterior_name: string
  abrade: string
  sell_price_fen: number
  buy_price_fen: number
  finish_time: number
  created_at: string
}

// GET — 返回全部手动出售记录
export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM sell_manual_orders ORDER BY finish_time DESC'
    ).all() as Row[]
    return NextResponse.json({ ok: true, orders: rows })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// POST — 新增手动出售记录
// body: { commodityName, exteriorName?, abrade?, sellPriceFen, buyPriceFen, finishTime }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { commodityName, exteriorName = '', abrade = '', sellPriceFen, buyPriceFen = 0, finishTime } = body
    if (!commodityName || typeof sellPriceFen !== 'number' || typeof finishTime !== 'number') {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 })
    }
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO sell_manual_orders (commodity_name, exterior_name, abrade, sell_price_fen, buy_price_fen, finish_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(commodityName, exteriorName, abrade, sellPriceFen, buyPriceFen, finishTime)
    return NextResponse.json({ ok: true, id: result.lastInsertRowid })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// DELETE — 删除手动出售记录  body: { id }
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
    const db = getDb()
    db.prepare('DELETE FROM sell_manual_orders WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
