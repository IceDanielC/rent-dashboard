'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Typography, Button, Space, Spin, Tooltip, Modal, Form,
  Input, InputNumber, message, Popconfirm, Select, Table
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import Link from 'next/link'
import type { ColumnsType } from 'antd/es/table'

interface WatchlistItem {
  id: number
  item_name: string
  wear: string
  watch_price: number
  watch_rent: number
  template_id: number | null
  created_at: string
}

const BATCH_SIZE = 3
const BATCH_DELAY = 800

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [filterText, setFilterText] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [purchasePrices, setPurchasePrices] = useState<Map<number, number | null | 'loading'>>(new Map())
  const [avgRents, setAvgRents] = useState<Map<number, number | null | 'loading'>>(new Map())
  const [avgRents7, setAvgRents7] = useState<Map<number, number | null | 'loading'>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addForm] = Form.useForm()
  const [editForm] = Form.useForm()

  // templateId search state (used in add modal)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ templateId: number; commodityName: string }>>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  const [msgApi, contextHolder] = message.useMessage()

  const fetchPurchasePrices = useCallback(async (
    rows: WatchlistItem[],
    signal: AbortSignal
  ) => {
    const withTemplate = rows.filter(r => r.template_id != null)
    if (withTemplate.length === 0) return

    const initMap = new Map<number, number | null | 'loading'>()
    withTemplate.forEach(r => initMap.set(r.id, 'loading'))
    setPurchasePrices(initMap)

    for (let i = 0; i < withTemplate.length; i += BATCH_SIZE) {
      if (signal.aborted) break
      const batch = withTemplate.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (row) => {
          const MAX_RETRIES = 3
          const RETRY_DELAY = 1500
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (signal.aborted) return
            try {
              const r = await fetch(`/api/commodity/purchase-price?templateId=${row.template_id}`, { signal })
              const d = await r.json()
              if (signal.aborted) return
              if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setPurchasePrices(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, d.purchasePrice ?? null)
              })
              return
            } catch {
              if (signal.aborted) return
              if (attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setPurchasePrices(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, null)
              })
            }
          }
        })
      )
      if (i + BATCH_SIZE < withTemplate.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY))
      }
    }
  }, [])

  const fetchAvgRents = useCallback(async (
    rows: WatchlistItem[],
    signal: AbortSignal
  ) => {
    const withTemplate = rows.filter(r => r.template_id != null)
    if (withTemplate.length === 0) return

    const initMap = new Map<number, number | null | 'loading'>()
    withTemplate.forEach(r => initMap.set(r.id, 'loading'))
    setAvgRents(initMap)

    for (let i = 0; i < withTemplate.length; i += BATCH_SIZE) {
      if (signal.aborted) break
      const batch = withTemplate.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (row) => {
          const MAX_RETRIES = 3
          const RETRY_DELAY = 1500
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (signal.aborted) return
            try {
              const r = await fetch(`/api/commodity/rent-trend?templateId=${row.template_id}`, { signal })
              const d = await r.json()
              if (signal.aborted) return
              if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setAvgRents(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, d.avgRent ?? null)
              })
              return
            } catch {
              if (signal.aborted) return
              if (attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setAvgRents(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, null)
              })
            }
          }
        })
      )
      if (i + BATCH_SIZE < withTemplate.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY))
      }
    }
  }, [])

  const fetchAvgRents7 = useCallback(async (
    rows: WatchlistItem[],
    signal: AbortSignal
  ) => {
    const withTemplate = rows.filter(r => r.template_id != null)
    if (withTemplate.length === 0) return

    const initMap = new Map<number, number | null | 'loading'>()
    withTemplate.forEach(r => initMap.set(r.id, 'loading'))
    setAvgRents7(initMap)

    for (let i = 0; i < withTemplate.length; i += BATCH_SIZE) {
      if (signal.aborted) break
      const batch = withTemplate.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (row) => {
          const MAX_RETRIES = 3
          const RETRY_DELAY = 1500
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (signal.aborted) return
            try {
              const r = await fetch(`/api/commodity/rent-trend?templateId=${row.template_id}&day=7`, { signal })
              const d = await r.json()
              if (signal.aborted) return
              if (d.code !== undefined && d.code !== 0 && attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setAvgRents7(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, d.avgRent ?? null)
              })
              return
            } catch {
              if (signal.aborted) return
              if (attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
                continue
              }
              setAvgRents7(prev => {
                const existing = prev.get(row.id)
                if (typeof existing === 'number') return prev
                return new Map(prev).set(row.id, null)
              })
            }
          }
        })
      )
      if (i + BATCH_SIZE < withTemplate.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY))
      }
    }
  }, [])

  const loadList = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setListLoading(true)
    setPurchasePrices(new Map())
    setAvgRents(new Map())
    setAvgRents7(new Map())
    try {
      const res = await fetch('/api/watchlist')
      const data = await res.json()
      if (data.ok) {
        setItems(data.items)
        fetchPurchasePrices(data.items, controller.signal)
        fetchAvgRents(data.items, controller.signal)
        fetchAvgRents7(data.items, controller.signal)
      } else {
        msgApi.error(data.error ?? '加载失败')
      }
    } catch (e) {
      msgApi.error(String(e))
    } finally {
      setListLoading(false)
    }
  }, [fetchPurchasePrices, fetchAvgRents, fetchAvgRents7, msgApi])

  useEffect(() => {
    loadList()
    return () => { abortControllerRef.current?.abort() }
  }, [loadList])

  const handleSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) return
    setSearchLoading(true)
    setSearchResults([])
    setSelectedTemplateId(null)
    try {
      const res = await fetch(`/api/commodity/search?keyword=${encodeURIComponent(keyword.trim())}`)
      const data = await res.json()
      if (data.ok) {
        setSearchResults(data.items)
      } else {
        msgApi.warning('搜索失败，templateId 将为空')
      }
    } catch {
      msgApi.warning('搜索请求失败')
    } finally {
      setSearchLoading(false)
    }
  }, [msgApi])

  const handleAddSubmit = useCallback(async () => {
    try {
      const values = await addForm.validateFields()
      setSubmitting(true)
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          template_id: selectedTemplateId ?? null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('新增成功')
        setAddModalOpen(false)
        addForm.resetFields()
        setSearchResults([])
        setSelectedTemplateId(null)
        loadList()
      } else {
        msgApi.error(data.error ?? '新增失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }, [addForm, selectedTemplateId, msgApi, loadList])

  const handleEditOpen = useCallback((item: WatchlistItem) => {
    setEditingItem(item)
    editForm.setFieldsValue({
      item_name: item.item_name,
      wear: item.wear,
      watch_price: item.watch_price,
    })
    setEditModalOpen(true)
  }, [editForm])

  const handleEditSubmit = useCallback(async () => {
    if (!editingItem) return
    try {
      const values = await editForm.validateFields()
      setSubmitting(true)
      const res = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingItem.id, ...values, template_id: editingItem.template_id }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('修改成功')
        setEditModalOpen(false)
        editForm.resetFields()
        setEditingItem(null)
        loadList()
      } else {
        msgApi.error(data.error ?? '修改失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }, [editingItem, editForm, msgApi, loadList])

  const handleDelete = useCallback(async (id: number) => {
    const res = await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      msgApi.success('已删除')
      loadList()
    } else {
      msgApi.error(data.error ?? '删除失败')
    }
  }, [msgApi, loadList])

  function calcAnnualized(rent: number, currentPrice: number): number {
    return rent * 8 * 0.8 * 4 * 9.5 / currentPrice * 100
  }

  const purchaseLoadedCount = Array.from(purchasePrices.values()).filter(v => v !== 'loading' && v !== null).length
  const purchaseAllLoaded = purchasePrices.size > 0 && purchaseLoadedCount === purchasePrices.size

  const columns: ColumnsType<WatchlistItem> = [
    {
      title: '饰品名称',
      dataIndex: 'item_name',
      ellipsis: true,
      width: 280,
      fixed: 'left',
      render: (val: string) => {
        const url = `https://www.steamdt.com/mkt?search=${encodeURIComponent(val)}`
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1677ff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
          >
            {val}
          </a>
        )
      },
    },
    {
      title: '磨损',
      dataIndex: 'wear',
      width: 100,
      render: (val: string) => (
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{val || '—'}</span>
      ),
    },
    {
      title: '关注时价格',
      dataIndex: 'watch_price',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.watch_price - b.watch_price,
      render: (val: number) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{val.toFixed(2)}</span>
      ),
    },
    {
      title: '近30日均租',
      key: 'avg_rent',
      width: 120,
      align: 'right',
      sorter: (a, b) => {
        const ra = avgRents.get(a.id)
        const rb = avgRents.get(b.id)
        return (typeof ra === 'number' ? ra : 0) - (typeof rb === 'number' ? rb : 0)
      },
      render: (_, record) => {
        if (record.template_id == null) {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>无 templateId</span>
        }
        const rent = avgRents.get(record.id)
        if (rent === 'loading') return <Spin size="small" />
        if (rent == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#1677ff', fontWeight: 500 }}>¥{rent.toFixed(2)}</span>
      },
    },
    {
      title: '近7日均租',
      key: 'avg_rent7',
      width: 120,
      align: 'right',
      sorter: (a, b) => {
        const ra = avgRents7.get(a.id)
        const rb = avgRents7.get(b.id)
        return (typeof ra === 'number' ? ra : 0) - (typeof rb === 'number' ? rb : 0)
      },
      render: (_, record) => {
        if (record.template_id == null) {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>无 templateId</span>
        }
        const rent = avgRents7.get(record.id)
        if (rent === 'loading') return <Spin size="small" />
        if (rent == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#1677ff', fontWeight: 500 }}>¥{rent.toFixed(2)}</span>
      },
    },
    {
      title: '目前价格(求购)',
      key: 'current_price',
      width: 140,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.id)
        const pb = purchasePrices.get(b.id)
        return (typeof pa === 'number' ? pa : 0) - (typeof pb === 'number' ? pb : 0)
      },
      render: (_, record) => {
        if (record.template_id == null) {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>无 templateId</span>
        }
        const price = purchasePrices.get(record.id)
        if (price === 'loading') return <Spin size="small" />
        if (price == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        return <span style={{ color: '#faad14', fontWeight: 500 }}>¥{price.toFixed(2)}</span>
      },
    },
    {
      title: '涨跌率',
      key: 'change_rate',
      width: 110,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.id)
        const pb = purchasePrices.get(b.id)
        const ra = typeof pa === 'number' && a.watch_price > 0 ? (pa - a.watch_price) / a.watch_price * 100 : 0
        const rb = typeof pb === 'number' && b.watch_price > 0 ? (pb - b.watch_price) / b.watch_price * 100 : 0
        return ra - rb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.id)
        if (record.template_id == null || price === 'loading') {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        }
        if (price == null || record.watch_price <= 0) {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        }
        const rate = (price - record.watch_price) / record.watch_price * 100
        const color = rate > 0 ? '#52c41a' : rate < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color, fontWeight: 500 }}>{rate > 0 ? '+' : ''}{rate.toFixed(2)}%</span>
      },
    },
    {
      title: '年化',
      key: 'annualized',
      width: 110,
      align: 'right',
      sorter: (a, b) => {
        const pa = purchasePrices.get(a.id)
        const pb = purchasePrices.get(b.id)
        const rentA = (() => { const r30 = avgRents.get(a.id); const r7 = avgRents7.get(a.id); return typeof r30 === 'number' && typeof r7 === 'number' ? Math.min(r30, r7) : typeof r30 === 'number' ? r30 : typeof r7 === 'number' ? r7 : 0 })()
        const rentB = (() => { const r30 = avgRents.get(b.id); const r7 = avgRents7.get(b.id); return typeof r30 === 'number' && typeof r7 === 'number' ? Math.min(r30, r7) : typeof r30 === 'number' ? r30 : typeof r7 === 'number' ? r7 : 0 })()
        const va = typeof pa === 'number' && pa > 0 ? calcAnnualized(rentA, pa) : 0
        const vb = typeof pb === 'number' && pb > 0 ? calcAnnualized(rentB, pb) : 0
        return va - vb
      },
      render: (_, record) => {
        const price = purchasePrices.get(record.id)
        if (record.template_id == null || price === 'loading') {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        }
        if (price == null || price <= 0) {
          return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        }
        const r30 = avgRents.get(record.id)
        const r7 = avgRents7.get(record.id)
        if (r30 === 'loading' || r7 === 'loading') return <Spin size="small" />
        const rent = typeof r30 === 'number' && typeof r7 === 'number' ? Math.min(r30, r7)
          : typeof r30 === 'number' ? r30
          : typeof r7 === 'number' ? r7
          : null
        if (rent == null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const val = calcAnnualized(rent, price)
        const color = val >= 10 ? '#52c41a' : val >= 5 ? '#faad14' : 'rgba(255,255,255,0.65)'
        return <span style={{ color, fontWeight: 500 }}>{val.toFixed(2)}%</span>
      },
    },
    {
      title: '关注日期',
      dataIndex: 'created_at',
      width: 110,
      render: (val: string) => (
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
          {val ? val.slice(0, 10) : '—'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              style={{ color: 'rgba(255,255,255,0.45)' }}
              onClick={() => handleEditOpen(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除此条记录？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: 'clamp(12px, 3vw, 24px)' }}>
      {contextHolder}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <Space size={12} align="center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="small" style={{ color: 'rgba(255,255,255,0.45)' }} />
            </Link>
            <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
              ⭐ 关注饰品
            </Typography.Title>
          </Space>

          <Space size={8} align="center">
            {!purchaseAllLoaded && purchasePrices.size > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                求购价加载中 {purchaseLoadedCount}/{purchasePrices.size}
              </span>
            )}
            <Button
              icon={<PlusOutlined />}
              size="small"
              type="primary"
              onClick={() => {
                addForm.resetFields()
                setSearchResults([])
                setSelectedTemplateId(null)
                setAddModalOpen(true)
              }}
            >
              新增关注
            </Button>
            <Tooltip title="刷新数据及求购价">
              <Button icon={<ReloadOutlined />} size="small" loading={listLoading} onClick={loadList}>
                刷新
              </Button>
            </Tooltip>
          </Space>
        </div>

        <Input
          placeholder="搜索饰品名称"
          allowClear
          style={{ marginBottom: 12, width: 'min(280px, 100%)' }}
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <Table<WatchlistItem>
          rowKey="id"
          dataSource={filterText.trim() ? items.filter(i => i.item_name.includes(filterText.trim())) : items}
          columns={columns}
          loading={listLoading}
          scroll={{ x: 'max-content' }}
          pagination={{
            pageSize: 50,
            showSizeChanger: false,
            showTotal: (total) => (
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                共 {total} 条关注记录
              </span>
            ),
          }}
          locale={{ emptyText: '暂无关注饰品，点击「新增关注」添加' }}
          style={{ background: 'transparent' }}
        />
      </div>

      {/* 新增弹窗 */}
      <Modal
        title="新增关注饰品"
        open={addModalOpen}
        onOk={handleAddSubmit}
        onCancel={() => {
          setAddModalOpen(false)
          addForm.resetFields()
          setSearchResults([])
          setSelectedTemplateId(null)
          setPriceLoading(false)
        }}
        confirmLoading={submitting}
        okText="确认新增"
        cancelText="取消"
        width="min(520px, 95vw)"
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="item_name"
            label="饰品名称"
            rules={[{ required: true, message: '请输入饰品名称' }]}
          >
            <Input.Search
              placeholder="输入名称后点击搜索以匹配 templateId"
              enterButton={searchLoading ? <Spin size="small" /> : '搜索'}
              onSearch={handleSearch}
              allowClear
            />
          </Form.Item>

          {searchResults.length > 0 && (
            <Form.Item label="匹配结果（选择后自动填入饰品名称）">
              <Select
                placeholder="选择匹配饰品"
                allowClear
                style={{ width: '100%' }}
                onChange={async (val: number) => {
                  if (val == null) {
                    setSelectedTemplateId(null)
                    addForm.setFieldValue('watch_price', undefined)
                    return
                  }
                  const matched = searchResults.find(r => r.templateId === val)
                  setSelectedTemplateId(val)
                  if (matched) {
                    addForm.setFieldValue('item_name', matched.commodityName)
                  }
                  // 自动获取求购价填入关注时价格
                  setPriceLoading(true)
                  addForm.setFieldValue('watch_price', undefined)
                  try {
                    const r = await fetch(`/api/commodity/purchase-price?templateId=${val}`)
                    const d = await r.json()
                    if (d.purchasePrice != null) {
                      addForm.setFieldValue('watch_price', d.purchasePrice)
                    }
                  } catch { /* 失败不影响新增 */ } finally {
                    setPriceLoading(false)
                  }
                }}
                value={selectedTemplateId ?? undefined}
                options={searchResults.map(r => ({
                  value: r.templateId,
                  label: `${r.commodityName}（ID: ${r.templateId}）`,
                }))}
              />
              {selectedTemplateId && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                  templateId: {selectedTemplateId}
                </div>
              )}
            </Form.Item>
          )}

          <Form.Item name="wear" label="磨损">
            <Select allowClear placeholder="请选择磨损等级" options={[
              { value: '崭新出场', label: '崭新出场' },
              { value: '略有磨损', label: '略有磨损' },
              { value: '久经沙场', label: '久经沙场' },
              { value: '破损不堪', label: '破损不堪' },
              { value: '战痕累累', label: '战痕累累' },
            ]} />
          </Form.Item>
          <Form.Item
            name="watch_price"
            label={
              <span>
                关注时价格（元）
                {priceLoading && <Spin size="small" style={{ marginLeft: 8 }} />}
              </span>
            }
            rules={[{ required: true, message: '请输入价格' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder={priceLoading ? '获取求购价中…' : '0.00'} prefix="¥" disabled={priceLoading} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑关注饰品"
        open={editModalOpen}
        onOk={handleEditSubmit}
        onCancel={() => {
          setEditModalOpen(false)
          editForm.resetFields()
          setEditingItem(null)
        }}
        confirmLoading={submitting}
        okText="保存修改"
        cancelText="取消"
        width="min(480px, 95vw)"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="item_name"
            label="饰品名称"
            rules={[{ required: true, message: '请输入饰品名称' }]}
          >
            <Input placeholder="饰品名称" />
          </Form.Item>
          <Form.Item name="wear" label="磨损">
            <Select allowClear placeholder="请选择磨损等级" options={[
              { value: '崭新出场', label: '崭新出场' },
              { value: '略有磨损', label: '略有磨损' },
              { value: '久经沙场', label: '久经沙场' },
              { value: '破损不堪', label: '破损不堪' },
              { value: '战痕累累', label: '战痕累累' },
            ]} />
          </Form.Item>
          <Form.Item
            name="watch_price"
            label="关注时价格（元）"
            rules={[{ required: true, message: '请输入价格' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" prefix="¥" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
