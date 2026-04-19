import type { Metadata } from "next";
import "./globals.css";
import AntdProvider from "./AntdProvider";

export const metadata: Metadata = {
  title: "转租收益记录",
  description: "悠悠有品转租收益可视化",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}
