'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Typography, Button, Tooltip, message, Badge, Space, Modal, Form, Input, Select, DatePicker, InputNumber } from 'antd'
import { SyncOutlined, ClockCircleOutlined, BarChartOutlined, AppstoreOutlined, ApartmentOutlined, StarOutlined, KeyOutlined, ShopOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import Link from 'next/link'
import StatsCards from '@/components/StatsCards'
import IncomeChart from '@/components/IncomeChart'
import FilterBar, { type Filters } from '@/components/FilterBar'
import RecordsTable from '@/components/RecordsTable'
import type { Stats, RecordsResponse, RentRecord } from '@/lib/types'

const DEFAULT_FILTERS: Filters = {
  dateFrom: '', dateTo: '', keyword: '', orderNo: '', wearLevels: [],
  wearValueMin: '', wearValueMax: '', orderStatus: ''
}

interface SyncStatus {
  last_sync: string | null
  last_added: number | null
}

function formatRelativeTime(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)  return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [records, setRecords] = useState<RecordsResponse | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState('msg_time')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ last_sync: null, last_added: null })
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addForm] = Form.useForm()
  const [chainModalOpen, setChainModalOpen] = useState(false)
  const [chainOrderId, setChainOrderId] = useState('')
  const [chainSyncing, setChainSyncing] = useState(false)
  const [soldWearValues, setSoldWearValues] = useState<Set<string>>(new Set())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authToken, setAuthToken] = useState('')
  const [authCookie, setAuthCookie] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [settingLeasePrices, setSettingLeasePrices] = useState(false)
  const [msgApi, contextHolder] = message.useMessage()

  const loadStats = useCallback(() => {
    setStatsLoading(true)
    fetch('/api/stats').then(r => r.json()).then(setStats).finally(() => setStatsLoading(false))
  }, [])

  const loadSyncStatus = useCallback(() => {
    fetch('/api/sync-status').then(r => r.json()).then(setSyncStatus).catch(() => {})
  }, [])

  const loadSoldWearValues = useCallback(() => {
    fetch('/api/assets').then(r => r.json()).then(data => {
      if (data.ok) {
        const set = new Set<string>(
          data.assets
            .filter((a: { sell_price: number }) => a.sell_price > 0)
            .map((a: { wear_value: number }) => a.wear_value.toFixed(6))
        )
        setSoldWearValues(set)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    loadSyncStatus()
    loadSoldWearValues()
    handleSync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.dateFrom)          params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo)            params.set('dateTo', filters.dateTo)
    if (filters.keyword)           params.set('keyword', filters.keyword)
    if (filters.orderNo)           params.set('orderNo', filters.orderNo)
    if (filters.wearLevels.length) params.set('wearLevel', filters.wearLevels.join(','))
    if (filters.wearValueMin)      params.set('wearValueMin', filters.wearValueMin)
    if (filters.wearValueMax)      params.set('wearValueMax', filters.wearValueMax)
    if (filters.orderStatus)       params.set('orderStatus', filters.orderStatus)
    params.set('sortKey', sortKey)
    params.set('sortDir', sortDir)
    params.set('page', String(page))
    params.set('pageSize', '20')
    const res = await fetch(`/api/records?${params}`)
    const data = await res.json()
    setRecords(data)
    setLoading(false)
  }, [filters, sortKey, sortDir, page])

  useEffect(() => { loadRecords() }, [loadRecords])

  const handleSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    msgApi.loading({ content: '正在同步数据...', key: 'sync', duration: 0 })
    try {
      const res = await fetch('/api/sync')
      const data = await res.json()
      if (data.ok) {
        msgApi.success({ content: data.message, key: 'sync', duration: 4 })
        if (data.added > 0) {
          // 有新数据，刷新统计和记录
          loadStats()
          loadRecords()
        }
        loadSyncStatus()
      } else {
        msgApi.error({ content: `同步失败: ${data.error}`, key: 'sync', duration: 5 })
      }
    } catch (e) {
      msgApi.error({ content: `同步请求失败: ${String(e)}`, key: 'sync', duration: 5 })
    } finally {
      setSyncing(false)
      syncingRef.current = false
    }
  }, [msgApi, loadStats, loadRecords, loadSyncStatus])

  const handleChainSync = useCallback(async () => {
    const id = chainOrderId.trim()
    if (!id) { msgApi.warning('请输入订单号'); return }
    setChainSyncing(true)
    msgApi.loading({ content: '递归同步中...', key: 'chain', duration: 0 })
    try {
      const res = await fetch('/api/sync-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success({ content: data.message, key: 'chain', duration: 6 })
        setChainModalOpen(false)
        setChainOrderId('')
        loadStats()
        loadRecords()
      } else {
        msgApi.error({ content: `递归同步失败: ${data.error}`, key: 'chain', duration: 5 })
      }
    } catch (e) {
      msgApi.error({ content: `请求失败: ${String(e)}`, key: 'chain', duration: 5 })
    } finally {
      setChainSyncing(false)
    }
  }, [chainOrderId, msgApi, loadStats, loadRecords])

  function handleFiltersChange(f: Filters) {
    setFilters(f)
    setPage(1)
  }

  function handleSort(key: string, dir: 'asc' | 'desc') {
    setSortKey(key)
    setSortDir(dir)
    setPage(1)
  }

  const handleAddSubmit = useCallback(async () => {
    try {
      const values = await addForm.validateFields()
      setAddSubmitting(true)
      const income = parseFloat(values.income ?? '0') || 0
      const payload = {
        ...values,
        msg_time: values.msg_time ? dayjs(values.msg_time).format('YYYY-MM-DD HH:mm:ss') : '',
        actual_income: parseFloat((income * 0.8).toFixed(2)),
      }
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('新增成功')
        setAddModalOpen(false)
        addForm.resetFields()
        loadStats()
        loadRecords()
      } else {
        msgApi.error(data.error ?? '新增失败')
      }
    } catch {
      // validateFields 失败时不处理
    } finally {
      setAddSubmitting(false)
    }
  }, [addForm, msgApi, loadStats, loadRecords])

  const handleEdit = useCallback(async (id: number, values: Partial<RentRecord>) => {
    const res = await fetch('/api/records', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...values }),
    })
    const data = await res.json()
    if (data.ok) {
      msgApi.success('修改成功')
      loadStats()
      loadRecords()
    } else {
      msgApi.error(data.error ?? '修改失败')
    }
  }, [msgApi, loadStats, loadRecords])

  const handleDelete = useCallback(async (id: number) => {
    const res = await fetch(`/api/records?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      msgApi.success('已删除')
      loadStats()
      loadRecords()
    } else {
      msgApi.error(data.error ?? '删除失败')
    }
  }, [msgApi, loadStats, loadRecords])

  const handleOneClickSetLeasePrice = useCallback(async () => {
    if (settingLeasePrices) return
    setSettingLeasePrices(true)
    msgApi.loading({ content: '正在设置转租价格...', key: 'setLeasePrice', duration: 0 })
    try {
      const res = await fetch('/api/commodity/one-click-set-lease-price', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        msgApi.success({
          content: data.message ?? `设置完成：提交 ${data.submitted ?? 0} 个，跳过 ${data.skipped ?? 0} 个`,
          key: 'setLeasePrice',
          duration: 6,
        })
        if (data.priceChangeResult != null) {
          const priceChangeResultText = typeof data.priceChangeResult === 'string'
            ? data.priceChangeResult
            : JSON.stringify(data.priceChangeResult)
          msgApi.info({ content: `改价结果：${priceChangeResultText}`, duration: 8 })
        }
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          msgApi.warning({
            content: `有 ${data.errors.length} 个商品处理失败：${data.errors.slice(0, 2).join('；')}`,
            duration: 8,
          })
        }
      } else {
        msgApi.error({ content: `设置失败: ${data.error ?? '未知错误'}`, key: 'setLeasePrice', duration: 6 })
      }
    } catch (e) {
      msgApi.error({ content: `请求失败: ${String(e)}`, key: 'setLeasePrice', duration: 6 })
    } finally {
      setSettingLeasePrices(false)
    }
  }, [settingLeasePrices, msgApi])

  const openAuthModal = useCallback(async () => {
    try {
      const res = await fetch('/api/auth-config')
      const data = await res.json()
      if (data.ok) {
        setAuthToken(data.token ?? '')
        setAuthCookie(data.cookie ?? '')
      }
    } catch {}
    setAuthModalOpen(true)
  }, [])

  const handleAuthSubmit = useCallback(async () => {
    setAuthSubmitting(true)
    try {
      const res = await fetch('/api/auth-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken, cookie: authCookie }),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('凭证已保存，下次同步生效')
        setAuthModalOpen(false)
      } else {
        msgApi.error(data.error ?? '保存失败')
      }
    } catch (e) {
      msgApi.error(`请求失败: ${String(e)}`)
    } finally {
      setAuthSubmitting(false)
    }
  }, [authToken, authCookie, msgApi])

  const handleCopy = useCallback((record: RentRecord) => {
    addForm.setFieldsValue({
      msg_time:     record.msg_time ? dayjs(record.msg_time) : null,
      msg_type:     record.msg_type,
      order_no:     '',
      item_name:    record.item_name,
      wear_level:   record.wear_level,
      wear_value:   record.wear_value,
      income:       record.income,
      lease_days:   record.lease_days,
      order_status: record.order_status,
    })
    setAddModalOpen(true)
  }, [addForm])

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: 'clamp(12px, 3vw, 24px)' }}>
      {contextHolder}
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 'clamp(15px, 4vw, 20px)' }}>
            🎮 悠悠有品 · 转租收益记录
          </Typography.Title>

          <Space size={6} align="center" wrap>
            {/* 上次同步时间 */}
            {syncStatus.last_sync && (
              <Tooltip title={`上次同步: ${syncStatus.last_sync}${syncStatus.last_added != null ? `，新增 ${syncStatus.last_added} 条` : ''}`}>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'default' }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {formatRelativeTime(syncStatus.last_sync)}同步
                  {syncStatus.last_added != null && syncStatus.last_added > 0 && (
                    <Badge count={`+${syncStatus.last_added}`} style={{ marginLeft: 6, fontSize: 11, backgroundColor: '#52c41a' }} />
                  )}
                </span>
              </Tooltip>
            )}

            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              共 {stats?.total ?? '...'} 条
            </Typography.Text>

            {/* 手动新增按钮
            <Button
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
              size="small"
            >
              新增
            </Button> */}

            {/* 手动同步按钮 */}
            <Tooltip title="从悠悠有品拉取最新消息，自动写入数据库">
              <Button
                type="primary"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleSync}
                size="small"
              >
                同步
              </Button>
            </Tooltip>

            {/* 一键设置转租价格按钮 */}
            <Tooltip title="获取即将到期转租商品，按市场最低租赁价批量设置转租价格">
              <Button
                loading={settingLeasePrices}
                disabled={settingLeasePrices}
                onClick={handleOneClickSetLeasePrice}
                size="small"
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
              >
                一件设置转租价格
              </Button>
            </Tooltip>

            {/* 递归同步按钮 */}
            <Tooltip title="输入订单号，沿转租链路递归同步所有原始订单">
              <Button
                icon={<ApartmentOutlined />}
                onClick={() => setChainModalOpen(true)}
                size="small"
              >
                递归
              </Button>
            </Tooltip>

            {/* 鉴权凭证按钮 */}
            <Tooltip title="更新登录凭证（Token / Cookie），鉴权失效时使用">
              <Button
                icon={<KeyOutlined />}
                onClick={openAuthModal}
                size="small"
              >
                凭证
              </Button>
            </Tooltip>
          </Space>
        </div>

        {/* 导航链接行 */}
        <div style={{ marginBottom: 16 }}>
          <Space size={8} wrap>
            <Link href="/totalCommodity">
              <Button icon={<AppstoreOutlined />} size="small">库存总览</Button>
            </Link>
            <Link href="/revenue">
              <Button icon={<BarChartOutlined />} size="small">出租饰品售出统计</Button>
            </Link>
            <Link href="/watchlist">
              <Button icon={<StarOutlined />} size="small">关注饰品</Button>
            </Link>
            <Link href="/merchant-total">
              <Button icon={<ShopOutlined />} size="small">历史交易总览</Button>
            </Link>
          </Space>
        </div>

        <StatsCards
          stats={stats}
          loading={statsLoading}
          filteredActual={records?.filteredActual ?? 0}
          filteredCount={records?.total ?? 0}
        />

        {stats?.trend && <IncomeChart trend={stats.trend} />}

        <FilterBar
          filters={filters}
          onChange={handleFiltersChange}
          onReset={() => { setFilters(DEFAULT_FILTERS); setPage(1) }}
        />

        <RecordsTable
          data={records}
          loading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          page={page}
          onPage={setPage}
          soldWearValues={soldWearValues}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onCopy={handleCopy}
        />
      </div>

      {/* 手动新增记录弹窗 */}
      <Modal
        title="手动新增记录"
        open={addModalOpen}
        onOk={handleAddSubmit}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields() }}
        confirmLoading={addSubmitting}
        okText="确认新增"
        cancelText="取消"
        width="min(520px, 95vw)"
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="msg_time" label="消息时间" rules={[{ required: true, message: '请选择时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="order_no" label="订单号" rules={[{ required: true, message: '请输入订单号' }]}>
            <Input placeholder="请输入订单号" />
          </Form.Item>
          <Form.Item name="item_name" label="饰品名称">
            <Input placeholder="请输入饰品名称" />
          </Form.Item>
          <Form.Item name="wear_level" label="磨损等级">
            <Select allowClear options={[
              { value: '崭新出厂', label: '崭新出厂' },
              { value: '轻微磨损', label: '轻微磨损' },
              { value: '略有磨损', label: '略有磨损' },
              { value: '久经沙场', label: '久经沙场' },
              { value: '战痕累累', label: '战痕累累' },
            ]} />
          </Form.Item>
          <Form.Item name="wear_value" label="磨损值">
            <InputNumber min={0} max={1} step={0.000001} style={{ width: '100%' }} placeholder="0.000000" />
          </Form.Item>
          <Form.Item name="income" label="租金（元）" rules={[{ required: true, message: '请输入租金' }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" prefix="¥" />
          </Form.Item>
          <Form.Item name="lease_days" label="租用天数">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item name="order_status" label="订单状态">
            <Input placeholder="如：已完成" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 递归同步弹窗 */}
      <Modal
        title="递归同步转租链路"
        open={chainModalOpen}
        onOk={handleChainSync}
        onCancel={() => { setChainModalOpen(false); setChainOrderId('') }}
        confirmLoading={chainSyncing}
        okText="开始同步"
        cancelText="取消"
        width="min(420px, 95vw)"
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            从输入的订单号开始，沿 subletOriginOrderId 链路递归查询并覆盖/新增数据库记录，直到无原始订单为止。
          </div>
          <Input
            placeholder="请输入起始订单号"
            value={chainOrderId}
            onChange={e => setChainOrderId(e.target.value)}
            onPressEnter={handleChainSync}
            autoFocus
          />
        </div>
      </Modal>

      {/* 鉴权凭证弹窗 */}
      <Modal
        title="更新登录凭证"
        open={authModalOpen}
        onOk={handleAuthSubmit}
        onCancel={() => setAuthModalOpen(false)}
        confirmLoading={authSubmitting}
        okText="保存"
        cancelText="取消"
        width="min(520px, 95vw)"
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            登录凭证过期时在此更新，保存后立即对后续同步请求生效。
          </div>
          <Form layout="vertical">
            <Form.Item label="Authorization Token" style={{ marginBottom: 12 }}>
              <Input.TextArea
                rows={3}
                placeholder="Bearer eyJ..."
                value={authToken}
                onChange={e => setAuthToken(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
            <Form.Item label="Cookie" style={{ marginBottom: 0 }}>
              <Input.TextArea
                rows={3}
                placeholder="可选，有需要时填写"
                value={authCookie}
                onChange={e => setAuthCookie(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  )
}
