import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'
import { getApiHeaders } from '@/lib/api-headers'

// 大数字转字符串，避免 JS 精度损失
function safeJsonParse(text: string): unknown {
  return JSON.parse(text.replace(/:\s*(\d{16,})/g, ': "$1"'))
}

async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(bytes))
    return safeJsonParse(decompressed.toString('utf-8'))
  }
  return safeJsonParse(Buffer.from(bytes).toString('utf-8'))
}

async function fetchOrderDetail(orderId: string): Promise<unknown> {
  const headers = getApiHeaders()
  const res = await fetch('https://api.youpin898.com/api/youpin/bff/order/v2/detail', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      AppType: '3',
      Platform: 'ios',
      orderId,
      Version: '5.43.0',
      SessionId: headers['DeviceToken'],
    }),
  })
  return decompressResponse(res)
}

type DetailResp = {
  code: number
  data?: {
    orderDetail?: {
      orderNo: string
      orderStatusName: string
      leaseDays: number
      subletOriginOrderId?: string  // 已通过 safeJsonParse 转为字符串，无精度损失
      productDetail?: {
        commodityName: string
        exteriorName: string
        abrade: string
      }
    }
    leaseAmountInfo?: { firstLeaseAmount: number; totalLeaseAmountDesc?: string }
    leaseInfo?: { expireTimeDesc?: string }
  }
}

// "2026.04.29 14:09:16" -> "2026-04-29 14:09:16"
function parseExpireTimeDesc(desc: string): string | null {
  const m = desc.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}`
}

interface ChainResult {
  upserted: number
  chain: string[]   // 记录链路：[初始订单 -> 原订单 -> ...]
  errors: string[]
}

export async function POST(req: NextRequest): Promise<Response> {
  const result: ChainResult = { upserted: 0, chain: [], errors: [] }

  try {
    const { orderId: rawOrderId } = await req.json()
    if (!rawOrderId) {
      return NextResponse.json({ error: '缺少参数 orderId' }, { status: 400 })
    }

    const db = getDb()

    const upsert = db.prepare(`
      INSERT INTO records
        (msg_time, msg_type, order_no, item_name, wear_level, wear_value, income, actual_income, lease_days, order_status)
      VALUES
        (@msg_time, @msg_type, @order_no, @item_name, @wear_level, @wear_value, @income, @actual_income, @lease_days, @order_status)
      ON CONFLICT(order_no) DO UPDATE SET
        msg_time      = excluded.msg_time,
        msg_type      = excluded.msg_type,
        item_name     = excluded.item_name,
        wear_level    = excluded.wear_level,
        wear_value    = excluded.wear_value,
        income        = excluded.income,
        actual_income = excluded.actual_income,
        lease_days    = excluded.lease_days,
        order_status  = excluded.order_status
    `)

    let currentId = String(rawOrderId).trim()

    while (true) {
      console.log(`[sync-chain] 查询订单详情: ${currentId}`)

      const detailResp = await fetchOrderDetail(currentId) as DetailResp

      if (detailResp.code !== 0) {
        const msg = `订单 ${currentId}: code=${detailResp.code}`
        console.error(`[sync-chain] ${msg}`)
        result.errors.push(msg)
        break
      }

      const order = detailResp.data?.orderDetail
      const leaseInfo = detailResp.data?.leaseAmountInfo
      const product = order?.productDetail

      if (!order || !product) {
        const msg = `订单 ${currentId}: 数据结构异常`
        console.error(`[sync-chain] ${msg}`)
        result.errors.push(msg)
        break
      }

      // 时间优先用 leaseInfo.expireTimeDesc，否则用当前时间
      let msgTime = ''
      const expireDesc = detailResp.data?.leaseInfo?.expireTimeDesc
      if (expireDesc) {
        msgTime = parseExpireTimeDesc(expireDesc) ?? ''
      }
      if (!msgTime) {
        const now = new Date()
        const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
        msgTime = bjNow.toISOString().replace('T', ' ').slice(0, 19)
      }

      const orderNo = order.orderNo || currentId
      // 优先用 totalLeaseAmountDesc（含续租），解析 "￥20.46" 格式；降级到 firstLeaseAmount
      const totalDesc = leaseInfo?.totalLeaseAmountDesc
      const income = totalDesc
        ? parseFloat(totalDesc.replace(/[^\d.]/g, '')) || 0
        : (leaseInfo?.firstLeaseAmount ?? 0) / 100
      const wearValue = parseFloat(product.abrade ?? '0') || 0

      const row = {
        msg_time:      msgTime,
        msg_type:      '转租成功',
        order_no:      orderNo,
        item_name:     product.commodityName ?? '',
        wear_level:    product.exteriorName ?? '',
        wear_value:    wearValue,
        income:        income,
        actual_income: parseFloat((income * 0.8).toFixed(2)),
        lease_days:    order.leaseDays ?? 0,
        order_status:  order.orderStatusName ?? '',
      }

      const existed = db.prepare('SELECT 1 FROM records WHERE order_no = ?').get(orderNo)
      upsert.run(row)
      result.upserted++
      result.chain.push(orderNo)

      console.log(
        `[sync-chain] ${existed ? '覆盖' : '新增'} 订单 ${orderNo} | ${row.item_name} | ${row.wear_level} | ¥${row.income} | ${row.lease_days}天 | ${row.order_status}`
      )

      // subletOriginOrderId 已由 safeJsonParse 保留为字符串，无精度损失
      const originId = order.subletOriginOrderId
      if (!originId || originId === '0' || originId === '') {
        console.log(`[sync-chain] 链路终止，无原订单。链路: ${result.chain.join(' -> ')}`)
        break
      }

      currentId = originId
      await new Promise(r => setTimeout(r, 1000))
    }

    return NextResponse.json({
      ok: true,
      ...result,
      message: `递归同步完成：共处理 ${result.upserted} 条，链路: ${result.chain.join(' -> ')}`,
    })
  } catch (e) {
    console.error('[sync-chain]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
