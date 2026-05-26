'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Typography, Button, Space, Spin, Tabs, Table, Tag, message,
  Tooltip, Select, InputNumber, Modal, Form, Input, DatePicker,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined, ReloadOutlined, LeftOutlined, RightOutlined,
  SyncOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import Link from 'next/link'
import dayjs from 'dayjs'

// ── 悠悠有品 API 返回结构 ──
interface ProductDetail {
  commodityName: string
  exteriorName: string
  abrade: string | null
  iconUrl: string
  typeName: string
  rarityName: string
  rarityColor: string
}

interface BuyOrder {
  orderNo: string
  createOrderTime: number
  finishOrderTime: number
  totalAmount: number
  totalFeeAmount: number | null
  sellerUserName: string
  productDetail: ProductDetail
}

interface ApiSellOrder {
  orderNo: string
  createOrderTime: number
  finishOrderTime: number
  totalAmount: number        // 分
  totalFeeAmount: number | null
  buyerUserName: string
  productDetail: ProductDetail
}

// ── 本地 DB 购买记录（收益匹配用） ──
interface DbBuyOrder {
  id: number
  order_no: string
  commodity_name: string
  exterior_name: string
  abrade: string
  icon_url: string
  type_name: string
  rarity_name: string
  rarity_color: string
  total_amount: number   // 分
  finish_order_time: number | null
  create_order_time: number | null
  seller_user_name: string
  synced_at: string
}

// ── 手动出售记录（本地 DB） ──
interface DbManualSellOrder {
  id: number
  commodity_name: string
  exterior_name: string
  abrade: string
  sell_price_fen: number
  buy_price_fen: number
  finish_time: number
  created_at: string
}

// ── 统一展示行 ──
interface SellRow {
  key: string
  isManual: boolean
  manualId?: number
  orderNo?: string
  commodityName: string
  exteriorName: string
  abrade: string | null
  iconUrl: string
  sellAmountFen: number
  knownBuyFen: number | null   // 手动录入记录时已知购买价
  finishOrderTime: number
  buyerUserName: string
}

// ── 工具函数 ──
function formatTs(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms + 8 * 3600_000)
  return d.toISOString().replace('T', ' ').slice(0, 16)
}

function fen2yuan(fen: number): string {
  return (fen / 100).toFixed(2)
}

function matchDbBuyOrder(row: SellRow, dbOrders: DbBuyOrder[]): DbBuyOrder | null {
  if (!row.commodityName || !row.abrade) return null
  for (const buy of dbOrders) {
    if (buy.commodity_name !== row.commodityName) continue
    if (buy.abrade && buy.abrade === row.abrade) return buy
  }
  return null
}

function CommodityCell({ name, iconUrl, typeName, rarityName, rarityColor }: {
  name: string; iconUrl: string; typeName: string; rarityName: string; rarityColor: string
}) {
  return (
    <Space size={8} align="center">
      {iconUrl && <img src={iconUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: '18px' }}>{name}</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          {typeName}
          {rarityName && (
            <Tag style={{ marginLeft: 4, fontSize: 11, padding: '0 4px', lineHeight: '16px', border: 'none', color: `#${rarityColor || 'aaa'}`, background: `#${rarityColor || 'aaa'}22` }}>
              {rarityName}
            </Tag>
          )}
        </div>
      </div>
    </Space>
  )
}

