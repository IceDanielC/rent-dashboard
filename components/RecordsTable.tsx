'use client'
import { useState, useCallback } from 'react'
import { ProTable } from '@ant-design/pro-components'
import { Tag, Popconfirm, Button, Tooltip, Modal, Form, Input, Select, DatePicker, InputNumber } from 'antd'
import { DeleteOutlined, CopyOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Resizable } from 'react-resizable'
import type { ResizeCallbackData } from 'react-resizable'
import type { ProColumns } from '@ant-design/pro-components'
import type { SortOrder } from 'antd/es/table/interface'
import type { RentRecord, RecordsResponse } from '@/lib/types'
import 'react-resizable/css/styles.css'

const WEAR_COLOR: Record<string, string> = {
  '久经沙场': 'gold',
  '略有磨损': 'green',
  '战痕累累': 'red',
  '崭新出厂': 'blue',
  '轻微磨损': 'cyan',
}
interface Props {
  data: RecordsResponse | null
  loading: boolean
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string, dir: 'asc' | 'desc') => void
  page: number
  onPage: (p: number) => void
  soldWearValues: Set<string>
  onDelete: (id: number) => void
  onCopy: (record: RentRecord) => void
  onEdit: (id: number, values: Partial<RentRecord>) => Promise<void>
}

const STATIC_COLUMNS: ProColumns<RentRecord>[] = [
  { title: '时间',     dataIndex: 'msg_time',      sorter: true, width: 150, render: (val) => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{val as string}</span> },
{ title: '磨损等级', dataIndex: 'wear_level',    sorter: true, width: 110, render: (val) => <Tag color={WEAR_COLOR[val as string] ?? 'default'}>{val as string}</Tag> },
  { title: '磨损值',   dataIndex: 'wear_value',    sorter: true, width: 110, render: (val) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{(val as number)?.toFixed(6)}</span> },
  { title: '租金(元)', dataIndex: 'income',        sorter: true, width: 100, render: (val) => <span style={{ color: '#52c41a', fontWeight: 500 }}>¥{(val as number)?.toFixed(2)}</span> },
  { title: '到手(元)', dataIndex: 'actual_income', sorter: true, width: 100, render: (val) => <span style={{ color: '#faad14', fontWeight: 500 }}>¥{(val as number)?.toFixed(2)}</span> },
  { title: '天数',     dataIndex: 'lease_days',    sorter: true, width: 70,  align: 'center' },
]

function ResizableTitle(props: React.HTMLAttributes<HTMLElement> & { onResize: (e: React.SyntheticEvent, data: ResizeCallbackData) => void; width: number }) {
  const { onResize, width, ...restProps } = props
  if (!width) return <th {...restProps} />
  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', right: -5, bottom: 0, zIndex: 1, width: 10, height: '100%', cursor: 'col-resize' }}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} style={{ ...restProps.style, position: 'relative' }} />
    </Resizable>
  )
}

