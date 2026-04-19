'use client'
import { Form, Select, Input, Button, DatePicker, Checkbox, InputNumber, Space } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { ProCard } from '@ant-design/pro-components'
import dayjs from 'dayjs'

export interface Filters {
  dateFrom: string
  dateTo: string
  msgType: string
  keyword: string
  wearLevels: string[]
  wearValueMin: string
  wearValueMax: string
  orderStatus: string
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  onReset: () => void
}

const WEAR_LEVELS = ['久经沙场', '略有磨损', '战痕累累', '崭新出厂', '轻微磨损']

export default function FilterBar({ filters, onChange, onReset }: Props) {
  const [form] = Form.useForm()

  function handleValuesChange(_: unknown, all: Record<string, unknown>) {
    const dateRange = all.dateRange as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
    onChange({
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD') ?? '',
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD') ?? '',
      msgType: (all.msgType as string) ?? '',
      keyword: (all.keyword as string) ?? '',
      wearLevels: (all.wearLevels as string[]) ?? [],
      wearValueMin: all.wearValueMin != null ? String(all.wearValueMin) : '',
      wearValueMax: all.wearValueMax != null ? String(all.wearValueMax) : '',
      orderStatus: (all.orderStatus as string) ?? '',
    })
  }

  function handleReset() {
    form.resetFields()
    onReset()
  }

  // Sync form fields from external filters (e.g. programmatic reset)
  const dateRangeValue: [dayjs.Dayjs, dayjs.Dayjs] | null =
    filters.dateFrom && filters.dateTo
      ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)]
      : null

  return (
    <ProCard
      title="筛选条件"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>
          重置
        </Button>
      }
      style={{ marginBottom: 16 }}
      bodyStyle={{ paddingBottom: 8 }}
    >
      <Form
        form={form}
        layout="inline"
        onValuesChange={handleValuesChange}
        initialValues={{
          dateRange: dateRangeValue,
          msgType: filters.msgType || undefined,
          keyword: filters.keyword,
          wearLevels: filters.wearLevels,
          wearValueMin: filters.wearValueMin ? parseFloat(filters.wearValueMin) : undefined,
          wearValueMax: filters.wearValueMax ? parseFloat(filters.wearValueMax) : undefined,
          orderStatus: filters.orderStatus || undefined,
        }}
        style={{ gap: 8, rowGap: 12, flexWrap: 'wrap' }}
      >
        <Form.Item name="dateRange" label="时间范围" style={{ marginBottom: 8 }}>
          <DatePicker.RangePicker
            format="YYYY-MM-DD"
            placeholder={['开始日期', '结束日期']}
            allowClear
            style={{ width: 240 }}
          />
        </Form.Item>

        <Form.Item name="msgType" label="消息类型" style={{ marginBottom: 8 }}>
          <Select
            placeholder="全部"
            allowClear
            style={{ width: 160 }}
            options={[
              { label: '转租成功', value: '转租成功' },
              { label: '自动确认归还成功', value: '自动确认归还成功' },
            ]}
          />
        </Form.Item>

        <Form.Item name="keyword" label="饰品名称" style={{ marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
            placeholder="输入关键词"
            allowClear
            style={{ width: 200 }}
          />
        </Form.Item>

        <Form.Item name="wearLevels" label="磨损等级" style={{ marginBottom: 8 }}>
          <Checkbox.Group options={WEAR_LEVELS} />
        </Form.Item>

        <Form.Item label="磨损值范围" style={{ marginBottom: 8 }}>
          <Space.Compact>
            <Form.Item name="wearValueMin" noStyle>
              <InputNumber
                placeholder="最小值"
                min={0}
                max={1}
                step={0.01}
                precision={6}
                style={{ width: 120 }}
              />
            </Form.Item>
            <span style={{ padding: '0 8px', lineHeight: '32px', color: 'rgba(255,255,255,0.3)' }}>~</span>
            <Form.Item name="wearValueMax" noStyle>
              <InputNumber
                placeholder="最大值"
                min={0}
                max={1}
                step={0.01}
                precision={6}
                style={{ width: 120 }}
              />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
      </Form>
    </ProCard>
  )
}
