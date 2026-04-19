import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'
import type { RentRecord, RecordsResponse } from '@/lib/types'

const SORT_WHITELIST = new Set([
  'msg_time', 'msg_type', 'item_name', 'wear_level',
  'wear_value', 'income', 'actual_income', 'lease_days', 'order_status'
])

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    const p = req.nextUrl.searchParams

    const dateFrom    = p.get('dateFrom') || ''
    const dateTo      = p.get('dateTo') || ''
    const msgType     = p.get('msgType') || ''
    const keyword     = p.get('keyword') || ''
    const wearLevel      = p.get('wearLevel') || ''
    const wearValueMin   = p.get('wearValueMin') || ''
    const wearValueMax   = p.get('wearValueMax') || ''
    const orderStatus    = p.get('orderStatus') || ''
    const sortKey     = SORT_WHITELIST.has(p.get('sortKey') || '') ? p.get('sortKey')! : 'msg_time'
    const sortDir     = p.get('sortDir') === 'asc' ? 'ASC' : 'DESC'
    const page        = Math.max(1, parseInt(p.get('page') || '1'))
    const pageSize    = Math.min(100, Math.max(1, parseInt(p.get('pageSize') || '20')))

    const conditions: string[] = []
    const params: Record<string, string | number> = {}

    if (dateFrom) { conditions.push("DATE(msg_time) >= @dateFrom"); params.dateFrom = dateFrom }
    if (dateTo)   { conditions.push("DATE(msg_time) <= @dateTo");   params.dateTo = dateTo }
    if (msgType)  { conditions.push("msg_type = @msgType");          params.msgType = msgType }
    if (keyword)  { conditions.push("item_name LIKE @keyword");      params.keyword = `%${keyword}%` }
    if (orderStatus)   { conditions.push("order_status = @orderStatus");       params.orderStatus = orderStatus }
    if (wearValueMin)  { conditions.push("wear_value >= @wearValueMin");        params.wearValueMin = parseFloat(wearValueMin) }
    if (wearValueMax)  { conditions.push("wear_value <= @wearValueMax");        params.wearValueMax = parseFloat(wearValueMax) }

    // 磨损等级多选（逗号分隔）
    const wearLevels = wearLevel ? wearLevel.split(',').filter(Boolean) : []
    let wearClause = ''
    if (wearLevels.length > 0) {
      wearClause = `wear_level IN (${wearLevels.map((_, i) => `@w${i}`).join(',')})`
      wearLevels.forEach((w, i) => { params[`w${i}`] = w })
    }

    const where = [...conditions, ...(wearClause ? [wearClause] : [])].join(' AND ')
    const whereSQL = where ? `WHERE ${where}` : ''

    // 总数 + 合计
    const countRow = db.prepare(`SELECT COUNT(*) as total, SUM(income) as fi, SUM(actual_income) as fa FROM records ${whereSQL}`).get(params) as {
      total: number; fi: number | null; fa: number | null
    }
    const total = countRow.total
    const filteredIncome = countRow.fi ?? 0
    const filteredActual = countRow.fa ?? 0

    // 分页数据
    const offset = (page - 1) * pageSize
    const records = db.prepare(
      `SELECT * FROM records ${whereSQL} ORDER BY ${sortKey} ${sortDir} LIMIT @pageSize OFFSET @offset`
    ).all({ ...params, pageSize, offset }) as RentRecord[]

    const resp: RecordsResponse = {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      filteredIncome,
      filteredActual,
    }
    return NextResponse.json(resp)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