export default function RecordsTable({ data, loading, sortKey, sortDir, onSort, page, onPage, soldWearValues, onDelete, onCopy, onEdit }: Props) {
  const [editRecord, setEditRecord] = useState<RentRecord | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editForm] = Form.useForm()

  const openEdit = useCallback((record: RentRecord) => {
    setEditRecord(record)
    editForm.setFieldsValue({
      msg_time:     record.msg_time ? dayjs(record.msg_time) : null,
      item_name:    record.item_name,
      wear_level:   record.wear_level,
      wear_value:   record.wear_value,
      income:       record.income,
      lease_days:   record.lease_days,
      order_status: record.order_status,
    })
  }, [editForm])

  const handleEditSubmit = useCallback(async () => {
    if (!editRecord) return
    try {
      const values = await editForm.validateFields()
      setEditSubmitting(true)
      const income = parseFloat(values.income ?? '0') || 0
      await onEdit(editRecord.id, {
        ...values,
        msg_time: values.msg_time ? dayjs(values.msg_time).format('YYYY-MM-DD HH:mm:ss') : '',
        actual_income: parseFloat((income * 0.8).toFixed(2)),
      })
      setEditRecord(null)
    } catch {
      // validateFields 失败时不处理
    } finally {
      setEditSubmitting(false)
    }
  }, [editRecord, editForm, onEdit])
  const itemNameColumn: ProColumns<RentRecord> = {
    title: '饰品名称',
    dataIndex: 'item_name',
    sorter: true,
    width: 260,
    ellipsis: true,
    render: (val, record) => {
      const isSold = soldWearValues.has(record.wear_value.toFixed(6))
      return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Tooltip title={`订单号：${record.order_no}`} placement="topLeft">
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>{val as string}</span>
        </Tooltip>
          {isSold && <Tag color="blue" style={{ flexShrink: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px', marginLeft: -10 }}>已售出</Tag>}
        <Tooltip title="复制此条新增">
          <Button
            type="text"
            icon={<CopyOutlined />}
            size="small"
            style={{ flexShrink: 0, color: 'rgba(255,255,255,0.35)' }}
            onClick={e => { e.stopPropagation(); onCopy(record) }}
          />
        </Tooltip>
      </span>
      )
    },
  }

  const BASE_COLUMNS: ProColumns<RentRecord>[] = [
    STATIC_COLUMNS[0], // 时间
    STATIC_COLUMNS[1], // 类型
    itemNameColumn,
    ...STATIC_COLUMNS.slice(2), // 磨损等级之后
  ]

  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => ({
      ...Object.fromEntries(STATIC_COLUMNS.map(c => [c.dataIndex as string, c.width as number])),
      item_name: 260,
    })
  )

  const handleResize = useCallback((dataIndex: string) => (_: React.SyntheticEvent, { size }: ResizeCallbackData) => {
    setColWidths(prev => ({ ...prev, [dataIndex]: Math.max(size.width, 50) }))
  }, [])

  const getSortOrder = (key: string): SortOrder | undefined =>
    sortKey === key ? (sortDir === 'asc' ? 'ascend' : 'descend') : undefined

  const actionColumn: ProColumns<RentRecord> = {
    title: '操作',
    dataIndex: 'action',
    width: 100,
    fixed: 'right',
    render: (_, record) => (
      <span style={{ display: 'flex', gap: 2 }}>
        <Popconfirm
          title="确认删除这条记录？"
          onConfirm={() => onDelete(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
        <Tooltip title="编辑">
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            style={{ color: 'rgba(255,255,255,0.45)' }}
            onClick={() => openEdit(record)}
          />
        </Tooltip>
      </span>
    ),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: any[] = [
    ...BASE_COLUMNS.map(col => ({
      ...col,
      width: colWidths[col.dataIndex as string] ?? col.width,
      sortOrder: getSortOrder(col.dataIndex as string),
      onHeaderCell: (column: ProColumns<RentRecord>) => ({
        width: typeof column.width === 'number' ? column.width : undefined,
        onResize: handleResize(col.dataIndex as string),
      }),
    })),
    actionColumn,
  ]

  return (
    <>
    <ProTable<RentRecord>
      rowKey="id"
      dataSource={data?.records ?? []}
      columns={columns}
      loading={loading}
      search={false}
      options={false}
      cardBordered
      scroll={{ x: 'max-content' }}
      components={{ header: { cell: ResizableTitle } }}
      pagination={{
        current: page,
        pageSize: 20,
        total: data?.total ?? 0,
        showSizeChanger: false,
        showQuickJumper: true,
        showTotal: () => (
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            共 {data?.total ?? 0} 条 &nbsp;|&nbsp;
            租金合计 <span style={{ color: '#52c41a' }}>¥{(data?.filteredIncome ?? 0).toFixed(2)}</span>
            &nbsp;|&nbsp;
            到手合计 <span style={{ color: '#faad14' }}>¥{(data?.filteredActual ?? 0).toFixed(2)}</span>
          </span>
        ),
      }}
      onChange={(pagination, _, sorter) => {
        if (pagination.current) onPage(pagination.current)
        if (!Array.isArray(sorter) && sorter.field) {
          const dir = sorter.order === 'ascend' ? 'asc' : 'desc'
          onSort(sorter.field as string, dir)
        }
      }}
      locale={{ emptyText: '没有符合条件的记录' }}
    />

    <Modal
      title="编辑记录"
      open={!!editRecord}
      onOk={handleEditSubmit}
      onCancel={() => { setEditRecord(null); editForm.resetFields() }}
      confirmLoading={editSubmitting}
      okText="保存"
      cancelText="取消"
      width="min(520px, 95vw)"
    >
      <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="订单号">
          <Input value={editRecord?.order_no} disabled />
        </Form.Item>
        <Form.Item name="msg_time" label="消息时间" rules={[{ required: true, message: '请选择时间' }]}>
          <DatePicker showTime style={{ width: '100%' }} />
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
    </>
  )
}