function PageToolbar({
  count, totalAmount, pageSize, page, hasMore, loading,
  onPageSizeChange, onRefresh, onPrev, onNext,
  amountLabel = '合计', amountColor = '#52c41a', extra,
}: {
  count: number; totalAmount: number; pageSize: number; page: number
  hasMore: boolean; loading: boolean
  onPageSizeChange: (v: number) => void; onRefresh: () => void
  onPrev: () => void; onNext: () => void
  amountLabel?: string; amountColor?: string; extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <Space size={16}>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          本页 <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{count}</strong> 条
        </span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          {amountLabel} <strong style={{ color: amountColor }}>¥{fen2yuan(totalAmount)}</strong>
        </span>
        {extra}
      </Space>
      <Space size={6}>
        <Select size="small" value={pageSize} style={{ width: 90 }}
          options={[{ value: 20, label: '20 条/页' }, { value: 50, label: '50 条/页' }, { value: 100, label: '100 条/页' }]}
          onChange={onPageSizeChange}
        />
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>刷新</Button>
        <Button size="small" icon={<LeftOutlined />} disabled={page <= 1 || loading} onClick={onPrev} />
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: '0 4px' }}>第 {page} 页</span>
        <Button size="small" icon={<RightOutlined />} disabled={!hasMore || loading} onClick={onNext} />
      </Space>
    </div>
  )
}

