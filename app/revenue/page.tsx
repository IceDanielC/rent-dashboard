'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Typography, Button, Space, Modal, Form, Input,
  InputNumber, DatePicker, Popconfirm, message,
} from 'antd'
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import Link from 'next/link'
import dayjs from 'dayjs'

interface Asset {
  id: number
  item_name: string
  wear_value: number
  buy_time: string
  buy_price: number
  sell_price: number
  rent_income: number
}

export default function RevenuePage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const [msgApi, contextHolder] = message.useMessage()

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/assets')
      const data = await res.json()
      if (data.ok) setAssets(data.assets)
      else msgApi.error(data.error ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }, [msgApi])

  useEffect(() => { loadAssets() }, [loadAssets])

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        buy_time: dayjs(values.buy_time).format('YYYY-MM-DD'),
        wear_value: values.wear_value ?? 0,
      }
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        msgApi.success('添加成功')
        setModalOpen(false)
        form.resetFields()
        loadAssets()
      } else {
        msgApi.error(data.error ?? '添加失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }, [form, msgApi, loadAssets])

  const handleDelete = useCallback(async (id: number) => {
    const res = await fetch(`/api/assets?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      msgApi.success('已删除')
      loadAssets()
    } else {
      msgApi.error(data.error ?? '删除失败')
    }
  }, [msgApi, loadAssets])

  // 汇总
  const totalBuy    = assets.reduce((s, a) => s + a.buy_price, 0)
  const totalSell   = assets.reduce((s, a) => s + a.sell_price, 0)
  const totalRent   = assets.reduce((s, a) => s + a.rent_income, 0)
  // 综合收益 = 出售金额 + 出租收益 - 购买金额
  const totalProfit = totalSell + totalRent - totalBuy

  const columns: ProColumns<Asset>[] = [
    {
      title: '饰品名称',
      dataIndex: 'item_name',
      ellipsis: true,
      width: 280,
    },
    {
      title: '磨损值',
      dataIndex: 'wear_value',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {r.wear_value.toFixed(6)}
        </span>
      ),
    },
    {
      title: '购买时间',
      dataIndex: 'buy_time',
      width: 120,
      sorter: (a, b) => a.buy_time.localeCompare(b.buy_time),
      render: (_, r) => (
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{r.buy_time}</span>
      ),
    },
    {
      title: '购买金额',
      dataIndex: 'buy_price',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.buy_price - b.buy_price,
      render: (_, r) => (
        <span style={{ color: '#ff4d4f', fontWeight: 500 }}>¥{r.buy_price.toFixed(2)}</span>
      ),
    },
    {
      title: '出售金额',
      dataIndex: 'sell_price',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.sell_price - b.sell_price,
      render: (_, r) => (
        r.sell_price > 0
          ? <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>¥{r.sell_price.toFixed(2)}</span>
          : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
      ),
    },
    {
      title: '出租收益',
      dataIndex: 'rent_income',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.rent_income - b.rent_income,
      render: (_, r) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{r.rent_income.toFixed(2)}</span>
      ),
    },
    {
      title: '综合收益',
      dataIndex: 'profit',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.sell_price + a.rent_income - a.buy_price) - (b.sell_price + b.rent_income - b.buy_price),
      render: (_, r) => {
        const profit = r.sell_price + r.rent_income - r.buy_price
        const color = profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return (
          <span style={{ color, fontWeight: 500 }}>
            {profit > 0 ? '+' : ''}{profit.toFixed(2)}
          </span>
        )
      },
    },
    {
      title: '收益率',
      dataIndex: 'rate',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.sell_price + a.rent_income - a.buy_price) / a.buy_price - (b.sell_price + b.rent_income - b.buy_price) / b.buy_price,
      render: (_, r) => {
        if (r.buy_price === 0) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
        const rate = ((r.sell_price + r.rent_income - r.buy_price) / r.buy_price) * 100
        const color = rate > 0 ? '#52c41a' : rate < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)'
        return <span style={{ color }}>{rate > 0 ? '+' : ''}{rate.toFixed(2)}%</span>
      },
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 70,
      fixed: 'right',
      render: (_, r) => (
        <Popconfirm
          title="确认删除这条记录？"
          onConfirm={() => handleDelete(r.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#141414', padding: '24px' }}>
      {contextHolder}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Space size={12} align="center">
            <Link href="/">
              <Button type="text" icon={<ArrowLeftOutlined />} size="small" style={{ color: 'rgba(255,255,255,0.45)' }} />
            </Link>
            <Typography.Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
              💰 饰品收益统计
            </Typography.Title>
          </Space>
          <Space size={8}>
            <Button icon={<ReloadOutlined />} size="small" onClick={loadAssets} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setModalOpen(true)}>
              添加饰品
            </Button>
          </Space>
        </div>

        {/* 汇总卡片 */}
        <StatisticCard.Group style={{ marginBottom: 20 }} loading={loading && assets.length === 0}>
          <StatisticCard
            statistic={{
              title: '持有饰品数',
              value: assets.length,
              suffix: '件',
              valueStyle: { color: '#1677ff' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总购买金额',
              value: totalBuy.toFixed(2),
              prefix: '¥',
              valueStyle: { color: '#ff4d4f' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总出售金额',
              value: totalSell.toFixed(2),
              prefix: '¥',
              valueStyle: { color: 'rgba(255,255,255,0.85)' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '总出租收益',
              value: totalRent.toFixed(2),
              prefix: '¥',
              valueStyle: { color: '#52c41a' },
            }}
          />
          <StatisticCard
            statistic={{
              title: '综合收益',
              value: (totalProfit > 0 ? '+' : '') + totalProfit.toFixed(2),
              prefix: '¥',
              valueStyle: { color: totalProfit > 0 ? '#52c41a' : totalProfit < 0 ? '#ff4d4f' : 'rgba(255,255,255,0.45)' },
            }}
          />
        </StatisticCard.Group>

        {/* 表格 */}
        <ProTable<Asset>
          rowKey="id"
          dataSource={assets}
          columns={columns}
          loading={loading}
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
                共 {total} 件 &nbsp;|&nbsp;
                总购买 <span style={{ color: '#ff4d4f' }}>¥{totalBuy.toFixed(2)}</span>
                &nbsp;|&nbsp;
                总出租 <span style={{ color: '#52c41a' }}>¥{totalRent.toFixed(2)}</span>
                &nbsp;|&nbsp;
                综合收益 <span style={{ color: totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}>
                  {totalProfit > 0 ? '+' : ''}¥{totalProfit.toFixed(2)}
                </span>
              </span>
            ),
          }}
          locale={{ emptyText: '暂无数据，点击「添加饰品」开始记录' }}
        />
      </div>

      {/* 新增弹窗 */}
      <Modal
        title="添加饰品"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        confirmLoading={submitting}
        okText="确认添加"
        cancelText="取消"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="item_name" label="饰品名称" rules={[{ required: true, message: '请输入饰品名称' }]}>
            <Input placeholder="如：爪子刀（★） | 狩猎网格 (久经沙场)" />
          </Form.Item>
          <Form.Item
            name="wear_value"
            label="磨损值"
            tooltip="需与转租记录中的磨损值完全一致，系统将自动关联该磨损值下的所有出租收益"
            rules={[{ required: true, message: '请输入磨损值' }]}
          >
            <InputNumber
              min={0} max={1} step={0.000001}
              style={{ width: '100%' }}
              placeholder="如：0.234567"
              stringMode
            />
          </Form.Item>
          <Form.Item name="buy_time" label="购买时间" rules={[{ required: true, message: '请选择购买时间' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="buy_price" label="购买金额" rules={[{ required: true, message: '请输入购买金额' }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" prefix="¥" />
          </Form.Item>
          <Form.Item name="sell_price" label="出售金额" tooltip="未出售可留空，默认为 0">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" prefix="¥" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
