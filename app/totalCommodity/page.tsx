'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Typography, Button, Spin, Space, Tooltip } from 'antd'
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { StatisticCard } from '@ant-design/pro-components'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import Link from 'next/link'

interface CommodityItem {
  templateId: number
  commodityName: string
  assetBuyPrice: number
  assetMergeCount: number
  marketPrice: number
  iconUrl: string
  profitAndLossPrice: number
  profitAndLossRange: number
}

interface InventoryResp {
  ok: boolean
  items: CommodityItem[]
  buyPriceTotal: number
  totalCount: number
  profitAndLossTotal: number
  error?: string
}

const BATCH_SIZE = 3
const BATCH_DELAY = 800

export default function TotalCommodityPage() {
  const [items, setItems] = useState<CommodityItem[]>([])
  const [buyPriceTotal, setBuyPriceTotal] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  // purchasePrices: templateId -> price | null | 'loading'
  const [purchasePrices, setPurchasePrices] = useState<Map<number, number | null | 'loading'>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadInventory = useCallback(async () => {
    // 取消上一轮所有请求
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const signal = controller.signal

    setInventoryLoading(true)
    setPurchasePrices(new Map())
    setItems([])

    try {
      const res = await fetch('/api/commodity/inventory', { signal })
      const data: InventoryResp = await res.json()
      if (!data.ok) {
        console.error('库存接口错误:', data.error)
        return
      }
      setItems(data.items)
      setBuyPriceTotal(data.buyPriceTotal)
      setTotalCount(data.totalCount)

      // 初始化所有求购价为 loading
      const initMap = new Map<number, number | null | 'loading'>()
      data.items.forEach(item => initMap.set(item.templateId, 'loading'))
      setPurchasePrices(initMap)

      // 开始懒加载求购价
      const templateIds = data.items.map(i => i.templateId)
      for (let i = 0; i < templateIds.length; i += BATCH_SIZE) {
        if (signal.aborted) break
        const batch = templateIds.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (templateId) => {
            const MAX_RETRIES = 3
            const RETRY_DELAY = 1500
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
              if (signal.aborted) return
              try {
                const r = await fetch(`/api/commodity/purchase-price?templateId=${templateId}`, { signal })
                const d = await r.json()
                if (signal.aborted) return
                // code 不为 0 说明被限流或接口异常，重试
                if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setPurchasePrices(prev => {
                  const existing = prev.get(templateId)
                  if (typeof existing === 'number') return prev
                  return new Map(prev).set(templateId, d.purchasePrice ?? null)
                })
                return
              } catch (err) {
                console.error('[purchase-price] templateId=', templateId, 'error=', err)
                if (signal.aborted) return
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setPurchasePrices(prev => {
                  const existing = prev.get(templateId)
                  if (typeof existing === 'number') return prev
                  return new Map(prev).set(templateId, null)
                })
              }
            }
          })
        )
        if (i + BATCH_SIZE < templateIds.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY))
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      console.error('[loadInventory]', e)
    } finally {
      if (!signal.aborted) setInventoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInventory()
    return () => { abortControllerRef.current?.abort() }
  }, [loadInventory])

  // 标红饰品（市场价 < 求购价）优先排到前面，随求购价加载实时更新
  const sortedItems = [...items].sort((a, b) => {
    const pa = purchasePrices.get(a.templateId)
    const pb = purchasePrices.get(b.templateId)
    const aRed = typeof pa === 'number' && a.marketPrice < pa
    const bRed = typeof pb === 'number' && b.marketPrice < pb
    if (aRed && !bRed) return -1
    if (!aRed && bRed) return 1
    return 0
  })

  // 实时计算汇总
  const totalMarketPrice = items.reduce((sum, item) => sum + item.marketPrice * item.assetMergeCount, 0)
  const totalPurchasePrice = items.reduce((sum, item) => {
    const p = purchasePrices.get(item.templateId)
    if (typeof p === 'number') return sum + p * item.assetMergeCount
    return sum
  }, 0)
  const purchaseLoadedCount = Array.from(purchasePrices.values()).filter(v => v !== 'loading' && v !== null).length
  const purchaseAllLoaded = purchasePrices.size > 0 && purchaseLoadedCount === purchasePrices.size

  const columns: ProColumns<CommodityItem>[] = [
    {
      title: '饰品名称',
      dataIndex: 'commodityName',
      ellipsis: true,
      width: 300,
      render: (_, record) => {
        const purchasePrice = purchasePrices.get(record.templateId)
        const belowMarket = typeof purchasePrice === 'number' && record.marketPrice < purchasePrice
        return (
          <span style={{ color: belowMarket ? '#ff4d4f' : 'rgba(255,255,255,0.85)', fontSize: 13 }}>
            {record.commodityName}
          </span>
        )
      },
    },
    {
      title: '数量',
      dataIndex: 'assetMergeCount',
      width: 70,
      align: 'center',
      sorter: (a, b) => a.assetMergeCount - b.assetMergeCount,
    },
    {
      title: '购买均价',
      dataIndex: 'assetBuyPrice',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.assetBuyPrice - b.assetBuyPrice,
      render: (_, record) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{record.assetBuyPrice.toFixed(2)}</span>
      ),
    },
    {
      title: '市场价',
      dataIndex: 'marketPrice',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.marketPrice - b.marketPrice,
      render: (_, record) => (
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>¥{record.marketPrice.toFixed(2)}</span>
      ),
    },
    {
      title: '求购价',
      dataIndex: 'purchasePrice',
      width: 110,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.templateId)
        const pb = purchasePrices.get(b.templateId)
        return (typeof pa === 'number' ? pa : 0) - (typeof pb === 'number' ? pb : 0)
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.templateId)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#faad14', fontWeight: 500 }}>¥{price.toFixed(2)}</span>
      },
    },
    {
      title: '盈亏',
      dataIndex: 'profitAndLossPrice',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.profitAndLossPrice - b.profitAndLossPrice,
      render: (_, record) => {
        const val = record.profitAndLossPrice
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color, fontWeight: 500 }}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
      },
    },
    {
      title: '盈亏%',
      dataIndex: 'profitAndLossRange',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.profitAndLossRange - b.profitAndLossRange,
      render: (_, record) => {
        const val = record.profitAndLossRange
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>
      },
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: '24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Space size={12} align="center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="small" style={{ color: 'rgba(255,255,255,0.45)' }} />
            </Link>
            <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
              🎒 饰品库存总览
            </Typography.Title>
          </Space>

          <Space size={8} align="center">
            {!purchaseAllLoaded && purchasePrices.size > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                求购价加载中 {purchaseLoadedCount}/{purchasePrices.size}
              </span>
            )}
            <Tooltip title="重新拉取库存和求购价数据">
              <Button
                icon={<ReloadOutlined />}
                loading={inventoryLoading}
                onClick={loadInventory}
                size="small"
              >
                刷新
              </Button>
            </Tooltip>
          </Space>
        </div>

        {/* 汇总卡片 */}
        <StatisticCard.Group
          style={{ marginBottom: 20 }}
          loading={inventoryLoading}
        >
          <StatisticCard
            statistic={{
              title: '持有饰品种类',
              value: totalCount,
              suffix: '种',
              valueStyle: { color: '#1677ff' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总购买金额',
              value: buyPriceTotal.toFixed(2),
              prefix: '¥',
              valueStyle: { color: '#52c41a' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总市场价',
              value: totalMarketPrice.toFixed(2),
              prefix: '¥',
              valueStyle: { color: 'rgba(255,255,255,0.85)' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总求购价',
              value: totalPurchasePrice.toFixed(2),
              prefix: '¥',
              valueStyle: { color: '#faad14' },
              description: !purchaseAllLoaded && purchasePrices.size > 0
                ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>加载中…</span>
                : undefined,
            }}
          />
        </StatisticCard.Group>

        {/* 饰品表格 */}
        <ProTable<CommodityItem>
          rowKey="templateId"
          dataSource={sortedItems}
          columns={columns}
          loading={items.length === 0 && inventoryLoading}
          search={false}
          options={false}
          cardBordered
          scroll={{ x: 'max-content' }}
          pagination={{
            pageSize: 50,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total) => (
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                共 {total} 种饰品 &nbsp;|&nbsp;
                总市场价 <span style={{ color: 'rgba(255,255,255,0.85)' }}>¥{totalMarketPrice.toFixed(2)}</span>
                &nbsp;|&nbsp;
                总求购价 <span style={{ color: '#faad14' }}>
                  ¥{totalPurchasePrice.toFixed(2)}
                  {!purchaseAllLoaded && purchasePrices.size > 0 && ' (加载中…)'}
                </span>
              </span>
            ),
          }}
          locale={{ emptyText: inventoryLoading ? '正在加载库存数据…' : '暂无饰品数据' }}
        />
      </div>
    </div>
  )
}