export default function MerchantTotalPage() {
  const [activeTab, setActiveTab] = useState('sell')
  const [msgApi, contextHolder] = message.useMessage()

  // ── 购买记录 ──
  const [buyOrders, setBuyOrders] = useState<BuyOrder[]>([])
  const [buyLoading, setBuyLoading] = useState(false)
  const [buyPage, setBuyPage] = useState(1)
  const [buyPageSize, setBuyPageSize] = useState(20)
  const [buyHasMore, setBuyHasMore] = useState(false)

  const loadBuyOrders = useCallback(async (page: number, pageSize?: number) => {
    setBuyLoading(true)
    try {
      const res = await fetch('/api/merchant-total/buy-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIndex: page, pageSize }),
      })
      const data = await res.json()
      if (data.ok) {
        setBuyOrders(data.orderList as BuyOrder[])
        setBuyHasMore(data.hasMore)
        setBuyPage(page)
      } else {
        msgApi.error(data.error ?? '加载失败')
      }
    } catch (e) {
      msgApi.error(String(e))
    } finally {
      setBuyLoading(false)
    }
  }, [msgApi])

  // ── 出售记录（API） ──
  const [apiSellOrders, setApiSellOrders] = useState<ApiSellOrder[]>([])
  const [sellLoading, setSellLoading] = useState(false)
  const [sellPage, setSellPage] = useState(1)
  const [sellPageSize, setSellPageSize] = useState(20)
  const [sellHasMore, setSellHasMore] = useState(false)

  // ── 手动出售记录（DB） ──
  const [manualSellOrders, setManualSellOrders] = useState<DbManualSellOrder[]>([])

  // ── DB 全量购买记录（收益匹配用） ──
  const [dbBuyOrders, setDbBuyOrders] = useState<DbBuyOrder[]>([])
  const [dbBuyLoading, setDbBuyLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // 对 API 出售记录的手动购买价（key = orderNo）
  const [manualBuyPrices, setManualBuyPrices] = useState<Map<string, number>>(new Map())

  // ── 新增弹窗 ──
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addForm] = Form.useForm()

  const loadApiSellOrders = useCallback(async (page: number, pageSize?: number) => {
    setSellLoading(true)
    try {
      const res = await fetch('/api/merchant-total/sell-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIndex: page, pageSize }),
      })
      const data = await res.json()
      if (data.ok) {
        setApiSellOrders(data.orderList as ApiSellOrder[])
        setSellHasMore(data.hasMore)
        setSellPage(page)
      } else {
        msgApi.error(data.error ?? '加载失败')
      }
    } catch (e) {
      msgApi.error(String(e))
    } finally {
      setSellLoading(false)
    }
  }, [msgApi])

  const loadManualSellOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/merchant-total/manual-sell-orders')
      const data = await res.json()
      if (data.ok) setManualSellOrders(data.orders as DbManualSellOrder[])
    } catch { /* non-critical */ }
  }, [])

  const loadDbBuyOrders = useCallback(async () => {
    setDbBuyLoading(true)
    try {
      const res = await fetch('/api/merchant-total/buy-orders')
      const data = await res.json()
      if (data.ok) setDbBuyOrders(data.orders as DbBuyOrder[])
    } catch { /* non-critical */ } finally {
      setDbBuyLoading(false)
    }
  }, [])

  const loadManualPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/merchant-total/manual-price')
      const data = await res.json()
      if (data.ok) {
        const map = new Map<string, number>()
        for (const { order_no, buy_price } of data.prices as { order_no: string; buy_price: number }[]) {
          map.set(order_no, buy_price)
        }
        setManualBuyPrices(map)
      }
    } catch { /* non-critical */ }
  }, [])

  const saveManualPrice = useCallback(async (orderNo: string, buyPrice: number) => {
    setManualBuyPrices(prev => new Map(prev).set(orderNo, buyPrice))
    await fetch('/api/merchant-total/manual-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo, buyPrice }),
    })
  }, [])

  const deleteManualPrice = useCallback(async (orderNo: string) => {
    setManualBuyPrices(prev => { const next = new Map(prev); next.delete(orderNo); return next })
    await fetch('/api/merchant-total/manual-price', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNo }),
    })
  }, [])

  const syncBuyOrders = useCallback(async () => {
    setSyncing(true)
    msgApi.loading({ content: '正在同步购买记录…', key: 'sync-buy', duration: 0 })
    try {
      const res = await fetch('/api/merchant-total/buy-orders/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        msgApi.success({
          content: `同步完成：新增 ${data.added} 条，共拉取 ${data.totalFetched} 条（${data.pages} 页），DB 共 ${data.totalInDb} 条`,
          key: 'sync-buy', duration: 6,
        })
        loadDbBuyOrders()
      } else {
        msgApi.error({ content: `同步失败: ${data.error}`, key: 'sync-buy', duration: 5 })
      }
    } catch (e) {
      msgApi.error({ content: String(e), key: 'sync-buy', duration: 5 })
    } finally {
      setSyncing(false)
    }
  }, [msgApi, loadDbBuyOrders])

  const handleAddSellOrder = useCallback(async () => {
    try {
      const values = await addForm.validateFields()
      setAddLoading(true)
      const sellPriceFen = Math.round(values.sellPrice * 100)
      const buyPriceFen = Math.round((values.buyPrice ?? 0) * 100)
      const finishTime = (values.finishTime as dayjs.Dayjs).valueOf()
      const res = await fetch('/api/merchant-total/manual-sell-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commodityName: values.commodityName,
          exteriorName: values.exteriorName ?? '',
          abrade: values.abrade ?? '',
          sellPriceFen,
          buyPriceFen,
          finishTime,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('添加成功')
        addForm.resetFields()
        setAddModalOpen(false)
        loadManualSellOrders()
      } else {
        msgApi.error(data.error ?? '添加失败')
      }
    } catch { /* validation error */ } finally {
      setAddLoading(false)
    }
  }, [addForm, msgApi, loadManualSellOrders])

  const deleteManualSellOrder = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/merchant-total/manual-sell-orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('已删除')
        setManualSellOrders(prev => prev.filter(o => o.id !== id))
      } else {
        msgApi.error(data.error ?? '删除失败')
      }
    } catch (e) {
      msgApi.error(String(e))
    }
  }, [msgApi])

  useEffect(() => {
    if (activeTab === 'buy') loadBuyOrders(1, buyPageSize)
    if (activeTab === 'sell') {
      loadApiSellOrders(1, sellPageSize)
      loadDbBuyOrders()
      loadManualPrices()
      loadManualSellOrders()
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── API 出售行 ──
  const apiSellRows = useMemo<SellRow[]>(() =>
    apiSellOrders.map(o => ({
      key: o.orderNo,
      isManual: false,
      orderNo: o.orderNo,
      commodityName: o.productDetail?.commodityName ?? '',
      exteriorName: o.productDetail?.exteriorName ?? '',
      abrade: o.productDetail?.abrade ?? null,
      iconUrl: o.productDetail?.iconUrl ?? '',
      sellAmountFen: o.totalAmount,
      knownBuyFen: null,
      finishOrderTime: o.finishOrderTime,
      buyerUserName: o.buyerUserName ?? '',
    }))
  , [apiSellOrders])

  // ── 汇总 ──
  const buyTotalAmount = buyOrders.reduce((s, o) => s + (o.totalAmount ?? 0), 0)

  const sellTotalAmount = apiSellRows.reduce((s, r) => s + r.sellAmountFen, 0)
  const sellTotalProfit = apiSellRows.reduce((s, r) => {
    const net = (r.sellAmountFen * 0.99) / 100
    const matched = matchDbBuyOrder(r, dbBuyOrders)
    if (matched) return s + (net - matched.total_amount / 100)
    if (r.orderNo) {
      const manual = manualBuyPrices.get(r.orderNo)
      if (manual != null) return s + (net - manual)
    }
    return s
  }, 0)

  const manualTotalAmount = manualSellOrders.reduce((s, o) => s + o.sell_price_fen, 0)
  const manualTotalProfit = manualSellOrders.reduce((s, o) => {
    const net = (o.sell_price_fen * 0.99) / 100
    return s + (net - o.buy_price_fen / 100)
  }, 0)

  // ── 列定义 ──
  const buyColumns: ColumnsType<BuyOrder> = [
    { title: '饰品', key: 'commodity', width: 280, ellipsis: true, render: (_, r) => (
      <CommodityCell name={r.productDetail?.commodityName ?? ''} iconUrl={r.productDetail?.iconUrl ?? ''}
        typeName={r.productDetail?.typeName ?? ''} rarityName={r.productDetail?.rarityName ?? ''} rarityColor={r.productDetail?.rarityColor ?? ''} />
    )},
    { title: '磨损', key: 'wear', width: 140, render: (_, r) => (
      <div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{r.productDetail?.exteriorName || '—'}</div>
        {r.productDetail?.abrade && r.productDetail.abrade !== '0' && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{r.productDetail.abrade}</div>
        )}
      </div>
    )},
    {
      title: '购买价', dataIndex: 'totalAmount', width: 100, align: 'right',
      sorter: (a, b) => a.totalAmount - b.totalAmount,
      render: (val: number) => <span style={{ color: '#ff4d4f', fontWeight: 500 }}>¥{fen2yuan(val)}</span>,
    },
    {
      title: '成交时间', dataIndex: 'finishOrderTime', width: 140,
      sorter: (a, b) => (a.finishOrderTime ?? 0) - (b.finishOrderTime ?? 0),
      defaultSortOrder: 'descend',
      render: (val: number) => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{formatTs(val)}</span>,
    },
    {
      title: '卖家', dataIndex: 'sellerUserName', width: 130, ellipsis: true,
      render: (val: string) => <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{val || '—'}</span>,
    },
    {
      title: '订单号', dataIndex: 'orderNo', width: 180, ellipsis: true,
      render: (val: string) => <Tooltip title={val}><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>{val}</span></Tooltip>,
    },
  ]

  const sellColumns: ColumnsType<SellRow> = [
    {
      title: '饰品', key: 'commodity', width: 280, ellipsis: true,
      render: (_, r) => (
        <Space size={8} align="center">
          {r.iconUrl && <img src={r.iconUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <Space size={4}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{r.commodityName}</span>
              {r.isManual && <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>手动</Tag>}
            </Space>
            {r.exteriorName && (
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{r.exteriorName}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '磨损', key: 'wear', width: 120,
      render: (_, r) => r.abrade ? (
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{r.abrade}</span>
      ) : null,
    },
    {
      title: '出售价', key: 'sellAmount', width: 100, align: 'right',
      sorter: (a, b) => a.sellAmountFen - b.sellAmountFen,
      render: (_, r) => <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{fen2yuan(r.sellAmountFen)}</span>,
    },
    {
      title: '成交时间', key: 'finishTime', width: 140,
      sorter: (a, b) => a.finishOrderTime - b.finishOrderTime,
      defaultSortOrder: 'descend',
      render: (_, r) => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{formatTs(r.finishOrderTime)}</span>,
    },
    {
      title: '买家', key: 'buyer', width: 130, ellipsis: true,
      render: (_, r) => <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{r.buyerUserName || '—'}</span>,
    },
    {
      title: '收益', key: 'profit', width: 120, align: 'right',
      sorter: (a, b) => {
        const calcProfit = (r: SellRow) => {
          const net = (r.sellAmountFen * 0.99) / 100
          if (r.knownBuyFen != null) return net - r.knownBuyFen / 100
          const matched = matchDbBuyOrder(r, dbBuyOrders)
          if (matched) return net - matched.total_amount / 100
          if (r.orderNo) {
            const manual = manualBuyPrices.get(r.orderNo)
            if (manual != null) return net - manual
          }
          return 0
        }
        return calcProfit(a) - calcProfit(b)
      },
      render: (_, record) => {
        if (dbBuyLoading) return <Spin size="small" />
        const sellNet = (record.sellAmountFen * 0.99) / 100

        const matched = matchDbBuyOrder(record, dbBuyOrders)
        if (matched) {
          const buyPrice = matched.total_amount / 100
          const profit = sellNet - buyPrice
          const color = profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
          return (
            <Tooltip title={`到手 ¥${sellNet.toFixed(2)} - 购入 ¥${buyPrice.toFixed(2)}`}>
              <span style={{ color, fontWeight: 500 }}>{profit > 0 ? '+' : ''}{profit.toFixed(2)}</span>
            </Tooltip>
          )
        }

        if (record.orderNo) {
          const manual = manualBuyPrices.get(record.orderNo)
          if (manual != null) {
            const profit = sellNet - manual
            const color = profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
            return (
              <Tooltip title={`到手 ¥${sellNet.toFixed(2)} - 购入 ¥${manual.toFixed(2)}（手动）`}>
                <span style={{ color, fontWeight: 500, cursor: 'pointer' }} onClick={() => deleteManualPrice(record.orderNo!)}>
                  {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                </span>
              </Tooltip>
            )
          }
          return (
            <InputNumber
              size="small" min={0} step={0.01} precision={2}
              placeholder="购入价" prefix="¥" style={{ width: 100 }}
              onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => {
                const val = parseFloat((e.target as HTMLInputElement).value)
                if (!isNaN(val) && val > 0) saveManualPrice(record.orderNo!, val)
              }}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                const val = parseFloat(e.target.value)
                if (!isNaN(val) && val > 0) saveManualPrice(record.orderNo!, val)
              }}
            />
          )
        }
        return null
      },
    },
  ]

  const manualColumns: ColumnsType<DbManualSellOrder> = [
    {
      title: '饰品', key: 'commodity', width: 240, ellipsis: true,
      render: (_, r) => (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{r.commodity_name}</div>
          {r.exterior_name && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{r.exterior_name}</div>}
        </div>
      ),
    },
    {
      title: '磨损值', dataIndex: 'abrade', width: 120,
      render: (val: string) => val
        ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{val}</span>
        : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>,
    },
    {
      title: '出售价', dataIndex: 'sell_price_fen', width: 100, align: 'right',
      sorter: (a, b) => a.sell_price_fen - b.sell_price_fen,
      render: (val: number) => <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{fen2yuan(val)}</span>,
    },
    {
      title: '购入价', dataIndex: 'buy_price_fen', width: 100, align: 'right',
      render: (val: number) => <span style={{ color: '#ff4d4f' }}>¥{fen2yuan(val)}</span>,
    },
    {
      title: '收益', key: 'profit', width: 100, align: 'right',
      sorter: (a, b) => (a.sell_price_fen * 0.99 - a.buy_price_fen) - (b.sell_price_fen * 0.99 - b.buy_price_fen),
      render: (_, r) => {
        const profit = (r.sell_price_fen * 0.99 - r.buy_price_fen) / 100
        const color = profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return (
          <Tooltip title={`到手 ¥${(r.sell_price_fen * 0.99 / 100).toFixed(2)} - 购入 ¥${fen2yuan(r.buy_price_fen)}`}>
            <span style={{ color, fontWeight: 500 }}>{profit > 0 ? '+' : ''}{profit.toFixed(2)}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '成交时间', dataIndex: 'finish_time', width: 140,
      sorter: (a, b) => a.finish_time - b.finish_time,
      defaultSortOrder: 'descend',
      render: (val: number) => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{formatTs(val)}</span>,
    },
    {
      title: '', key: 'action', width: 50, align: 'center',
      render: (_, r) => (
        <Tooltip title="删除">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteManualSellOrder(r.id)} />
        </Tooltip>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: 'clamp(12px, 3vw, 24px)' }}>
      {contextHolder}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Link href="/"><Button type="text" icon={<ArrowLeftOutlined />} size="small" style={{ color: 'rgba(255,255,255,0.45)' }} /></Link>
          <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>🏪 交易总览</Typography.Title>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'sell',
            label: '出售记录',
            children: (
              <div>
                {/* 工具栏 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Space size={12}>
                    <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                      购买记录库：
                      {dbBuyLoading
                        ? <><Spin size="small" style={{ marginLeft: 6 }} /> 加载中</>
                        : <strong style={{ color: dbBuyOrders.length > 0 ? '#52c41a' : '#faad14', marginLeft: 4 }}>{dbBuyOrders.length} 条</strong>
                      }
                    </span>
                    {dbBuyOrders.length === 0 && !dbBuyLoading && (
                      <span style={{ color: '#faad14', fontSize: 12 }}>请先同步购买记录以计算收益</span>
                    )}
                    {!dbBuyLoading && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                        本页总收益 <strong style={{ color: sellTotalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          {sellTotalProfit >= 0 ? '+' : ''}{sellTotalProfit.toFixed(2)}
                        </strong>
                      </span>
                    )}
                  </Space>
                  <Tooltip title="从悠悠有品拉取全量已完成购买记录，存入本地数据库">
                    <Button size="small" icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={syncBuyOrders}>
                      同步购买记录
                    </Button>
                  </Tooltip>
                </div>

                <PageToolbar
                  count={apiSellRows.length} totalAmount={sellTotalAmount}
                  pageSize={sellPageSize} page={sellPage} hasMore={sellHasMore} loading={sellLoading}
                  amountLabel="合计出售" amountColor="#52c41a"
                  onPageSizeChange={v => { setSellPageSize(v); loadApiSellOrders(1, v) }}
                  onRefresh={() => loadApiSellOrders(sellPage, sellPageSize)}
                  onPrev={() => loadApiSellOrders(sellPage - 1, sellPageSize)}
                  onNext={() => loadApiSellOrders(sellPage + 1, sellPageSize)}
                />
                <Table<SellRow>
                  rowKey="key" dataSource={apiSellRows} columns={sellColumns}
                  loading={sellLoading} pagination={false} scroll={{ x: 'max-content' }} size="small"
                  locale={{ emptyText: sellLoading ? '加载中…' : '暂无出售记录' }}
                  summary={() => apiSellRows.length > 0 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>本页合计</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right"><span style={{ color: '#52c41a', fontWeight: 600 }}>¥{fen2yuan(sellTotalAmount)}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} colSpan={2} />
                      <Table.Summary.Cell index={5} align="right">
                        <span style={{ color: sellTotalProfit >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                          {sellTotalProfit >= 0 ? '+' : ''}{sellTotalProfit.toFixed(2)}
                        </span>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : undefined}
                />

                {/* ── 手动出售记录 ── */}
                <div style={{ marginTop: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Space size={16}>
                      <Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 500 }}>手动出售记录</Typography.Text>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                        共 <strong style={{ color: 'rgba(255,255,255,0.65)' }}>{manualSellOrders.length}</strong> 条
                      </span>
                      {manualSellOrders.length > 0 && (
                        <>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                            合计出售 <strong style={{ color: '#52c41a' }}>¥{fen2yuan(manualTotalAmount)}</strong>
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                            总收益 <strong style={{ color: manualTotalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}>
                              {manualTotalProfit >= 0 ? '+' : ''}{manualTotalProfit.toFixed(2)}
                            </strong>
                          </span>
                        </>
                      )}
                    </Space>
                    <Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => setAddModalOpen(true)}>
                      新增
                    </Button>
                  </div>
                  <Table<DbManualSellOrder>
                    rowKey="id" dataSource={manualSellOrders} columns={manualColumns}
                    pagination={false} scroll={{ x: 'max-content' }} size="small"
                    locale={{ emptyText: '暂无手动出售记录，点击右上角「新增」添加' }}
                    summary={() => manualSellOrders.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>合计</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right"><span style={{ color: '#52c41a', fontWeight: 600 }}>¥{fen2yuan(manualTotalAmount)}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} />
                        <Table.Summary.Cell index={4} align="right">
                          <span style={{ color: manualTotalProfit >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                            {manualTotalProfit >= 0 ? '+' : ''}{manualTotalProfit.toFixed(2)}
                          </span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} colSpan={2} />
                      </Table.Summary.Row>
                    ) : undefined}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'buy',
            label: '购买记录',
            children: (
              <div>
                <PageToolbar
                  count={buyOrders.length} totalAmount={buyTotalAmount}
                  pageSize={buyPageSize} page={buyPage} hasMore={buyHasMore} loading={buyLoading}
                  amountLabel="合计支出" amountColor="#ff4d4f"
                  onPageSizeChange={v => { setBuyPageSize(v); loadBuyOrders(1, v) }}
                  onRefresh={() => loadBuyOrders(buyPage, buyPageSize)}
                  onPrev={() => loadBuyOrders(buyPage - 1, buyPageSize)}
                  onNext={() => loadBuyOrders(buyPage + 1, buyPageSize)}
                />
                <Table<BuyOrder>
                  rowKey="orderNo" dataSource={buyOrders} columns={buyColumns}
                  loading={buyLoading} pagination={false} scroll={{ x: 'max-content' }} size="small"
                  locale={{ emptyText: buyLoading ? '加载中…' : '暂无购买记录' }}
                  summary={() => buyOrders.length > 0 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>本页合计</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right"><span style={{ color: '#ff4d4f', fontWeight: 600 }}>¥{fen2yuan(buyTotalAmount)}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} colSpan={3} />
                    </Table.Summary.Row>
                  ) : undefined}
                />
              </div>
            ),
          },
        ]} />
      </div>

      {/* 新增出售记录弹窗 */}
      <Modal
        title="新增出售记录"
        open={addModalOpen}
        onOk={handleAddSellOrder}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields() }}
        confirmLoading={addLoading}
        okText="添加"
        cancelText="取消"
        width={440}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="commodityName" label="饰品名称" rules={[{ required: true, message: '请输入饰品名称' }]}>
            <Input placeholder="例：AK-47 | 火蛇" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="exteriorName" label="磨损等级" style={{ flex: 1 }}>
              <Input placeholder="例：崭新出厂" />
            </Form.Item>
            <Form.Item name="abrade" label="磨损值" style={{ flex: 1 }}>
              <Input placeholder="例：0.01234" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="sellPrice" label="出售价（元）" rules={[{ required: true, message: '请输入出售价' }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.01} precision={2} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="buyPrice" label="购入价（元）" style={{ flex: 1 }}>
              <InputNumber min={0} step={0.01} precision={2} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="finishTime" label="成交时间" rules={[{ required: true, message: '请选择成交时间' }]}
            initialValue={dayjs()}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
