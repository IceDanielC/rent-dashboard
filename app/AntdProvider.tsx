'use client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgContainer: '#1f1f1f',
          colorBgElevated: '#2a2a2a',
          colorBgLayout: '#141414',
          colorBorder: '#303030',
          borderRadius: 8,
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}
