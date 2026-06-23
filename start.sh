#!/bin/bash

# 进入 better-sqlite3 目录并构建
cd /home/rent-dashboard/node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3
pnpm run build-release

# 进入项目目录并构建
cd /home/rent-dashboard
pnpm run build

# 启动项目
pm2 stop all
pm2 delete all
PORT=3001 pm2 start pnpm --name rent-dashboard -- start
pm2 save