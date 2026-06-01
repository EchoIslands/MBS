# 理发店在线预约系统

一个功能完整的理发店在线预约系统，支持顾客端和店铺端，提供实时预约、排队管理、员工管理等功能。

## ✨ 功能特性

### 顾客端
- 🔍 附近理发店搜索与展示
- 📅 在线预约服务（选择服务、日期、时间）
- 👤 发型师选择（最快匹配 / 指定选择）
- 📊 预约排队状态查看
- ⭐ 服务评价功能

### 店铺端
- 📈 店铺数据仪表盘
- 👥 员工管理（添加、编辑、状态管理）
- 📋 预约管理（查看、完成、取消）
- ⭐ 评价管理

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + Vite
- **状态管理**: Zustand
- **路由**: React Router DOM
- **样式**: Tailwind CSS 3
- **图标**: Lucide React
- **后端**: Express + TypeScript

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 仅启动前端
npm run client:dev

# 启动前后端（需要后端服务）
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 📁 项目结构

```
├── api/           # 后端 API
├── public/        # 静态资源
├── shared/        # 共享类型和模拟数据
│   ├── types.ts   # 类型定义
│   └── mockData.ts # 模拟数据
├── src/           # 前端源代码
│   ├── components/ # 通用组件
│   ├── hooks/      # 自定义 hooks
│   ├── lib/        # 工具函数
│   ├── pages/      # 页面组件
│   │   ├── customer/ # 顾客端页面
│   │   └── shop/     # 店铺端页面
│   ├── App.tsx     # 主应用组件
│   └── main.tsx    # 入口文件
└── ...            # 配置文件
```

## 🗂️ 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 角色选择 | 选择顾客或店铺身份 |
| `/customer` | 顾客首页 | 附近理发店列表 |
| `/customer/shop/:id` | 店铺详情 | 查看店铺信息 |
| `/customer/booking/:shopId` | 预约服务 | 选择服务和发型师 |
| `/customer/queue/:bookingId` | 排队状态 | 查看预约状态 |
| `/customer/review/:bookingId` | 服务评价 | 评价服务 |
| `/shop` | 店铺仪表盘 | 店铺管理首页 |
| `/shop/manage` | 店铺管理 | 员工和服务管理 |
| `/shop/reviews` | 评价管理 | 查看顾客评价 |

## 📝 使用说明

### 顾客登录
- 手机号: 13900000001
- 无需验证码，直接登录

### 店铺登录
- 选择任意店铺即可登录
- 密码: 123456

## 📄 部署文档

详细部署步骤请参考 [DEPLOYMENT.md](DEPLOYMENT.md)

## 📄 架构文档

项目架构说明请参考 [.trae/documents/arch.md](.trae/documents/arch.md)

## 📄 产品需求文档

产品需求说明请参考 [.trae/documents/prd.md](.trae/documents/prd.md)

## 📄 许可证

MIT License
