'use client'
import { useState } from 'react'
import { ProCard } from '@ant-design/pro-components'
import { Button, Space } from 'antd'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Line, ComposedChart, Brush,
} from 'recharts'
import type { TrendItem } from '@/lib/types'

interface Props { trend: TrendItem[] }

const PRESETS = [
  { label: '近7天', days: 7 },
  { label: '近30天', days: 30 },
  { label: '近90天', days: 90 },
  { label: '全部', days: 0 },
]

export default function IncomeChart({ trend }: Props) {
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null)

  if (!trend.length) return null

  const data = trend.map(t => ({
    date: t.date.slice(5),
    租金收入: +t.income.toFixed(2),
    实际到手: +t.actual_income.toFixed(2),
    笔数: t.count,
  }))

  const total = data.length
  const startIndex = brushRange?.startIndex ?? Math.max(0, total - 30)
  const endIndex = brushRange?.endIndex ?? total - 1

  function applyPreset(days: number) {
    if (days === 0) {
      setBrushRange({ startIndex: 0, endIndex: total - 1 })
    } else {
      setBrushRange({ startIndex: Math.max(0, total - days), endIndex: total - 1 })
    }
  }

  return (
    <ProCard
      title="每日收益趋势"
      style={{ marginBottom: 16 }}
      extra={
        <Space size={4}>
          {PRESETS.map(p => (
            <Button
              key={p.label}
              size="small"
              type={
                p.days === 0
                  ? (startIndex === 0 && endIndex === total - 1 ? 'primary' : 'text')
                  : (startIndex === Math.max(0, total - p.days) && endIndex === total - 1 && p.days !== 0 ? 'primary' : 'text')
              }
              onClick={() => applyPreset(p.days)}
              style={{ fontSize: 12, padding: '0 8px' }}
            >
              {p.label}
            </Button>
          ))}
        </Space>
      }
    >
      <ResponsiveContainer width="100%" height={260}>
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
          <Brush
            dataKey="date"
            startIndex={startIndex}
            endIndex={endIndex}
            height={24}
            stroke="rgba(255,255,255,0.15)"
            fill="rgba(255,255,255,0.04)"
            travellerWidth={6}
            onChange={({ startIndex: s, endIndex: e }) => {
              if (s !== undefined && e !== undefined) {
                setBrushRange({ startIndex: s, endIndex: e })
              }
            }}
            tickFormatter={() => ''}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ProCard>
  )
}
