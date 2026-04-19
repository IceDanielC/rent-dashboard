'use client'
import { StatisticCard } from '@ant-design/pro-components'
import { RiseOutlined, DollarOutlined, WalletOutlined, BarChartOutlined } from '@ant-design/icons'
import type { Stats } from '@/lib/types'

interface Props {
  stats: Stats | null
  loading: boolean
  filteredIncome: number
  filteredActual: number
  filteredCount: number
}

export default function StatsCards({ stats, loading, filteredIncome, filteredActual, filteredCount }: Props) {
  const avgIncome = filteredCount > 0
    ? filteredIncome / filteredCount
    : (stats?.avg_income ?? 0)

  return (
    <StatisticCard.Group loading={loading} style={{ marginBottom: 16 }}>
      <StatisticCard
        statistic={{
          title: '总记录数',
          value: stats?.total ?? 0,
          suffix: '条',
          description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 {filteredCount} 条</span>,
          icon: <BarChartOutlined style={{ color: '#1677ff', fontSize: 28, background: 'rgba(22,119,255,0.1)', padding: 8, borderRadius: 8 }} />,
        }}
      />
      <StatisticCard
        statistic={{
          title: '总租金收入',
          value: stats?.total_income?.toFixed(2) ?? '0.00',
          prefix: '¥',
          valueStyle: { color: '#52c41a' },
          description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 ¥{filteredIncome.toFixed(2)}</span>,
          icon: <RiseOutlined style={{ color: '#52c41a', fontSize: 28, background: 'rgba(82,196,26,0.1)', padding: 8, borderRadius: 8 }} />,
        }}
      />
      <StatisticCard
        statistic={{
          title: '总实际到手',
          value: stats?.total_actual?.toFixed(2) ?? '0.00',
          prefix: '¥',
          valueStyle: { color: '#faad14' },
          description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>筛选后 ¥{filteredActual.toFixed(2)}</span>,
          icon: <WalletOutlined style={{ color: '#faad14', fontSize: 28, background: 'rgba(250,173,20,0.1)', padding: 8, borderRadius: 8 }} />,
        }}
      />
      <StatisticCard
        statistic={{
          title: '平均单笔租金',
          value: avgIncome.toFixed(2),
          prefix: '¥',
          valueStyle: { color: '#1677ff' },
          description: <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>基于筛选结果</span>,
          icon: <DollarOutlined style={{ color: '#1677ff', fontSize: 28, background: 'rgba(22,119,255,0.1)', padding: 8, borderRadius: 8 }} />,
        }}
      />
    </StatisticCard.Group>
  )
}
