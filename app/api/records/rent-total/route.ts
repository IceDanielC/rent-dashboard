import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const names: string[] = Array.isArray(body.names) ? body.names : []
    if (names.length === 0) {
      return NextResponse.json({ ok: true, totals: {} })
    }

    const db = getDb()
    const placeholders = names.map(() => '?').join(', ')
    const rows = db.prepare(
      `SELECT item_name, SUM(actual_income) AS total
       FROM records
       WHERE item_name IN (${placeholders})
       GROUP BY item_name`
    ).all(...names) as Array<{ item_name: string; total: number }>

    const totals: Record<string, number> = {}
    rows.forEach(r => { totals[r.item_name] = r.total ?? 0 })

    return NextResponse.json({ ok: true, totals })
  } catch (e) {
    console.error('[records/rent-total]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
