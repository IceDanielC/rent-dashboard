import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'
import { getApiHeaders } from '@/lib/api-headers'

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

// 将 "2026.04.29 14:09:16" 转为 "2026-04-29 14:09:16"
function parseExpireTimeDesc(desc: string): string | null {
  // 格式：YYYY.MM.DD HH:mm:ss
  const m = desc.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}`
}

interface FixResult {
  fixed: number
  skipped: number
  errors: string[]
  duplicateGroups: number
}

export async function GET(): Promise<Response> {
  const result: FixResult = { fixed: 0, skipped: 0, errors: [], duplicateGroups: 0 }

  try {
    const db = getDb()

    // 找出所有 msg_time 相同但 order_no 不同的记录组
    const duplicates = db.prepare(`
      SELECT msg_time, GROUP_CONCAT(order_no) as order_nos, GROUP_CONCAT(id) as ids
      FROM records
      GROUP BY msg_time
      HAVING COUNT(*) > 1
    `).all() as { msg_time: string; order_nos: string; ids: string }[]

    result.duplicateGroups = duplicates.length

    if (duplicates.length === 0) {
      return NextResponse.json({ ok: true, ...result, message: '没有发现时间重复的记录' })
    }

    const update = db.prepare('UPDATE records SET msg_time = ? WHERE id = ?')

    for (const group of duplicates) {
      const orderNos = group.order_nos.split(',')
      const ids = group.ids.split(',')

      for (let i = 0; i < orderNos.length; i++) {
        const orderId = orderNos[i].trim()
        const recordId = ids[i].trim()

        try {
          type DetailResp = {
            code: number
            data?: {
              leaseInfo?: {
                expireTimeDesc?: string
              }
            }
          }

          const detailResp = await fetchOrderDetail(orderId) as DetailResp

          if (detailResp.code !== 0) {
            result.errors.push(`订单 ${orderId}: code=${detailResp.code}`)
            result.skipped++
            continue
          }

          const expireTimeDesc = detailResp.data?.leaseInfo?.expireTimeDesc
          if (!expireTimeDesc) {
            result.errors.push(`订单 ${orderId}: 无 expireTimeDesc 字段`)
            result.skipped++
            continue
          }

          const newTime = parseExpireTimeDesc(expireTimeDesc)
          if (!newTime) {
            result.errors.push(`订单 ${orderId}: expireTimeDesc 格式异常 "${expireTimeDesc}"`)
            result.skipped++
            continue
          }

          update.run(newTime, recordId)
          result.fixed++

          await new Promise(r => setTimeout(r, 1000))
        } catch (e) {
          result.errors.push(`订单 ${orderId}: ${String(e)}`)
          result.skipped++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      message: `处理完成：发现 ${result.duplicateGroups} 组重复时间，修复 ${result.fixed} 条，跳过 ${result.skipped} 条`,
    })
  } catch (e) {
    console.error('[fix-time]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
