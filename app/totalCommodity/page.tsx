'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Typography, Button, Spin, Space, Tooltip, Tag, Modal, message, Input, InputNumber, Select, Popconfirm, Badge } from 'antd'

import { ReloadOutlined, ArrowLeftOutlined, BellOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
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

interface MonitorItem {
  id: string           // Date.now().toString()
  item_name: string
  template_id: number | null
  target_price: number
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

function formatLastPoll(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  return `${Math.floor(diff / 3600)}小时前`
}

const MONITOR_KEY = 'price_monitor_items'
function readMonitorStorage(): MonitorItem[] {
  try {
    const raw = localStorage.getItem(MONITOR_KEY)
    if (raw) return JSON.parse(raw) as MonitorItem[]
  } catch {}
  return []
}
function writeMonitorStorage(items: MonitorItem[]): void {
  try { localStorage.setItem(MONITOR_KEY, JSON.stringify(items)) } catch {}
}

export default function TotalCommodityPage() {
  const [items, setItems] = useState<CommodityItem[]>([])
  const [buyPriceTotal, setBuyPriceTotal] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  // purchasePrices: templateId -> price | null | 'loading'
  const [purchasePrices, setPurchasePrices] = useState<Map<number, number | null | 'loading'>>(new Map())
  const [avgRents, setAvgRents] = useState<Map<number, number | null | 'loading'>>(new Map())
  const [avgRents7, setAvgRents7] = useState<Map<number, number | null | 'loading'>>(new Map())
  // templateId -> 该饰品在 records 表中的累计到手租金
  const [rentTotals, setRentTotals] = useState<Map<number, number>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const [modal, modalContextHolder] = Modal.useModal()
  const [msgApi, msgContextHolder] = message.useMessage()

  // — 价格监听（独立于关注列表，存 localStorage）—
  const [monitorItems, setMonitorItems] = useState<MonitorItem[]>([])
  const [monitorPrices, setMonitorPrices] = useState<Map<string, number | null | 'loading'>>(new Map())
  const [monitorPolling, setMonitorPolling] = useState(false)
  const [monitorLastPoll, setMonitorLastPoll] = useState<Date | null>(null)
  const [addMonitorOpen, setAddMonitorOpen] = useState(false)
  const [monitorSearchKw, setMonitorSearchKw] = useState('')
  const [monitorSearchLoading, setMonitorSearchLoading] = useState(false)
  const [monitorSearchResults, setMonitorSearchResults] = useState<Array<{ templateId: number; commodityName: string }>>([])
  const [monitorSelectedId, setMonitorSelectedId] = useState<number | null>(null)
  const [monitorTargetPrice, setMonitorTargetPrice] = useState<number | null>(null)
  const [monitorAddName, setMonitorAddName] = useState('')
  const [monitorPriceLoadingForAdd, setMonitorPriceLoadingForAdd] = useState(false)
  const alertedIdsRef = useRef<Set<string>>(new Set())
  const monitorItemsRef = useRef<MonitorItem[]>([])

  const loadInventory = useCallback(async () => {
    // 取消上一轮所有请求
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const signal = controller.signal

    setInventoryLoading(true)
    setPurchasePrices(new Map())
    setAvgRents(new Map())
    setAvgRents7(new Map())
    setRentTotals(new Map())
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

      // 批量查询各饰品累计到手租金
      try {
        const names = data.items.map(i => i.commodityName)
        const rentRes = await fetch('/api/records/rent-total', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names }),
          signal,
        })
        const rentData = await rentRes.json()
        if (rentData.ok) {
          const map = new Map<number, number>()
          data.items.forEach(item => {
            map.set(item.templateId, rentData.totals[item.commodityName] ?? 0)
          })
          setRentTotals(map)
        }
      } catch { /* 租金查询失败不影响主流程 */ }

      // 初始化所有求购价、租金趋势为 loading
      const initMap = new Map<number, number | null | 'loading'>()
      const initRentMap = new Map<number, number | null | 'loading'>()
      const initRentMap7 = new Map<number, number | null | 'loading'>()
      data.items.forEach(item => {
        initMap.set(item.templateId, 'loading')
        initRentMap.set(item.templateId, 'loading')
        initRentMap7.set(item.templateId, 'loading')
      })
      setPurchasePrices(initMap)
      setAvgRents(initRentMap)
      setAvgRents7(initRentMap7)

      const templateIds = data.items.map(i => i.templateId)

      // 批量懒加载求购价
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

      // 批量懒加载近30天平均租金
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
                const r = await fetch(`/api/commodity/rent-trend?templateId=${templateId}`, { signal })
                const d = await r.json()
                if (signal.aborted) return
                if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setAvgRents(prev => {
                  const existing = prev.get(templateId)
                  if (typeof existing === 'number') return prev
                  return new Map(prev).set(templateId, d.avgRent ?? null)
                })
                return
              } catch {
                if (signal.aborted) return
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setAvgRents(prev => {
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
      // 批量懒加载近7天平均租金
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
                const r = await fetch(`/api/commodity/rent-trend?templateId=${templateId}&day=7`, { signal })
                const d = await r.json()
                if (signal.aborted) return
                if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setAvgRents7(prev => {
                  const existing = prev.get(templateId)
                  if (typeof existing === 'number') return prev
                  return new Map(prev).set(templateId, d.avgRent ?? null)
                })
                return
              } catch {
                if (signal.aborted) return
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                  continue
                }
                setAvgRents7(prev => {
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

  // — 价格监听逻辑（完全独立，数据存 localStorage）—
  useEffect(() => { monitorItemsRef.current = monitorItems }, [monitorItems])

  const loadMonitorItems = useCallback(() => {
    setMonitorItems(readMonitorStorage())
  }, [])

  const pollMonitorPrices = useCallback(async (items: MonitorItem[]) => {
    const targets = items.filter(i => i.template_id != null && i.target_price > 0)
    if (targets.length === 0) return
    setMonitorPolling(true)
    try {
      for (const item of targets) {
        try {
          const r = await fetch(`/api/commodity/purchase-price?templateId=${item.template_id}`)
          const d = await r.json()
          const price: number | null = d.purchasePrice ?? null
          setMonitorPrices(prev => new Map(prev).set(item.id, price))
          if (
            typeof price === 'number' &&
            price >= item.target_price &&
            !alertedIdsRef.current.has(item.id)
          ) {
            alertedIdsRef.current.add(item.id)
            modal.success({
              title: '🎯 求购价达标提醒',
              content: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>{item.item_name}</div>
                  <div style={{ fontSize: 13 }}>
                    当前求购价 <span style={{ color: '#52c41a', fontWeight: 600 }}>¥{price.toFixed(2)}</span>
                    ，已达到你设置的目标价 <span style={{ color: '#faad14', fontWeight: 600 }}>¥{item.target_price.toFixed(2)}</span>！
                  </div>
                </div>
              ),
              okText: '知道了',
            })
          }
        } catch {}
        await new Promise(r => setTimeout(r, 600))
      }
      setMonitorLastPoll(new Date())
    } finally {
      setMonitorPolling(false)
    }
  }, [modal])

  // 页面加载时从 localStorage 读取监听项
  useEffect(() => {
    loadMonitorItems()
  }, [loadMonitorItems])

  // 有监听项时初始化 loading 并启动 60s 轮询
  useEffect(() => {
    if (monitorItems.length === 0) return
    setMonitorPrices(prev => {
      const next = new Map(prev)
      monitorItems.forEach(i => {
        if (i.template_id != null && !next.has(i.id)) next.set(i.id, 'loading')
      })
      return next
    })
    pollMonitorPrices(monitorItemsRef.current)
    const timer = setInterval(() => pollMonitorPrices(monitorItemsRef.current), 60_000)
    return () => clearInterval(timer)
  }, [monitorItems, pollMonitorPrices])

  const handleMonitorSearch = useCallback(async () => {
    const kw = monitorSearchKw.trim()
    if (!kw) return
    setMonitorSearchLoading(true)
    setMonitorSearchResults([])
    setMonitorSelectedId(null)
    try {
      const res = await fetch(`/api/commodity/search?keyword=${encodeURIComponent(kw)}`)
      const data = await res.json()
      if (data.ok) setMonitorSearchResults(data.items)
      else msgApi.warning('搜索失败')
    } catch {
      msgApi.warning('搜索请求失败')
    } finally {
      setMonitorSearchLoading(false)
    }
  }, [monitorSearchKw, msgApi])

  const handleMonitorAdd = useCallback(() => {
    if (!monitorAddName.trim()) { msgApi.warning('请输入饰品名称'); return }
    if (!monitorTargetPrice || monitorTargetPrice <= 0) { msgApi.warning('请输入有效的目标价'); return }
    const newItem: MonitorItem = {
      id: Date.now().toString(),
      item_name: monitorAddName.trim(),
      template_id: monitorSelectedId,
      target_price: monitorTargetPrice,
    }
    writeMonitorStorage([...readMonitorStorage(), newItem])
    msgApi.success('监听已添加')
    setAddMonitorOpen(false)
    setMonitorSearchKw('')
    setMonitorSearchResults([])
    setMonitorSelectedId(null)
    setMonitorTargetPrice(null)
    setMonitorAddName('')
    loadMonitorItems()
  }, [monitorAddName, monitorTargetPrice, monitorSelectedId, msgApi, loadMonitorItems])

  const handleMonitorDelete = useCallback((id: string) => {
    alertedIdsRef.current.delete(id)
    setMonitorPrices(prev => { const next = new Map(prev); next.delete(id); return next })
    writeMonitorStorage(readMonitorStorage().filter(i => i.id !== id))
    loadMonitorItems()
  }, [loadMonitorItems])

  const monitorAlertCount = monitorItems.filter(item => {
    const price = monitorPrices.get(item.id)
    return item.target_price > 0 && typeof price === 'number' && price >= item.target_price
  }).length

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

  // 总盈亏 = sum(市场价 - 购买均价) * 数量
  const totalProfit = items.reduce((sum, item) => sum + item.profitAndLossPrice * item.assetMergeCount, 0)
  // 总绝对盈亏 = sum(求购价 - 购买均价) * 数量
  const totalAbsoluteProfit = items.reduce((sum, item) => {
    const p = purchasePrices.get(item.templateId)
    if (typeof p === 'number') return sum + (p - item.assetBuyPrice) * item.assetMergeCount
    return sum
  }, 0)

  const columns: ProColumns<CommodityItem>[] = [
    {
      title: '饰品名称',
      dataIndex: 'commodityName',
      ellipsis: true,
      width: 300,
      fixed: "left",
      render: (_, record) => {
        const purchasePrice = purchasePrices.get(record.templateId)
        const belowMarket = typeof purchasePrice === 'number' && record.marketPrice < purchasePrice
        const avgRent30 = avgRents.get(record.templateId)
        const avgRent7 = avgRents7.get(record.templateId)
        const rentAvg = typeof avgRent30 === 'number' && typeof avgRent7 === 'number'
          ? (avgRent30 + avgRent7) / 2
          : typeof avgRent30 === 'number' ? avgRent30
          : typeof avgRent7 === 'number' ? avgRent7
          : null
        const urgent = rentAvg !== null && rentAvg < 0.2
        const optimizable = rentAvg !== null && rentAvg >= 0.2 && rentAvg < 0.6
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: belowMarket ? '#ff4d4f' : 'rgba(255,255,255,0.85)', fontSize: 13 }}>
              {record.commodityName}
            </span>
            {urgent && (
              <Tag color="red" style={{ fontSize: 11, padding: '0 4px', lineHeight: '18px', flexShrink: 0 }}>
                亟需优化
              </Tag>
            )}
            {optimizable && (
              <Tag color="orange" style={{ fontSize: 11, padding: '0 4px', lineHeight: '18px', flexShrink: 0 }}>
                可优化
              </Tag>
            )}
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
      title: '近30天均租',
      dataIndex: 'avgRent',
      width: 120,
      align: 'right',
      sorter: (a, b) => {
        const ra = avgRents.get(a.templateId)
        const rb = avgRents.get(b.templateId)
        return (typeof ra === 'number' ? ra : 0) - (typeof rb === 'number' ? rb : 0)
      },
      render: (_, record) => {
        const rent = avgRents.get(record.templateId)
        if (rent === 'loading') return <Spin size="small" />
        if (rent == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#1677ff', fontWeight: 500 }}>¥{rent.toFixed(2)}</span>
      },
    },
    {
      title: '近7天均租',
      key: 'avgRent7',
      width: 120,
      align: 'right',
      sorter: (a, b) => {
        const ra = avgRents7.get(a.templateId)
        const rb = avgRents7.get(b.templateId)
        return (typeof ra === 'number' ? ra : 0) - (typeof rb === 'number' ? rb : 0)
      },
      render: (_, record) => {
        const rent = avgRents7.get(record.templateId)
        if (rent === 'loading') return <Spin size="small" />
        if (rent == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#1677ff', fontWeight: 500 }}>¥{rent.toFixed(2)}</span>
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
    {
      title: '绝对盈亏',
      key: 'absoluteProfit',
      width: 110,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.templateId)
        const pb = purchasePrices.get(b.templateId)
        const va = typeof pa === 'number' ? pa - a.assetBuyPrice : 0
        const vb = typeof pb === 'number' ? pb - b.assetBuyPrice : 0
        return va - vb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.templateId)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const val = price - record.assetBuyPrice
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color, fontWeight: 500 }}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
      },
    },
    {
      title: '绝对盈亏%',
      key: 'absoluteProfitRange',
      width: 110,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.templateId)
        const pb = purchasePrices.get(b.templateId)
        const va = typeof pa === 'number' && a.assetBuyPrice > 0 ? (pa - a.assetBuyPrice) / a.assetBuyPrice * 100 : 0
        const vb = typeof pb === 'number' && b.assetBuyPrice > 0 ? (pb - b.assetBuyPrice) / b.assetBuyPrice * 100 : 0
        return va - vb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.templateId)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        if (record.assetBuyPrice <= 0) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const val = (price - record.assetBuyPrice) / record.assetBuyPrice * 100
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>
      },
    },
    {
      title: '综合租金盈亏(¥)',
      key: 'compositeProfitAbs',
      width: 140,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.templateId)
        const pb = purchasePrices.get(b.templateId)
        const ra = (rentTotals.get(a.templateId) ?? 0) / (a.assetMergeCount || 1)
        const rb = (rentTotals.get(b.templateId) ?? 0) / (b.assetMergeCount || 1)
        const va = typeof pa === 'number' ? (pa * 0.99 - a.assetBuyPrice) + ra : 0
        const vb = typeof pb === 'number' ? (pb * 0.99 - b.assetBuyPrice) + rb : 0
        return va - vb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.templateId)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const rentTotal = rentTotals.get(record.templateId) ?? 0
        const rent = rentTotal / (record.assetMergeCount || 1)
        const val = (price * 0.99 - record.assetBuyPrice) + rent
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return (
          <Tooltip title={`售价到手 ¥${(price * 0.99).toFixed(2)}  购入 ¥${record.assetBuyPrice.toFixed(2)}  租金合计 ¥${rentTotal.toFixed(2)} ÷${record.assetMergeCount} = ¥${rent.toFixed(2)}`}>
            <span style={{ color, fontWeight: 500 }}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '综合租金盈亏%',
      key: 'compositeProfitPct',
      width: 130,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.templateId)
        const pb = purchasePrices.get(b.templateId)
        const ra = (rentTotals.get(a.templateId) ?? 0) / (a.assetMergeCount || 1)
        const rb = (rentTotals.get(b.templateId) ?? 0) / (b.assetMergeCount || 1)
        const va = typeof pa === 'number' && a.assetBuyPrice > 0
          ? ((pa * 0.99 - a.assetBuyPrice) + ra) / a.assetBuyPrice * 100 : 0
        const vb = typeof pb === 'number' && b.assetBuyPrice > 0
          ? ((pb * 0.99 - b.assetBuyPrice) + rb) / b.assetBuyPrice * 100 : 0
        return va - vb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.templateId)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        if (record.assetBuyPrice <= 0) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const rentTotal = rentTotals.get(record.templateId) ?? 0
        const rent = rentTotal / (record.assetMergeCount || 1)
        const val = ((price * 0.99 - record.assetBuyPrice) + rent) / record.assetBuyPrice * 100
        const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return (
          <Tooltip title={`售价到手 ¥${(price * 0.99).toFixed(2)}  购入 ¥${record.assetBuyPrice.toFixed(2)}  租金合计 ¥${rentTotal.toFixed(2)} ÷${record.assetMergeCount} = ¥${rent.toFixed(2)}`}>
            <span style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</span>
          </Tooltip>
        )
      },
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: 'clamp(12px, 3vw, 24px)' }}>
      {modalContextHolder}
      {msgContextHolder}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <Space size={12} align="center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="small" style={{ color: 'rgba(255,255,255,0.45)' }} />
            </Link>
            <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
              🎒 饰品库存总览
            </Typography.Title>
          </Space>

          <Space size={8} align="center">
            {totalAbsoluteProfit < 0 && purchaseAllLoaded && (
              <Button
                size="small"
                type="default"
                style={{ borderColor: '#faad14', color: '#faad14' }}
                onClick={() => {
                  // 取7日和30日均租的较小值，两者都没有则排除
                  const itemsWithRent7 = items.filter(item =>
                    typeof avgRents7.get(item.templateId) === 'number' ||
                    typeof avgRents.get(item.templateId) === 'number'
                  )
                  if (itemsWithRent7.length === 0 || items.length === 0) {
                    modal.warning({ title: '数据不足', content: '暂无均租数据，无法计算回本周期。', okText: '知道了' })
                    return
                  }
                  const sumRent7 = itemsWithRent7.reduce((s, item) => {
                    const r7 = avgRents7.get(item.templateId)
                    const r30 = avgRents.get(item.templateId)
                    const r = typeof r7 === 'number' && typeof r30 === 'number'
                      ? Math.min(r7, r30)
                      : typeof r7 === 'number' ? r7 : r30 as number
                    return s + r * item.assetMergeCount
                  }, 0)
                  // 乘 0.8
                  const dailyMaxRent = sumRent7 * 0.8
                  const monthlyRent = dailyMaxRent * 24
                  if (monthlyRent <= 0) {
                    modal.warning({ title: '数据异常', content: '月到手租金为 0，无法计算回本周期。', okText: '知道了' })
                    return
                  }
                  const lossAbs = Math.abs(totalAbsoluteProfit)
                  const months = lossAbs / monthlyRent
                  modal.info({
                    title: '回本周期估算',
                    content: (
                      <div style={{ paddingTop: 8, lineHeight: 2 }}>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
                          参与计算饰品：<strong style={{ color: 'rgba(255,255,255,0.85)' }}>{itemsWithRent7.length}</strong> / {items.length} 种有近7日均租数据
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                          一天理论最大到手租金：<strong style={{ color: '#faad14' }}>¥{dailyMaxRent.toFixed(2)}</strong>
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>
                          月到手租金（×24天）：<strong style={{ color: '#faad14' }}>¥{monthlyRent.toFixed(2)}</strong>
                        </div>
                        <div style={{ fontSize: 15 }}>
                          总绝对亏损 <span style={{ color: '#ff4d4f', fontWeight: 600 }}>¥{lossAbs.toFixed(2)}</span>，预计
                          <span style={{ color: '#52c41a', fontWeight: 700, fontSize: 22, margin: '0 6px' }}>
                            {months.toFixed(1)}
                          </span>
                          个月能回本
                        </div>
                      </div>
                    ),
                    okText: '知道了',
                  })
                }}
              >
                回本周期
              </Button>
            )}
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
            <Button
              size="small"
              onClick={() => {
                const getRentAvg = (item: CommodityItem) => {
                  const r30 = avgRents.get(item.templateId)
                  const r7 = avgRents7.get(item.templateId)
                  if (typeof r30 === 'number' && typeof r7 === 'number') return (r30 + r7) / 2
                  if (typeof r30 === 'number') return r30
                  if (typeof r7 === 'number') return r7
                  return null
                }
                const urgentItems = items.filter(item => {
                  const avg = getRentAvg(item)
                  return avg !== null && avg < 0.2
                })
                const allOptItems = items.filter(item => {
                  const avg = getRentAvg(item)
                  return avg !== null && avg < 0.6
                })
                const calcProfit = (list: typeof items) =>
                  list.reduce((sum, item) => {
                    const p = purchasePrices.get(item.templateId)
                    if (typeof p !== 'number') return sum
                    return sum + (p - item.assetBuyPrice) * item.assetMergeCount
                  }, 0)
                const totalProfit = calcProfit(allOptItems)
                const urgentProfit = calcProfit(urgentItems)
                const profitColor = (v: number) => v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.85)'
                modal.info({
                  title: '一件优化',
                  content: (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ marginBottom: 16, fontSize: 13 }}>
                        「亟需优化」<strong style={{ color: '#ff4d4f' }}>{urgentItems.length}</strong> 件 ／
                        全部可优化 <strong>{allOptItems.length}</strong> 件
                      </div>
                      <div style={{ marginBottom: 12, fontSize: 14 }}>
                        全部可优化出售后绝对盈亏：
                        <span style={{ color: profitColor(totalProfit), fontWeight: 600, fontSize: 18, marginLeft: 8 }}>
                          {totalProfit > 0 ? '+' : ''}¥{totalProfit.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 14 }}>
                        仅「亟需优化」出售后绝对盈亏：
                        <span style={{ color: profitColor(urgentProfit), fontWeight: 600, fontSize: 18, marginLeft: 8 }}>
                          {urgentProfit > 0 ? '+' : ''}¥{urgentProfit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ),
                  okText: '知道了',
                })
              }}
            >
              一件优化
            </Button>

            <Tooltip title="添加价格监听，当求购价达到目标价时弹窗提醒">
              <Badge count={monitorAlertCount} size="small">
                <Button
                  size="small"
                  icon={<BellOutlined />}
                  onClick={() => setAddMonitorOpen(true)}
                >
                  监听
                </Button>
              </Badge>
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
          <StatisticCard
            statistic={{
              title: '总盈亏',
              value: (totalProfit >= 0 ? '+' : '') + totalProfit.toFixed(2),
              prefix: '¥',
              valueStyle: { color: totalProfit > 0 ? '#52c41a' : totalProfit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.85)' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总绝对盈亏',
              value: (totalAbsoluteProfit >= 0 ? '+' : '') + totalAbsoluteProfit.toFixed(2),
              prefix: '¥',
              valueStyle: { color: totalAbsoluteProfit > 0 ? '#52c41a' : totalAbsoluteProfit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.85)' },
              description: !purchaseAllLoaded && purchasePrices.size > 0
                ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>加载中…</span>
                : undefined,
            }}
          />
        </StatisticCard.Group>

        {/* 价格监听面板（有监听项时自动展示） */}
        {monitorItems.length > 0 && (
          <div style={{
            marginBottom: 20,
            background: '#1a1a1a',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '12px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Space size={10} align="center">
                <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 13 }}>
                  🔔 价格监听
                </span>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                  {monitorItems.length} 项监听中
                </span>
                {monitorLastPoll && (
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                    · 上次检测 {formatLastPoll(monitorLastPoll)}
                  </span>
                )}
                {monitorPolling && <Spin size="small" />}
              </Space>
              <Space size={6}>
                <Tooltip title="立即重新检测所有监听项">
                  <Button size="small" icon={<ReloadOutlined />} loading={monitorPolling}
                    onClick={() => pollMonitorPrices(monitorItemsRef.current)}>
                    立即检测
                  </Button>
                </Tooltip>
                <Button size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => setAddMonitorOpen(true)}>
                  添加监听
                </Button>
              </Space>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['饰品名称', '目标求购价', '当前求购价', '状态', '操作'].map(h => (
                      <th key={h} style={{
                        padding: '4px 12px',
                        textAlign: h === '饰品名称' ? 'left' : 'center',
                        color: 'rgba(255,255,255,0.35)',
                        fontWeight: 400,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        whiteSpace: 'nowrap',
                        fontSize: 12,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitorItems.map(item => {
                    const price = monitorPrices.get(item.id)
                    const reached = typeof price === 'number' && item.target_price > 0 && price >= item.target_price
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 12px', color: reached ? '#52c41a' : 'rgba(255,255,255,0.85)' }}>
                          {item.item_name}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#faad14', fontWeight: 500 }}>
                          ¥{item.target_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                          {item.template_id == null
                            ? <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>无 templateId</span>
                            : price === 'loading'
                              ? <Spin size="small" />
                              : price == null
                                ? <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                                : <span style={{ color: reached ? '#52c41a' : 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                                    ¥{price.toFixed(2)}
                                  </span>
                          }
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                          {item.template_id != null && typeof price === 'number'
                            ? reached
                              ? <Tag color="success" style={{ marginInlineEnd: 0 }}>✅ 已达标</Tag>
                              : <Tag color="default" style={{ color: 'rgba(255,255,255,0.45)', marginInlineEnd: 0 }}>监听中</Tag>
                            : null
                          }
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                          <Popconfirm title="确认删除此监听项？" onConfirm={() => handleMonitorDelete(item.id)} okText="删除" cancelText="取消">
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

      {/* 价格监听弹窗 */}
      <Modal
        title="🔔 价格监听"
        open={addMonitorOpen}
        onOk={handleMonitorAdd}
        onCancel={() => {
          setAddMonitorOpen(false)
          setMonitorSearchKw('')
          setMonitorSearchResults([])
          setMonitorSelectedId(null)
          setMonitorTargetPrice(null)
          setMonitorAddName('')
        }}
        okText="添加"
        cancelText="关闭"
        width="min(580px, 95vw)"
      >
        <div style={{ marginTop: 8 }}>

          {/* 当前监听列表 */}
          {monitorItems.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                当前监听中 · 每 60 秒自动检测
                {monitorPolling && <Spin size="small" style={{ marginLeft: 8 }} />}
                {monitorLastPoll && (
                  <span style={{ marginLeft: 8 }}>· 上次检测 {formatLastPoll(monitorLastPoll)}</span>
                )}
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                {monitorItems.map((item, idx) => {
                  const price = monitorPrices.get(item.id)
                  const reached = typeof price === 'number' && price >= item.target_price
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        gap: 8,
                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderBottom: idx < monitorItems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}
                    >
                      {/* 名称 */}
                      <span style={{ flex: 1, fontSize: 13, color: reached ? '#52c41a' : 'rgba(255,255,255,0.85)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.item_name}
                      </span>
                      {/* 目标价 */}
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                        目标 <span style={{ color: '#faad14' }}>¥{item.target_price.toFixed(2)}</span>
                      </span>
                      {/* 当前价 */}
                      <span style={{ fontSize: 12, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
                        {item.template_id == null
                          ? <span style={{ color: 'rgba(255,255,255,0.2)' }}>无价格</span>
                          : price === 'loading'
                            ? <Spin size="small" />
                            : price == null
                              ? <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                              : <span style={{ color: reached ? '#52c41a' : 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                                  当前 ¥{price.toFixed(2)}
                                </span>
                        }
                      </span>
                      {/* 状态 */}
                      <span style={{ minWidth: 52, textAlign: 'center' }}>
                        {reached
                          ? <Tag color="success" style={{ marginInlineEnd: 0, fontSize: 11 }}>✅ 达标</Tag>
                          : item.template_id != null && typeof price === 'number'
                            ? <Tag color="default" style={{ color: 'rgba(255,255,255,0.35)', marginInlineEnd: 0, fontSize: 11 }}>监听中</Tag>
                            : null
                        }
                      </span>
                      {/* 删除 */}
                      <Popconfirm
                        title="删除此监听项？"
                        onConfirm={() => handleMonitorDelete(item.id)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ flexShrink: 0 }} />
                      </Popconfirm>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
              暂无监听项
            </div>
          )}

          {/* 分割线 */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 16, paddingTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
            添加新监听
          </div>

          {/* 搜索饰品 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>饰品名称搜索</div>
            <Input.Search
              placeholder="输入关键词搜索饰品"
              value={monitorSearchKw}
              onChange={e => setMonitorSearchKw(e.target.value)}
              onSearch={handleMonitorSearch}
              loading={monitorSearchLoading}
              enterButton="搜索"
              allowClear
            />
          </div>

          {/* 搜索结果下拉 */}
          {monitorSearchResults.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>选择匹配饰品</div>
              <Select
                placeholder="选择饰品（自动填入名称和当前求购价）"
                style={{ width: '100%' }}
                allowClear
                value={monitorSelectedId ?? undefined}
                onChange={async (val: number | undefined) => {
                  if (val == null) { setMonitorSelectedId(null); return }
                  const matched = monitorSearchResults.find(r => r.templateId === val)
                  setMonitorSelectedId(val)
                  if (matched) setMonitorAddName(matched.commodityName)
                  setMonitorPriceLoadingForAdd(true)
                  setMonitorTargetPrice(null)
                  try {
                    const r = await fetch(`/api/commodity/purchase-price?templateId=${val}`)
                    const d = await r.json()
                    if (d.purchasePrice != null) setMonitorTargetPrice(d.purchasePrice)
                  } catch { /* ignore */ } finally {
                    setMonitorPriceLoadingForAdd(false)
                  }
                }}
                options={monitorSearchResults.map(r => ({
                  value: r.templateId,
                  label: `${r.commodityName}（ID: ${r.templateId}）`,
                }))}
              />
            </div>
          )}

          {/* 饰品名称 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>饰品名称</div>
            <Input
              placeholder="手动输入或通过搜索自动填入"
              value={monitorAddName}
              onChange={e => setMonitorAddName(e.target.value)}
            />
          </div>

          {/* 目标价 */}
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              目标求购价（元）
              {monitorPriceLoadingForAdd && <Spin size="small" style={{ marginLeft: 8 }} />}
            </div>
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              step={0.01}
              precision={2}
              prefix="¥"
              placeholder={monitorPriceLoadingForAdd ? '获取当前价中…' : '当求购价 ≥ 此值时弹窗提醒'}
              value={monitorTargetPrice ?? undefined}
              onChange={v => setMonitorTargetPrice(v)}
              disabled={monitorPriceLoadingForAdd}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
