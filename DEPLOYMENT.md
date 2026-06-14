# 理发店预约系统 - 部署指南

## 🌐 推荐部署方案

我们推荐使用 **Vercel**（免费）来部署整个应用，Vercel 支持同时托管前端和后端。

---

## 📋 方案一：Vercel 一键部署（免费，最简单）

### 前置准备

1. **GitHub/GitLab 账号**（用于托管代码）
2. **Vercel 账号**（免费注册）

### 详细部署步骤

#### 第一步：准备代码仓库

1. 在 GitHub/GitLab 创建一个新仓库
2. 将代码推送到仓库

```bash
# 如果还没有初始化 Git
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

#### 第二步：使用 Vercel 部署

1. 访问 [Vercel 官网](https://vercel.com) 并登录
2. 点击 **"New Project"**
3. 选择你刚才创建的 GitHub 仓库
4. **项目配置**（按以下设置）：
   - **Project Name**: `barbershop-booking` (或你喜欢的名字)
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. 点击 **"Deploy"** 开始部署

#### 第三步：环境配置（可选）

项目已经配置好了 Vercel 的 serverless 部署，无需额外配置环境变量。

---

## 📋 方案二：前端 + 后端分离部署（更灵活）

### 前端部署：Vercel

1. 同上，使用 Vercel 部署前端
2. 部署完成后会得到一个域名，如 `https://barbershop.vercel.app`

### 后端部署：Railway（免费额度）

1. 访问 [Railway](https://railway.app)
2. 使用 GitHub 账号登录
3. 点击 **"New Project"** → **"Empty Project"**
4. 在项目中添加服务：点击 **"Add a Service"** → **"GitHub Repo"**
5. 选择你的仓库
6. **配置服务**：
   - **Root Directory**: `./`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server:dev` （生产使用 `node api/server.js`）
   - 添加环境变量：`PORT=3001`
7. 点击部署
8. 部署完成后会得到一个后端地址

### 配置前端 API 地址

修改 `src/api.ts`，将 API 地址指向你的后端地址

---

## 🔧 项目部署文件说明

### 已有的部署配置文件

#### 1. `vercel.json`
配置了 Vercel 的路由重写：
- `/api/*` 路由指向后端
- 其他路由指向前端 SPA

#### 2. `api/index.ts`
Vercel Serverless Function 入口文件

#### 3. `package.json`
- `build`: 构建前端
- `server:dev`: 启动后端开发服务器

---

## 🚀 快速部署（使用 Vercel 自动部署）

### 最简单的方式：

1. **Fork 或 Push 代码到 GitHub**
2. **访问 Vercel 并导入项目**
3. **等待部署完成**

就是这么简单！Vercel 会自动：
- 检测到这是 Vite 项目
- 自动构建前端
- 自动部署 Serverless 函数（API）

---

## 📱 部署完成后

访问你的 Vercel 分配的域名即可：

- 顾客端：选择「我是顾客」
- 理发店端：选择「我是理发店」，使用密码 `123456` 登录

---

## 💡 常见问题

### 1. 部署后 API 调用失败？

检查：
- 确保 `api/index.ts` 存在
- 检查 `vercel.json` 配置正确

### 2. 如何绑定自定义域名？

Vercel 支持绑定自定义域名，在项目设置中添加即可。

### 3. 数据持久化问题？

当前版本使用内存数据，重启服务会清空。可以接入数据库如：
- **Supabase**（PostgreSQL）
- **MongoDB Atlas**
- **Prisma**（ORM）

### 4. 费用如何？

- Vercel Hobby 计划：完全免费
- Railway Hobby 计划：有免费额度，超出部分按量付费

---

## 🎯 推荐部署路线图

### 第一阶段：MVP 部署（当前方案）
✅ Vercel 部署
✅ 模拟数据运行
✅ 完整功能验证

### 第二阶段：数据库接入（可选）
- 接入 Supabase 或其他数据库
- 数据持久化

### 第三阶段：生产优化
- 添加 Analytics
- 添加 Sentry 错误监控
- 添加 CDN 加速

---

需要帮助部署吗？让我知道！
