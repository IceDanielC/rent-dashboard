import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(process.cwd(), 'data', 'rent.db')
const CSV_PATH = path.join(process.cwd(), 'data', 'rent_records.csv')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  initDb(_db)
  return _db
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      msg_time      TEXT,
      msg_type      TEXT,
      order_no      TEXT UNIQUE,
      item_name     TEXT,
      wear_level    TEXT,
      wear_value    REAL,
      income        REAL,
      actual_income REAL,
      lease_days    INTEGER,
      order_status  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msg_time    ON records(msg_time);
    CREATE INDEX IF NOT EXISTS idx_msg_type    ON records(msg_type);
    CREATE INDEX IF NOT EXISTS idx_wear_level  ON records(wear_level);
    CREATE INDEX IF NOT EXISTS idx_order_status ON records(order_status);
    CREATE INDEX IF NOT EXISTS idx_item_name   ON records(item_name);
  `)

  // 检查是否已有数据
  const count = (db.prepare('SELECT COUNT(*) as c FROM records').get() as { c: number }).c
  if (count > 0) return

  // 从 CSV 导入
  if (!fs.existsSync(CSV_PATH)) {
    console.warn('CSV 文件不存在:', CSV_PATH)
    return
  }

  const text = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, '')
  const lines = text.trim().split('\n')
  if (lines.length < 2) return

  const insert = db.prepare(`
    INSERT OR IGNORE INTO records
      (msg_time, msg_type, order_no, item_name, wear_level, wear_value, income, actual_income, lease_days, order_status)
    VALUES
      (@msg_time, @msg_type, @order_no, @item_name, @wear_level, @wear_value, @income, @actual_income, @lease_days, @order_status)
  `)

  const insertMany = db.transaction((rows: object[]) => {
    for (const row of rows) insert.run(row)
  })

  const rows = lines.slice(1).map(line => {
    const cols = parseCsvLine(line)
    return {
      msg_time:      cols[0] ?? '',
      msg_type:      cols[1] ?? '',
      order_no:      cols[2] ?? '',
      item_name:     cols[3] ?? '',
      wear_level:    cols[4] ?? '',
      wear_value:    parseFloat(cols[5] ?? '0') || 0,
      income:        parseFloat(cols[6] ?? '0') || 0,
      actual_income: parseFloat(cols[7] ?? '0') || 0,
      lease_days:    parseInt(cols[8] ?? '0') || 0,
      order_status:  cols[9] ?? '',
    }
  }).filter(r => r.order_no)

  insertMany(rows)
  console.log(`✓ 从 CSV 导入 ${rows.length} 条记录`)
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ }
    else if (line[i] === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
    else { cur += line[i] }
  }
  cols.push(cur.trim())
  return cols
}
