'use client'
import { StatisticCard } from '@ant-design/pro-components'
import { RiseOutlined, CalendarOutlined, WalletOutlined, BarChartOutlined } from '@ant-design/icons'
import type { Stats } from '@/lib/types'

interface Props {
  stats: Stats | null
  loading: boolean
  filteredIncome: number
  filteredActual: number
  filteredCount: number
}

const cardStyle = { flex: '1 1 160px', minWidth: 0 }

export default function StatsCards({ stats, loading, filteredIncome, filteredActual, filteredCount }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      <div style={cardStyle}>
        <StatisticCard
          loading={loading}
          statistic={{
            title: '总记录数',
            value: stats?.total ?? 0,
            suffix: '条',
            description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 {filteredCount} 条</span>,
            icon: <BarChartOutlined style={{ color: '#1677ff', fontSize: 28, background: 'rgba(22,119,255,0.1)', padding: 8, borderRadius: 8 }} />,
          }}
        />
      </div>
      <div style={cardStyle}>
        <StatisticCard
          loading={loading}
          statistic={{
            title: '总租金收入',
            value: stats?.total_income?.toFixed(2) ?? '0.00',
            prefix: '¥',
            valueStyle: { color: '#52c41a' },
            description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 ¥{filteredIncome.toFixed(2)}</span>,
            icon: <RiseOutlined style={{ color: '#52c41a', fontSize: 28, background: 'rgba(82,196,26,0.1)', padding: 8, borderRadius: 8 }} />,
          }}
        />
      </div>
      <div style={cardStyle}>
        <StatisticCard
          loading={loading}
          statistic={{
            title: '总实际到手',
            value: stats?.total_actual?.toFixed(2) ?? '0.00',
            prefix: '¥',
            valueStyle: { color: '#faad14' },
            description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 ¥{filteredActual.toFixed(2)}</span>,
            icon: <WalletOutlined style={{ color: '#faad14', fontSize: 28, background: 'rgba(250,173,20,0.1)', padding: 8, borderRadius: 8 }} />,
          }}
        />
      </div>
      <div style={cardStyle}>
        <StatisticCard
          loading={loading}
          statistic={{
            title: '今日租赁收入',
            value: (stats?.today_actual ?? 0).toFixed(2),
            prefix: '¥',
            valueStyle: { color: '#1677ff' },
            description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>当日到手租金合计</span>,
            icon: <CalendarOutlined style={{ color: '#1677ff', fontSize: 28, background: 'rgba(22,119,255,0.1)', padding: 8, borderRadius: 8 }} />,
          }}
        />
      </div>
    </div>
  )
}
