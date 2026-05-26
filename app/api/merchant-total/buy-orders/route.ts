import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

export interface DbBuyOrder {
  id: number
  order_no: string
  commodity_name: string
  exterior_name: string
  abrade: string
  icon_url: string
  type_name: string
  rarity_name: string
  rarity_color: string
  total_amount: number
  finish_order_time: number | null
  create_order_time: number | null
  seller_user_name: string
  synced_at: string
}

export async function GET(): Promise<Response> {
  try {
    const db = getDb()
    const orders = db.prepare(
      'SELECT * FROM buy_orders ORDER BY finish_order_time DESC'
    ).all() as DbBuyOrder[]
    return NextResponse.json({ ok: true, orders, total: orders.length })
  } catch (e) {
    console.error('[buy-orders GET]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
