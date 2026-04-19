'use client'
import { ProCard } from '@ant-design/pro-components'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Line, ComposedChart,
} from 'recharts'
import type { TrendItem } from '@/lib/types'

interface Props { trend: TrendItem[] }

export default function IncomeChart({ trend }: Props) {
  if (!trend.length) return null

  const data = trend.map(t => ({
    date: t.date.slice(5),
    租金收入: +t.income.toFixed(2),
    实际到手: +t.actual_income.toFixed(2),
    笔数: t.count,
  }))

  return (
    <ProCard title="每日收益趋势" style={{ marginBottom: 16 }}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `¥${v}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#1f1f1f',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.85)',
              fontSize: 12,
            }}
            formatter={(v, name) => [name === '笔数' ? `${v} 笔` : `¥${v}`, name as string]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }} />
          <Bar yAxisId="left" dataKey="租金收入" fill="#52c41a" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="left" dataKey="实际到手" fill="#faad14" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="笔数"
            stroke="#1677ff"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ProCard>
  )
}
