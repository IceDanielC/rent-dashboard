export interface RentRecord {
  id: number
  msg_time: string
  msg_type: string
  order_no: string
  item_name: string
  wear_level: string
  wear_value: number
  income: number
  actual_income: number
  lease_days: number
  order_status: string
}

export interface Stats {
  total: number
  total_income: number
  total_actual: number
  avg_income: number
  trend: TrendItem[]
  wear_dist: WearItem[]
  type_dist: TypeItem[]
}

export interface TrendItem {
  date: string
  income: number
  actual_income: number
  count: number
}

export interface WearItem {
  wear_level: string
  count: number
  income: number
}

export interface TypeItem {
  msg_type: string
  count: number
  income: number
}

export interface RecordsResponse {
  records: RentRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  filteredIncome: number
  filteredActual: number
}

export interface RecordsQuery {
  dateFrom?: string
  dateTo?: string
  msgType?: string
  keyword?: string
  wearLevel?: string   // 逗号分隔多选
  orderStatus?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
