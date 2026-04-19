import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'
import type { Stats } from '@/lib/types'

export async function GET() {
  try {
    const db = getDb()

    const base = db.prepare(`SELECT COUNT(*) as total, SUM(income) as ti, SUM(actual_income) as ta, AVG(income) as ai FROM records`).get() as {
      total: number; ti: number; ta: number; ai: number
    }

    const trend = db.prepare(`
      SELECT DATE(msg_time) as date, SUM(income) as income, SUM(actual_income) as actual_income, COUNT(*) as count
      FROM records
      GROUP BY DATE(msg_time)
      ORDER BY date ASC
    `).all() as { date: string; income: number; actual_income: number; count: number }[]

    const wear_dist = db.prepare(`
      SELECT wear_level, COUNT(*) as count, SUM(income) as income
      FROM records
      GROUP BY wear_level
      ORDER BY count DESC
    `).all() as { wear_level: string; count: number; income: number }[]

    const type_dist = db.prepare(`
      SELECT msg_type, COUNT(*) as count, SUM(income) as income
      FROM records
      GROUP BY msg_type
      ORDER BY count DESC
    `).all() as { msg_type: string; count: number; income: number }[]

    const stats: Stats = {
      total: base.total,
      total_income: base.ti ?? 0,
      total_actual: base.ta ?? 0,
      avg_income: base.ai ?? 0,
      trend,
      wear_dist,
      type_dist,
    }
    return NextResponse.json(stats)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
