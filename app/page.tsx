'use client'
import { useState, useEffect, useCallback } from 'react'
import { Typography, Button, Tooltip, message, Badge, Space } from 'antd'
import { SyncOutlined, ClockCircleOutlined } from '@ant-design/icons'
import StatsCards from '@/components/StatsCards'
import IncomeChart from '@/components/IncomeChart'
import FilterBar, { type Filters } from '@/components/FilterBar'
import RecordsTable from '@/components/RecordsTable'
import type { Stats, RecordsResponse } from '@/lib/types'

const DEFAULT_FILTERS: Filters = {
  dateFrom: '', dateTo: '', msgType: '', keyword: '', wearLevels: [],
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ last_sync: null, last_added: null })
  const [msgApi, contextHolder] = message.useMessage()

  const loadStats = useCallback(() => {
    setStatsLoading(true)
    fetch('/api/stats').then(r => r.json()).then(setStats).finally(() => setStatsLoading(false))
  }, [])

  const loadSyncStatus = useCallback(() => {
    fetch('/api/sync-status').then(r => r.json()).then(setSyncStatus).catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    loadSyncStatus()
    handleSync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.dateFrom)          params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo)            params.set('dateTo', filters.dateTo)
    if (filters.msgType)           params.set('msgType', filters.msgType)
    if (filters.keyword)           params.set('keyword', filters.keyword)
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
    }
  }, [msgApi, loadStats, loadRecords, loadSyncStatus])

  function handleFiltersChange(f: Filters) {
    setFilters(f)
    setPage(1)
  }

  function handleSort(key: string, dir: 'asc' | 'desc') {
    setSortKey(key)
    setSortDir(dir)
    setPage(1)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: '24px' }}>
      {contextHolder}
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
            🎮 悠悠有品 · 转租收益记录
          </Typography.Title>

          <Space size={12} align="center">
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
              共 {stats?.total ?? '...'} 条记录
            </Typography.Text>

            {/* 手动同步按钮 */}
            <Tooltip title="从悠悠有品拉取最新消息，自动写入数据库">
              <Button
                type="primary"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleSync}
                size="small"
              >
                同步数据
              </Button>
            </Tooltip>
          </Space>
        </div>

        <StatsCards
          stats={stats}
          loading={statsLoading}
          filteredIncome={records?.filteredIncome ?? 0}
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
        />
      </div>
    </div>
  )
}
