# 理发店在线预约系统

> **接手入口（2026-11-09）**：先看 [文档导航与维护约定](docs/README.md) 和 [当前工作现场](docs/current-state.md)。下方早期功能/路由清单仅作初始项目说明；当前能力、上线情况请按现场与代码核对，尤其排队试运行第一阶段尚未发布。

理发店顾客 H5/微信小程序与门店 H5 项目，包含预约、员工、收银等模块。功能是否已经发布或验收，请以[当前工作现场](docs/current-state.md)和相应专项记录为准。

## ✨ 初始功能目标（以现行状态为准）

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
├── api/           # Vercel 单一函数入口
├── backend/       # 后端应用、路由及工具模块
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

## 🗂️ 早期页面路由示例（具体以 src/App.tsx 为准）

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
- 顾客使用门店已建档的手机号及六位数字密码登录；短信验证码是可选通道，启用状态和操作步骤见 docs/customer-sms-login.md。
- 上线后不得使用本文件历史示例账号作为真实凭据。

### 店铺登录
- 使用门店分配的员工账号与密码，按角色登录；不提供通用生产密码。

## 📄 部署文档

现行发布与恢复核对见 [DEPLOYMENT.md](DEPLOYMENT.md)；初期通用示例已另行归档。

## 📄 架构文档

初始架构资料见 [.trae/documents/arch.md](.trae/documents/arch.md)，实际接口及数据库结构需以现行代码、迁移和生产只读核对为准。

## 📄 产品需求文档

初始产品设想见 [.trae/documents/prd.md](.trae/documents/prd.md)；已确定规则与当前状态请看文档导航。

## 📄 许可证

MIT License
