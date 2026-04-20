'use client'
import { useState, useCallback } from 'react'
import { ProTable } from '@ant-design/pro-components'
import { Tag, Popconfirm, Button } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
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
const TYPE_COLOR: Record<string, string> = {
  '转租成功': 'purple',
  '自动确认归还成功': 'green',
}

interface Props {
  data: RecordsResponse | null
  loading: boolean
  sortKey: string
  sortDir: 'asc' | 'desc'
  onSort: (key: string, dir: 'asc' | 'desc') => void
  page: number
  onPage: (p: number) => void
  onDelete: (id: number) => void
}

const BASE_COLUMNS: ProColumns<RentRecord>[] = [
  { title: '时间',     dataIndex: 'msg_time',      sorter: true, width: 150, render: (val) => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{val as string}</span> },
  { title: '类型',     dataIndex: 'msg_type',      sorter: true, width: 160, render: (val) => <Tag color={TYPE_COLOR[val as string] ?? 'default'}>{val as string}</Tag> },
  { title: '饰品名称', dataIndex: 'item_name',     sorter: true, width: 260, ellipsis: true },
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

export default function RecordsTable({ data, loading, sortKey, sortDir, onSort, page, onPage, onDelete }: Props) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => Object.fromEntries(BASE_COLUMNS.map(c => [c.dataIndex as string, c.width as number]))
  )

  const handleResize = useCallback((dataIndex: string) => (_: React.SyntheticEvent, { size }: ResizeCallbackData) => {
    setColWidths(prev => ({ ...prev, [dataIndex]: Math.max(size.width, 50) }))
  }, [])

  const getSortOrder = (key: string): SortOrder | undefined =>
    sortKey === key ? (sortDir === 'asc' ? 'ascend' : 'descend') : undefined

  const actionColumn: ProColumns<RentRecord> = {
    title: '操作',
    dataIndex: 'action',
    width: 70,
    fixed: 'right',
    render: (_, record) => (
      <Popconfirm
        title="确认删除这条记录？"
        onConfirm={() => onDelete(record.id)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
      </Popconfirm>
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
  )
}
