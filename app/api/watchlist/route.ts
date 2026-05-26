import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

export interface WatchlistItem {
  id: number
  item_name: string
  wear: string
  watch_price: number
  watch_rent: number
  template_id: number | null
  hash_name: string
  created_at: string
}

export async function GET() {
  try {
    const db = getDb()
    const items = db.prepare(
      'SELECT * FROM watchlist ORDER BY created_at DESC'
    ).all() as WatchlistItem[]
    return NextResponse.json({ ok: true, items })
  } catch (e) {
    console.error('[watchlist GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json()
    const { item_name, wear, watch_price, watch_rent, template_id, hash_name } = body

    if (!item_name) {
      return NextResponse.json({ error: '缺少饰品名称' }, { status: 400 })
    }

    const existing = db.prepare(
      'SELECT id FROM watchlist WHERE item_name = @item_name AND wear = @wear'
    ).get({ item_name, wear: wear ?? '' })
    if (existing) {
      return NextResponse.json({ ok: false, error: `「${item_name}${wear ? ` (${wear})` : ''}」已在关注列表中` }, { status: 409 })
    }

    const result = db.prepare(`
      INSERT INTO watchlist (item_name, wear, watch_price, watch_rent, template_id, hash_name)
      VALUES (@item_name, @wear, @watch_price, @watch_rent, @template_id, @hash_name)
    `).run({
      item_name,
      wear: wear ?? '',
      watch_price: parseFloat(watch_price ?? '0') || 0,
      watch_rent: parseFloat(watch_rent ?? '0') || 0,
      template_id: template_id ?? null,
      hash_name: hash_name ?? '',
    })

    return NextResponse.json({ ok: true, id: result.lastInsertRowid })
  } catch (e) {
    console.error('[watchlist POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json()
    const { id, item_name, wear, watch_price, watch_rent, template_id, hash_name } = body

    if (!id) {
      return NextResponse.json({ error: '缺少参数 id' }, { status: 400 })
    }

    const result = db.prepare(`
      UPDATE watchlist SET
        item_name   = @item_name,
        wear        = @wear,
        watch_price = @watch_price,
        watch_rent  = @watch_rent,
        template_id = @template_id,
        hash_name   = @hash_name
      WHERE id = @id
    `).run({
      id,
      item_name: item_name ?? '',
      wear: wear ?? '',
      watch_price: parseFloat(watch_price ?? '0') || 0,
      watch_rent: parseFloat(watch_rent ?? '0') || 0,
      template_id: template_id ?? null,
      hash_name: hash_name ?? '',
    })

    if (result.changes === 0) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[watchlist PUT]', e)
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
    const result = db.prepare('DELETE FROM watchlist WHERE id = ?').run(id)
    if (result.changes === 0) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[watchlist DELETE]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
