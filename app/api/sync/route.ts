import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'
import { getApiHeaders } from '@/lib/api-headers'

const TARGET_TITLES = new Set(['转租成功', '自动确认归还成功', '对方已续租'])

// 解压 gzip（Node.js fetch 会自动解压，但保留手动兜底）
async function decompressResponse(res: Response): Promise<unknown> {
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)

  // 检查 gzip magic bytes
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(bytes))
    return JSON.parse(decompressed.toString('utf-8'))
  }
  return JSON.parse(Buffer.from(bytes).toString('utf-8'))
}

async function fetchMessageList(pageIndex = 1, pageSize = 500): Promise<unknown> {
  const headers = getApiHeaders()
  const res = await fetch('https://api.youpin898.com/api/youpin/mailbox/messageList', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      AppType: '3',
      Platform: 'ios',
      pageIndex,
      pageSize,
      Version: '5.43.0',
      SessionId: headers['DeviceToken'],
    }),
  })
  return decompressResponse(res)
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

interface SyncResult {
  added: number
  skipped: number
  errors: string[]
  total_fetched: number
}

export async function GET(): Promise<Response> {
  const result: SyncResult = { added: 0, skipped: 0, errors: [], total_fetched: 0 }

  try {
    const db = getDb()

    // 1. 分页拉取全部消息列表
    type MsgItem = { title: string; orderNo: string; createTime: string }
    const messages: MsgItem[] = []
    const pageIndex = 1

      const msgResp = await fetchMessageList(pageIndex) as {
        code: number
        data?: { datas?: MsgItem[]; count?: number }
      }
      if (msgResp.code !== 0) {
        return NextResponse.json({ error: `消息列表接口返回 code=${msgResp.code}` }, { status: 502 })
      }
      const page = msgResp.data?.datas ?? []
      messages.push(...page)

    result.total_fetched = messages.length

    // 2. 过滤目标消息类型
    const targets = messages.filter(m => TARGET_TITLES.has(m.title))

    // 3. 准备 insert 语句
    const insert = db.prepare(`
      INSERT OR IGNORE INTO records
        (msg_time, msg_type, order_no, item_name, wear_level, wear_value, income, actual_income, lease_days, order_status)
      VALUES
        (@msg_time, @msg_type, @order_no, @item_name, @wear_level, @wear_value, @income, @actual_income, @lease_days, @order_status)
    `)

    // 4. 逐条处理（已存在的跳过，避免重复请求详情）
    for (const msg of targets) {
      const orderId = String(msg.orderNo)

      // 先检查是否已存在
      const exists = db.prepare('SELECT 1 FROM records WHERE order_no = ?').get(orderId)
      if (exists) {
        result.skipped++
        continue
      }

      // 拉取订单详情
      try {
        const detailResp = await fetchOrderDetail(orderId) as {
          code: number
          data?: {
            orderDetail?: {
              orderNo: string
              orderStatusName: string
              leaseDays: number
              productDetail?: {
                commodityName: string
                exteriorName: string
                abrade: string
              }
            }
            leaseAmountInfo?: { firstLeaseAmount: number }
          }
        }

        if (detailResp.code !== 0) {
          result.errors.push(`订单 ${orderId}: code=${detailResp.code}`)
          continue
        }

        const order = detailResp.data?.orderDetail
        const product = order?.productDetail
        const leaseInfo = detailResp.data?.leaseAmountInfo

        if (!order || !product) {
          result.errors.push(`订单 ${orderId}: 数据结构异常`)
          continue
        }

        const income = (leaseInfo?.firstLeaseAmount ?? 0) / 100
        const wearValue = parseFloat(product.abrade ?? '0') || 0

        // 消息时间格式化（createTime 是毫秒时间戳字符串，转为北京时间 UTC+8）
        let msgTime = msg.createTime
        if (/^\d{13}$/.test(String(msgTime))) {
          const d = new Date(Number(msgTime))
          // 手动加 8 小时偏移得到北京时间
          const bjOffset = 8 * 60 * 60 * 1000
          const bjDate = new Date(d.getTime() + bjOffset)
          msgTime = bjDate.toISOString().replace('T', ' ').slice(0, 19)
        }

        insert.run({
          msg_time:      msgTime,
          msg_type:      msg.title,
          order_no:      order.orderNo || orderId,
          item_name:     product.commodityName ?? '',
          wear_level:    product.exteriorName ?? '',
          wear_value:    wearValue,
          income:        income,
          actual_income: parseFloat((income * 0.8).toFixed(2)),
          lease_days:    order.leaseDays ?? 0,
          order_status:  order.orderStatusName ?? '',
        })

        result.added++

        // 适当延迟，避免请求过快
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        result.errors.push(`订单 ${orderId}: ${String(e)}`)
      }
    }

    // 5. 更新最后同步时间（存到 SQLite 的 meta 表）
    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`)
    const now = new Date()
    const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_sync', ?)`).run(
      bjNow.toISOString().replace('T', ' ').slice(0, 19)
    )
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_sync_added', ?)`).run(
      String(result.added)
    )

    return NextResponse.json({
      ok: true,
      ...result,
      message: `同步完成：新增 ${result.added} 条，跳过 ${result.skipped} 条，共拉取 ${result.total_fetched} 条消息`,
    })
  } catch (e) {
    console.error('[sync]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
