# MBS 项目开发宪章

> 本文档是 MBS 项目的最高开发规范。它集开发任务书、问题避免清单、踩坑记录、沟通协议、范围管理、技术债务治理于一体。所有参与者（包括 AI 助手）在改动代码前，必须先阅读并遵守本章节的规范。
>
> **远期愿景**：本宪章不仅是 MBS 项目的内部规范，也在逐步沉淀为一套可复用的「AI 智能体协作开发白皮书」——如何让人类与 AI Agent 高效协作、如何控制范围与质量、如何把踩过的坑变成团队资产。宪章中的工作流、协作协议、治理机制，未来可直接迁移到任何 AI 辅助开发的项目中。
>
> **当前宪章版本：v2.6 | 生效日期：2026-07-17**

---

# 第一卷：宪章总纲

## 1.1 宪章宗旨

本宪章旨在把 MBS 项目开发过程中踩过的坑、验证过的流程、隐性约束和协作规则显性化，使之成为项目知识资产。其最终目标是：让任何开发者（包括 AI 助手）在接到任务后，能按统一标准完成开发、验证、部署与交接，减少重复踩坑，降低线上故障率。

**远期定位**：随着 AI 智能体越来越多地参与软件开发，本宪章同时也是一份「人类与 AI 智能体协作开发白皮书」的雏形。它沉淀的不仅是 MBS 项目的经验，更是一套可迁移的方法论——如何给 Agent 下达清晰的指令、如何划定 Agent 的权责边界、如何建立质量门禁、如何让 Agent 从错误中学习而不重复踩坑。未来这些方法论可以独立于 MBS 项目，应用到任何 AI 辅助开发的场景中。

## 1.2 适用对象

- 所有参与 MBS 项目的开发者、代码审查者、项目维护者；
- 与 MBS 项目协作的 AI 助手 / Agent；
- 新加入成员及未来接手项目的人员。

凡改动 MBS 代码、配置、数据库 Schema、部署设置前，均视为已阅读并同意遵守本宪章。

## 1.3 核心原则（铁律）

1. **改动必验证**：任何代码改动完成后，必须依次执行本地构建、本地后端启动、浏览器 Network 检查三步验证。任何一步不通过，禁止直接 push。
   - **本地构建必须使用 `npm run build`**，而不能只跑 `npm run check`。原因：`tsc --noEmit` 只能发现类型错误，无法发现 Vite 生产构建错误（如 Babel 作用域冲突、组件名与类型重名等）。本次 `Booking.tsx` 的 `Duplicate declaration` 错误就是只跑 check 没跑 build 导致的。
   - **push 前最后一次验证必须是 `npm run build`**，构建成功后才能推送到 GitHub。
2. **线上必实测**：本地正常不等于线上正常。Vercel 部署后必须实测登录、添加数据、查看数据等核心流程，尤其要实测 POST/PUT 请求体是否正确解析、字段是否正确入库。
3. **数据必显式**：写数据库前必须显式字段映射并过滤非法 key，禁止直接把整个对象 `toSnakeCase()` 后塞入数据库。
4. **需求必落地**：任何新需求（新增字段、新页面、新角色权限）必须先落到任务书/计划书，定义验收标准并评估影响范围后再动手。
5. **问题必记录**：踩过的坑、临时方案、隐性约束必须补充到本宪章对应章节，避免团队重复踩坑。
6. **UI 三端一致**：网页端、公众号 H5、微信小程序面向顾客的可视元素（颜色、字体、按钮、卡片、图标、布局、状态徽章、空状态）必须统一。任何一端的界面调整，必须同步评估并改造另外两端，禁止各自为政。设计 Token、通用图标、页面结构应以 H5 顾客端为基准，小程序通过 CSS 变量与通用组件复刻。

## 1.4 快速索引

### 按关键词导航

| 关键词 | 导航 |
|--------|------|
| 部署报错 / Vercel 500 / API 500 | 3.7 部署与运维、3.14.7 Vercel Runtime 请求体解析 |
| 新增字段 / 改数据库 | 2.3 常规迭代任务标准工作流、3.11 Supabase 数据库、4.1 需求变更管理 |
| 编码乱码 / 中文变问号 | 3.1 环境与编码、3.14.2 编码与中文破坏 |
| 请求体丢失 / Payload 正确但后端收不到 | 3.7 部署与运维、3.14.6 HTTP 请求头合并、3.14.7 Vercel Runtime 请求体解析 |
| 数据写不进去 / RLS | 3.11 Supabase 数据库、3.14.3 数据库 RLS 策略 |
| 状态丢失 / 刷新后登录失效 | 3.3 状态管理 |
| TypeScript 编译失败 | 3.4 TypeScript |
| React 跳转循环 / key 错误 / UI 不显示 | 3.5 React 组件 |
| 白屏 / 未登录访问后台 / Route Guard | 3.5 坑 17.6 |
| API 格式不统一 / 错误处理 | 3.6 API 设计 |
| 环境变量 / .env | 3.7 部署与运维、3.14.4 环境变量配置 |
| Git 换行符 / 提交过大 / 回退 | 3.9 Git 工作流 |
| 安全 / token / rate limit | 3.10 安全 |
| 相对路径 / mockData 不一致 | 3.6 API 设计 |
| 调试 / 日志 / Sentry | 3.12 调试与效率 |
| 测试 / README / 运维成本 | 3.13 运维与成本 |
| 需求变更 / 范围蔓延 | 4.1 需求变更管理 |
| 团队协作 / 发指令 / 报错格式 | 4.2 团队协作规范 |
| 回滚 / 线上故障 | 4.3 回滚决策流程 |
| 技术债务 / 重构 | 4.4 技术债务管理 |
| 会员体系 / 客户管理筛选不一致 / VIP 大小写 | 3.14.10 |
| 财务报表假数据 / 营收趋势 / 业绩排名 | 3.15.1 |
| 会员管理 500 / referral_records 表 | 3.15.2 |
| 店铺设置白屏 / openingHours 不完整 | 3.15.3 |
| 员工自助修改头像 / 手机号 | 3.15.4 |
| 预约权限控制 / 发型师调配 / 顾客取消 | 3.15.5、3.15.6 |
| 定位失败 / 到店距离 1km / 浏览器定位权限 | 3.15.6 |
| 网页提醒 / 手机浏览器通知 / 铃声限制 | 3.15.6 |
| 微信渠道 / 小程序 / 公众号 / H5 支付 / unionid | 4.7 微信生态接入决策与规范、微信渠道接入规划与指南.md |
| UI 统一 / 三端视觉一致 / 设计 Token / 小程序图标 | 1.3 核心原则、2.5.4 小程序 UI 统一规范 |
| 版本号 / 发布检查 | 4.5 版本与发布 |

### 坑号快速定位表

| 坑号 | 描述 | 严重度 | 所在章节 |
|------|------|--------|----------|
| 坑 1 | Windows GB2312 编码破坏中文文件 | 严重 ⭐ | 3.1 |
| 坑 2 | npm install 后构建失败 | 轻微 | 3.1 |
| 坑 3 | node_modules 版本不一致 | 轻微 | 3.1 |
| 坑 4 | .gitignore 漏掉 node_modules / .env | 中 | 3.1 |
| 坑 5 | 前后端两套 mockData 导致数据不一致 | 严重 | 3.2 |
| 坑 6 | Vite 代理担心影响生产 | 轻微 | 3.2 |
| 坑 7 | Tailwind 类名拼错无报错 | 轻微 | 3.2 |
| 坑 8 | 浏览器缓存导致看不到更新 | 轻微 | 3.2 |
| 坑 9 | Zustand Store 刷新后丢失 | 严重 | 3.3 |
| 坑 10 | localStorage 和 Zustand 不同步 | 严重 | 3.3 |
| 坑 11 | `btoa()` 不支持中文 | 严重 ⭐ | 3.4 |
| 坑 12 | 空数组 truthy 导致误判 | 严重 ⭐ | 3.4 |
| 坑 13 | TypeScript 类型不匹配 | 中 | 3.4 |
| 坑 14 | 可选链滥用难以定位空值 | 轻微 | 3.4 |
| 坑 15 | useEffect navigate 循环跳转 | 中 | 3.5 |
| 坑 16 | 列表渲染缺少/错误 key | 中 | 3.5 |
| 坑 17 | useEffect 依赖项遗漏 | 中 | 3.5 |
| 坑 17.5 | UI 按钮/功能加不上（权限判断包裹） | 中 | 3.5 |
| 坑 17.6 | 未登录直接访问后台路由导致白屏 | 中 | 3.5 |
| 坑 18 | API 返回格式不统一 | 轻微 | 3.6 |
| 坑 19 | API 请求无统一错误处理 | 轻微 | 3.6 |
| 坑 20 | 敏感信息存在前端 | 严重 | 3.6 |
| 坑 21 | Vercel Hobby 函数数量限制 | 严重 ⭐ | 3.7 |
| 坑 21.5 | API 返回 500 Internal Server Error | 严重 ⭐ | 3.7 |
| 坑 22 | 环境变量未在 Vercel 设置 | 中 | 3.7 |
| 坑 23 | Vercel 冷启动慢 | 轻微 | 3.7 |
| 坑 24 | Vercel 函数内存超限 | 中 | 3.7 |
| 坑 24.5 | Vercel + Express 请求体解析失败 | 严重 ⭐ | 3.7 |
| 坑 25 | dicebear 头像 API 国内被墙 | 严重 ⭐ | 3.8 |
| 坑 26 | 境外 CDN 加载慢或失败 | 轻微 | 3.8 |
| 坑 27 | 代理/VPN 导致开发环境异常 | 轻微 | 3.1 |
| 坑 28 | Git CRLF/LF 换行符警告 | 轻微 | 3.9 |
| 坑 29 | 一次提交太多改动 | 轻微 | 3.9 |
| 坑 30 | 出问题不知道回退到哪个版本 | 轻微 | 3.9 |
| 坑 31 | localStorage 存敏感信息 | 严重 | 3.10 |
| 坑 32 | 未限制 API 访问频率 | 轻微 | 3.10 |
| 坑 33 | 相对路径层级混乱 | 中 | 3.6 |
| 坑 34 | 两套 mockData 路径不一致 | 中 | 3.6 |
| 坑 35 | RLS 策略阻止读写 | 严重 | 3.11 |
| 坑 36 | RLS 导致 API 返回 400 但前端无提示 | 中 | 3.11 |
| 坑 37 | 数据库 Schema 和前端类型不同步 | 中 | 3.11 |
| 坑 38 | 改了代码但不生效 | 轻微 | 3.12 |
| 坑 39 | 生产环境报错无法调试 | 中 | 3.12 |
| 坑 40 | npm run build 通过但运行时出错 | 中 | 3.12 |
| 坑 41 | Schema 变更没有迁移脚本 | 中 | 3.11 |
| 坑 42 | 种子数据导入流程不清晰 | 中 | 3.11 |
| 坑 43 | 生产报错无法通知开发者 | 中 | 3.13 |
| 坑 44 | 没有任何测试 | 中 | 3.13 |
| 坑 45 | 无 README 新人上手难 | 轻微 | 3.13 |
| 坑 46 | 低估运维成本 | 轻微 | 3.13 |
| 坑 47 | 财务报表用随机假数据生成趋势和排名 | 严重 | 3.15.1 |
| 坑 48 | referral_records 查询失败导致会员管理 500 | 严重 | 3.15.2 |
| 坑 49 | openingHours 字段缺失导致店铺设置白屏 | 严重 | 3.15.3 |
| 坑 50 | 员工头像只能在店铺设置由店长修改 | 中 | 3.15.4 |
| 坑 51 | 手机端头像不支持拍照/相册上传 | 中 | 3.15.4 |
| 坑 52 | 权限判断逻辑散落在各处，新增角色时容易漏改 | 中 | 3.15.5 |
| 坑 53 | stylistId / barberId 两套命名混用，调配后展示不同步 | 中 | 3.15.5 |
| 坑 54 | 顾客取消预约时没有传 customerId，后端权限校验报 403 | 中 | 3.15.5 |

---

# 第二卷：工作流规范

## 2.1 改动后三步验证流程

每次代码改动完成后，必须按顺序执行以下三步。任何一步不通过，都禁止直接 push。

### 第一步：本地构建

```bash
npm run build
```

**目的**：捕获 TypeScript 类型错误、编译错误、导入路径错误等。
**通过标准**：命令退出码为 0，终端无 `error` 级别报错。

### 第二步：本地启动后端

```bash
npm run server:api
```

**目的**：验证后端服务能正常启动，路由、中间件、Supabase 连接无运行时错误。
**通过标准**：服务启动成功，无异常堆栈，可以用 curl/浏览器访问 `/api/health`。

### 第三步：浏览器预览 + Network 检查

1. 打开页面，按 `F12` 打开 DevTools → Network 面板。
2. 操作关键功能（如添加客户、编辑客户、登录）。
3. 检查对应请求的：
   - **Payload**：前端是否发送了正确数据。
   - **Preview/Response**：后端返回的数据是否与 Payload 一致。
   - **Status**：HTTP 状态码是否为 200，无 4xx/5xx。

**通过标准**：关键请求 Payload 与 Response 一致，数据库中数据正确持久化。

**为什么这三步是最小成本防线**：
- 只跑 `npm run build` 只能发现编译错误，发现不了运行时 body 解析失败。
- 只跑本地后端只能发现启动错误，发现不了 Vercel Runtime 差异。
- 只有浏览器 Network 检查能确认“前端传了 → 后端收了 → 数据入库了”整条链路。

## 2.2 回归自检清单（默认附加到每条指令末尾）

> 以下清单相当于给 agent 的“交卷前必查项”。用户每次发指令时，默认指令末尾已包含这段文本。

改完代码后，请自检以下内容：

- [ ] **是否涉及 req.body 解析？**
  - 如果是，检查 `app.ts` 中的 body 中间件是否正常工作。
  - 确认 `Content-Type: application/json` 已正确发送。
  - 确认 Vercel 部署后 `req.body` 不为空。

- [ ] **是否涉及数据库插入/更新？**
  - 如果是，检查字段名是否和 Supabase 表结构一致。
  - 确认没有直接把整个对象 `toSnakeCase()` 后塞入数据库。
  - 确认数组字段不会被展开成数字 key（如 `tags: ["烫发"]` 不会变成 `{0: "烫发"}`）。

- [ ] **是否涉及前端状态？**
  - 如果是，检查 localStorage 和 Zustand 是否同步。
  - 确认页面刷新后状态不会丢失。
  - 确认 API 失败时有 fallback（mock 或缓存）。

- [ ] **改完后是否执行了本地构建？**
  - 执行 `npm run build`，确保无编译错误。
  - 如果有新增文件，确认已被正确导入和引用。

- [ ] **是否涉及部署配置？**
  - 如果是，检查 `vercel.json` 是否正确。
  - 确认 Vercel 环境变量已配置。
  - 确认不会超过免费版 Serverless Function 数量限制。

## 2.3 常规迭代任务标准工作流示例

> 以下以“在客户管理中新增一个 `wechat` 字段”为例，演示常规迭代应遵循的完整步骤。其他新增字段、新页面、新角色权限等任务参照执行。

### 步骤 1：需求落地

- 在 [`后续开发计划书.md`](file:///workspace/后续开发计划书.md) 或本宪章对应章节记录需求。
- 明确验收标准，例如：
  1. 客户表单出现“微信号”输入框；
  2. 提交后 Payload 包含 `wechat` 字段；
  3. 数据库 `customers.wechat` 列写入对应值；
  4. 刷新页面后仍能看到微信号。

### 步骤 2：评估影响范围

- 数据库：是否需要在 `schema.sql` / `migrations/` 中新增列；
- 后端 API：`api/routes/customers.ts` 的 POST/PUT 字段映射、校验逻辑；
- 类型定义：`shared/types.ts` 中的 `Customer` / `CustomerInput` 类型；
- 前端表单：`CustomerManagement.tsx` 或相关组件的表单字段、校验规则；
- 前端 API 调用：字段名是否与后端约定一致；
- 种子数据：`scripts/seed-db.ts` 是否需要补充示例数据。

### 步骤 3：数据库变更

1. 在 `migrations/` 新增迁移文件（如 `004_add_customer_wechat.sql`）；
2. 更新 `schema.sql`，保持其为“真相源”；
3. 在 Supabase SQL Editor 执行迁移；
4. 检查 RLS 策略是否仍然适用（新增列不影响 RLS，但需确认）。

### 步骤 4：后端实现

1. 在 `api/routes/customers.ts` 的 POST/PUT 中显式映射 `wechat` 字段；
2. 不要直接 `toSnakeCase(body)` 入库；
3. 补充必要的字段校验（长度、格式等），避免非法数据写入；
4. 更新返回结构，保持 `{ success, data, error }` 统一格式。

### 步骤 5：类型同步

1. 更新 `shared/types.ts` 中的 `Customer`、`CustomerInput` 等类型；
2. 运行 `npm run build`，确保前后端类型一致。

### 步骤 6：前端实现

1. 在客户表单增加“微信号”输入框；
2. 更新提交时的对象结构，确保包含 `wechat`；
3. 如有需要，更新列表/详情展示；
4. 检查权限判断是否影响新字段的显示或编辑。

### 步骤 7：本地验证

按 2.1 执行三步验证：
1. `npm run build` 通过；
2. `npm run server:api` 正常启动；
3. 浏览器中添加客户，Network 中确认 Payload、Response、数据库三处一致。

### 步骤 8：部署与线上实测

1. push 到 Git 触发 Vercel 部署；
2. 部署完成后强制刷新页面；
3. 实测新增字段的提交、回显、刷新后 persistence；
4. 检查 Vercel Functions 日志无异常。

### 步骤 9：文档与复盘

1. 更新 README 中相关字段说明；
2. 如踩到新坑，补充到本宪章对应章节；
3. 在任务书中标记该需求已完成。

## 2.4 紧急修复任务工作流（缩短版）

> 线上出现核心功能不可用（如无法登录、无法添加客户）时，按此缩短版流程处理。关键步骤不可省略。

### 阶段 1：止血（5 分钟内）

1. **确认影响范围**：哪些功能不可用？是否所有环境都异常？
2. **决定是否回滚**：若符合 4.3 回滚决策流程中的“立即回滚”条件，先回滚再排查。你作为唯一开发者，拥有回滚决策权。
3. **记录故障**：在宪章旁快速记下故障现象，便于后续复盘补充。

### 阶段 2：定位（15 分钟内）

1. **看日志**：Vercel Dashboard → Functions → Logs，定位最新报错。
2. **对比环境**：本地 `npm run server:api` 能否复现？能复现说明是代码问题；不能复现说明是环境/配置差异。
3. **对比 Payload/Response**：浏览器 Network 面板确认前端传了什么、后端回了什么。
4. **最近变更**：`git log --oneline -10` 查看最近提交，锁定可疑改动。

### 阶段 3：修复与验证（30 分钟内）

1. **最小改动**：只修当前问题，不顺便优化其他代码。
2. **本地验证**：
   - `npm run build` 通过；
   - `npm run server:api` 启动；
   - 浏览器实测故障场景已恢复。
3. **检查回归**：验证至少 3 个核心流程（登录、添加数据、查看数据）。

### 阶段 4：上线与观察（15 分钟内）

1. push 并触发部署；
2. 部署完成后线上实测故障场景；
3. 持续观察 Vercel Functions 日志 10-15 分钟。

### 阶段 5：复盘（24 小时内）

1. 记录故障根因、修复方案、遗漏点；
2. 若属于本宪章未覆盖的新坑，补充到第三卷对应章节；
3. 评估是否需要增加监控、测试或流程改进。

## 2.5 小程序与 H5 协同开发工作流

> MBS 项目同时维护 H5/网页端（`src/`）和微信小程序端（`mini-program/`），两端共用同一套后端 API 和 Supabase 数据库。本工作流确保两端代码来源一致、数据同步、不互相干扰。

### 2.5.1 代码来源与工作流

当前采用以下开发-部署工作流：

1. **Trae 远程环境（`/workspace`）**：AI 助手在此修改代码，作为代码源头；
2. **开发者本地下载**：开发者从 Trae 将最新代码下载到本地目录（如 `E:\MBS`）；
3. **本地提交到 GitHub**：在本地执行 `git add / commit / push`；
4. **Vercel 自动部署**：Vercel 监听 GitHub 仓库自动部署到生产域名（如 `www.hfmbs.cn`）；
5. **微信开发者工具测试**：导入本地 `E:\MBS\mini-program` 目录进行小程序预览和调试。

**注意事项**：

- `/workspace` 与本地 `E:\MBS` 必须保持同步，否则会出现"远程已修复、本地仍报错"的情况；
- 每次 Trae 修改涉及 `mini-program/` 后，开发者需重新下载相关文件到本地；
- 微信开发者工具导入的是 `mini-program` 子目录，不是仓库根目录；
- **后端修改必须 push 到 GitHub 并等 Vercel 部署完成后，小程序才能访问到最新接口**：小程序默认请求生产域名 `www.hfmbs.cn/api`，如果只在 Trae 改了 `api/` 但没 push，Vercel 上跑的还是旧后端，会导致小程序出现 401、404 或数据不一致等问题。

### 2.5.2 三方协同原则

- **共用后端**：H5 和小程序都请求同一套 `/api/*` 接口，禁止为小程序单独维护一套 API；
- **共用数据库**：顾客、预约、店铺等数据全部存储在 Supabase，两端通过相同的 `customerId`、`shopId`、`bookingId` 关联；
- **共用类型与业务逻辑**：`shared/types.ts`、`shared/lib/` 中的纯计算逻辑由两端共享；平台相关代码（网络请求、本地存储、页面路由）各自实现；
- **字段命名一致**：小程序提交给后端的字段名、数据格式必须与 H5 完全一致，避免后端需要兼容两套格式；
- **登录态统一但交互按需触发**：顾客身份（`customerId`）是 H5/小程序数据打通的关键，小程序应在需要登录的交互点（如点击预约、查看个人中心）自动唤起登录弹窗，而不是依赖用户主动找到登录入口。

### 2.5.3 H5 与小程序环境差异清单

| H5/浏览器可用 | 小程序不可用 | 小程序替代方案 |
|---|---|---|
| `fetch` | ❌ | `wx.request` |
| `localStorage` | ❌ | `wx.setStorageSync` / `wx.getStorageSync` |
| `URLSearchParams` | ❌ | 手动 `encodeURIComponent` 拼接 query string |
| `window` / `document` | ❌ | 小程序自有 API |
| `.find()` / `.filter()` / 箭头函数 / `?.` 在模板中 | ❌（WXML 不支持） | 在 `.js` 中预计算后绑定到 WXML |
| `navigateTo` 跳转到 tabBar 页面 | ❌ | 跳 tabBar 页面用 `switchTab` |
| `switchTab` URL 传参 | ❌ | 用本地缓存中转参数（如 `setRouteParams` / `takeRouteParams`） |
| Promise 错误静默吞掉 | 应避免 | `wx.request` 封装在失败时 `reject`，页面 `try/catch` 处理 |
| ES Module `import/export` | ✅ | 微信开发者工具支持 |

**回归验证**：

- [ ] `npm run build` 通过；
- [ ] 微信开发者工具无报错；
- [ ] 小程序关键流程（首页加载、预约创建）与 H5 数据一致；
- [ ] tabBar 页面间跳转参数不丢失（首页选服务 → 预约页、预约成功 → 排队页、我的预约 → 排队页、结算页 → 排队页）；
- [ ] 个人中心未登录时显示登录表单，登录后正确展示顾客信息与预约列表；
- [ ] API 失败时页面有明确错误提示，不静默显示空数据。

### 2.5.4 小程序 UI 统一规范（新增）

> 顾客端同时存在 H5/网页端（`src/pages/customer/`）与微信小程序（`mini-program/pages/`）。两端的视觉语言必须一致，任何一端的界面调整必须同步评估另一端。本节规定小程序侧的统一改造标准与后续调整纪律。

#### 设计 Token 统一

- **唯一来源**：`mini-program/app.scss` 中的 CSS 变量是小程序全部颜色的唯一来源，禁止在页面样式中硬编码色值（除渐变、半透明装饰外）。
- **与 H5 对齐**：变量命名与取值直接对应 H5 顾客端 Tailwind 色板，例如：
  - `--primary: #2563eb` 对应 `blue-600`；
  - `--accent: #f97316` 对应 `orange-500`；
  - `--background: #f9fafb` 对应 `gray-50`；
  - `--text-primary: #1f2937` 对应 `gray-800`。
- **扩展流程**：若业务需要新增颜色，必须先在 `app.scss` 定义变量，并同步确认 H5 端是否已有对应色值；若 H5 没有，则两端同时新增，禁止只在小程序新增。

#### 通用组件与图标

- **通用图标组件**：`mini-program/components/icon/icon` 统一封装 lucide 风格 SVG 图标，页面通过 `<mbs-icon name="xxx" size="" color="" />` 引用。
- **图标名称对齐**：图标 `name` 与 H5 中使用的 lucide-react 图标名保持一致（如 `mapPin`、`scissors`、`creditCard`、`alertCircle`）。新增图标必须同时在 `components/icon/icon.wxml` 中补充 SVG，并确认 H5 端图标库中存在同名图标。
- **通用 UI 类**：`app.scss` 统一提供 `.card`、`.btn`、`.btn-primary`、`.btn-secondary`、`.tag`、`.badge`、`.empty-state`、`.booking-item`、`.fixed-bottom-bar`、`.gradient-header-*` 等基础类。页面私有样式仅用于布局微调，禁止重新定义按钮、卡片、标签的圆角/阴影/主色。

#### 页面结构统一

每个顾客端页面按以下结构组织，与 H5 对应页面对齐：

1. **顶部渐变头部**：使用 `.gradient-header` 或 `.gradient-header-orange/blue/purple`，包含页面标题与一句话说明；
2. **内容区**：使用 `.container`，内部以 `.card` 堆叠展示信息；
3. **卡片标题**：使用 `.card-title`，左侧配合 `<mbs-icon>`；
4. **状态徽章**：预约/订单状态统一使用 `.status-*` / `.badge-*`，文案统一为“待店铺确认、已确认、服务中、已完成、已取消”；
5. **底部固定操作栏**：需要主操作的页面使用 `.fixed-bottom-bar`，价格展示与主按钮分居左右；
6. **登录弹窗**：需要登录的场景统一调用 `components/login-modal/login-modal`，自动弹窗，不另写登录表单。

#### 状态与文案统一

| 状态值 | 中文文案 | 徽章颜色 |
|---|---|---|
| `pending` | 待店铺确认 | 黄色 `#fef3c7` / `#92400e` |
| `confirmed` | 已确认 | 蓝色 `#dbeafe` / `#1e40af` |
| `serving` | 服务中 | 靛蓝 `#e0e7ff` / `#4338ca` |
| `completed` | 已完成 | 绿色 `#d1fae5` / `#065f46` |
| `cancelled` | 已取消 | 红色 `#fee2e2` / `#991b1b` |

- 小程序 `.js` 与 H5 工具函数必须返回相同文案与类名，禁止两端各自维护映射表。

#### 登录体验统一

- 需要登录才可见/可操作的场景（如点击“我的”、点击服务项目、确认预约、查看结算会员价），应在交互点自动唤起 `login-modal`；
- 登录成功后立即刷新当前页面数据（`loadProfile`、`loadBooking`、`loadQueue` 等），确保用户无感进入已登录状态；
- 登录组件与业务页面解耦，禁止在每个页面内重复写登录表单。

#### 后续界面调整纪律

- **任何顾客端界面改动，必须同时评估 H5/小程序/后端 API 三端**：
  - 改颜色/字体/圆角 → 同步改 `app.scss` 与 H5 Tailwind 配置/样式；
  - 改图标 → 同步改 `components/icon` 与 H5 图标引用；
  - 改页面结构/新增卡片 → 同步改 H5 对应页面；
  - 改状态文案/会员权益 → 同步改 `shared/lib/membership.ts` 与两端映射函数；
  - 需要新字段 → 同步改后端接口、`shared/types.ts`、H5、小程序。
- **新增页面前**：先查看 H5 顾客端页面映射表（见 4.7.5 / 微信渠道接入指南 10.10.3），确认是否需要两端同时新增；若只新增一端，必须记录原因。
- **回归验证**：UI 改动完成后，必须两端同时目测比对关键页面（首页、预约、排队、个人中心、结算），确保颜色、字号、间距、图标、按钮视觉一致。

---

# 第三卷：踩坑百科（核心卷）

## 3.1 环境与编码

### 坑 1：Windows 系统编码破坏文件（严重 ⭐）

- **场景**：在 Windows 系统上通过 PowerShell 编辑含中文的文件。
- **现象**：代码部署后报语法错误，如 `'看板状态文件不存在'` 变成 `'?????????????'`；Vercel Functions 日志里出现乱码或引号缺失，API 返回 500。
- **根因**：某些 Windows 软件（天正给排水等）会修改系统默认编码为 GB2312，PowerShell 写入 UTF-8 文件时中文被破坏。
- **解决**：用 Base64 编码传输内容：
  ```powershell
  $b64 = 'Base64字符串'
  $bytes = [System.Convert]::FromBase64String($b64)
  [System.IO.File]::WriteAllBytes('文件路径', $bytes)
  ```
- **教训**：涉及中文的代码文件，永远不要用 PowerShell 直接 `Set-Content`；尽量用 VS Code 编辑，或升级到 PowerShell 7+（默认 UTF-8）。
- **相关文件**：`server/app.ts`、`api/app.ts` 等含中文字符串的后端文件。
- **相关坑**：3.14.2 编码与中文破坏、3.7 坑 21.5 API 返回 500 Internal Server Error。

### 坑 2：npm install 后缺少依赖（轻微）

- **场景**：`git clone` 后直接 `npm run build` 报错。
- **现象**：终端提示找不到模块或命令不存在。
- **根因**：`node_modules/` 通常不在 Git 中，需要运行 `npm install` 安装依赖。
- **解决**：
  ```bash
  npm install
  npm run build
  ```
- **教训**：新项目 clone 后第一步永远是 `npm install`；在 README 中写明启动步骤。
- **相关文件**：`package.json`、`package-lock.json`。
- **相关坑**：无。

### 坑 3：node_modules 版本不一致（轻微）

- **场景**：本地能跑，部署报错；或者不同机器表现不同。
- **现象**：同一套代码在不同环境出现不同错误，或 CI/CD 构建失败。
- **根因**：`package-lock.json` 或 `yarn.lock` 未提交，或团队成员用了不同的包管理器。
- **解决**：
  - 确保 lock 文件提交到 Git；
  - 统一使用 npm 或 yarn，不要混用；
  - CI/CD 中用 `npm ci` 代替 `npm install`（更严格的安装方式）。
- **教训**：lock 文件是构建可复现的基石，必须纳入版本控制。
- **相关文件**：`package-lock.json`、`.npmrc`。
- **相关坑**：无。

### 坑 4：.gitignore 漏掉了不该提交的文件（中）

- **场景**：Git 仓库体积过大；或不小心提交了 `.env` 文件（包含密钥）。
- **现象**：仓库包含 `node_modules`、构建产物、日志或密钥文件。
- **根因**：.gitignore 规则不完整。
- **解决**：检查 .gitignore 至少包含：
  ```
  node_modules/
  dist/
  .env
  .env.local
  *.log
  .DS_Store
  .vercel/
  ```
- **教训**：创建项目时第一时间写好 .gitignore，参考 GitHub 的语言模板；提交前用 `git status` 检查。

### 坑 5：直接把 H5 代码搬到小程序运行时报错（中）

- **场景**：把 H5 的 API 调用、模板表达式、本地存储逻辑直接复制到小程序。
- **现象**：
  - `URLSearchParams is not defined`；
  - `localStorage is not defined`；
  - WXML 报错 `unexpected '>'` 或模板不渲染；
  - API 返回 `{ success: true, data: ... }` 但页面没数据。
- **根因**：H5 浏览器环境与微信小程序 Runtime 存在差异，且后端响应格式需要解包。
- **解决**：
  - `fetch` → `wx.request`（已在 `mini-program/utils/api.js` 封装）；
  - `localStorage` → `wx.setStorageSync` / `wx.getStorageSync`；
  - `URLSearchParams` → 手动 `encodeURIComponent` 拼接；
  - WXML 中避免 `.find()` / 箭头函数 / `?.` 可选链，改在 `.js` 中预计算；
  - 后端返回统一解包 `result.data`。
- **教训**：小程序不是"缩小版 H5"，平台相关代码必须单独实现；业务逻辑尽量抽到 `shared/lib/`，平台适配层各自维护。
- **相关文件**：`mini-program/utils/api.js`、`mini-program/api/*.js`、`mini-program/pages/**/*.wxml`。
- **相关坑**：2.5 小程序与 H5 协同开发工作流。

### 坑 5.1：tabBar 页面间跳转参数丢失（中）

- **场景**：小程序中从首页点击服务项跳转到预约页并携带 `serviceId`，或预约成功后跳转到排队页并携带 `bookingId`。
- **现象**：
  - 使用 `wx.navigateTo({ url: '/pages/queue/queue?id=xxx' })` 跳转到 tabBar 页面报错 `navigateTo:fail can not navigate to a tabbar page`；
  - 使用 `wx.switchTab({ url: '/pages/queue/queue?id=xxx' })` 不报错，但目标页面 `onLoad(options)` 中 `options.id` 为空，参数丢失。
- **根因**：
  - 小程序 `navigateTo` 不能跳转到在 `app.json` tabBar 中注册的页面；
  - `switchTab` 虽然可以跳 tabBar 页面，但会忽略 URL 参数。
- **解决**：用本地缓存中转参数。在 `mini-program/utils/storage.js` 中封装 `setRouteParams(params)` 和 `takeRouteParams()`：
  - 跳转前调用 `setRouteParams({ bookingId: 'xxx' })`；
  - 跳转后目标页面在 `onLoad` / `onShow` 中调用 `takeRouteParams()` 读取并清空参数。
- **教训**：tabBar 页面传参不要用 URL，必须用全局状态或本地缓存中转；涉及 tabBar 跳转的场景要在真机和开发者工具都验证参数是否携带成功。
- **相关文件**：`mini-program/utils/storage.js`、`mini-program/pages/queue/queue.js`、`mini-program/pages/booking/booking.js`、`mini-program/pages/index/index.js`、`mini-program/pages/profile/profile.js`、`mini-program/pages/checkout/checkout.js`。
- **相关坑**：2.5 小程序与 H5 协同开发工作流。

### 坑 5.2：小程序请求封装静默吞掉错误（中）

- **场景**：后端接口返回 4xx/5xx、网络断开或请求超时，但页面只显示空白或"暂无数据"，没有错误提示。
- **现象**：`wx.request` 封装在 `fail` 或非 2xx 时 `resolve(null)`，调用方无法区分"成功但无数据"和"请求失败"。
- **根因**：为了兼容 mock 数据，早期封装把所有失败都 resolve 成 `null`，导致页面丢失错误处理机会。
- **解决**：
  - `mini-program/utils/api.js` 的 `request` 在失败时统一 `reject(new Error(message))`；
  - 页面级调用用 `try/catch` 捕获，给用户明确的 `wx.showToast` 或错误文案；
  - 需要 mock 兜底时，在页面或 API 层显式处理，而不是在请求封装层静默吞错。
- **教训**：网络请求封装应该忠实传递成功/失败状态，mock 逻辑应该在更高层处理；否则线上接口异常会被掩盖，增加排查难度。
- **相关文件**：`mini-program/utils/api.js`、`mini-program/api/*.js`、`mini-program/pages/**/*.js`。

### 坑 27：代理/VPN 导致开发环境异常（轻微）

- **场景**：开了 VPN 后本地开发正常，关了反而不行；或者反过来。
- **现象**：`npm install`、API 调用、资源加载在不同网络状态下表现不一致。
- **根因**：VPN 修改了网络路由，可能影响 npm 镜像、外部 API、DNS 解析等。
- **解决**：理解项目在有/无代理时的行为，必要时配置 `.npmrc` 或系统代理；开发团队统一网络环境约定。
- **教训**：不要把“开了 VPN 才能跑”当成正常状态，要在无代理环境下也能稳定开发。
- **相关文件**：`.npmrc`。
- **相关坑**：3.8 坑 25 国内网络无法访问境外 API、3.8 坑 26 境外 CDN 加载慢或失败。

## 3.2 前端构建

### 坑 5：前端和后端两套 mockData 导致数据不一致（严重）

- **场景**：前端 mock 改了数据，后端 API 返回的数据不一样。
- **现象**：同一页面在不同路径或刷新后显示不同数据；前后端字段命名不一致。
- **根因**：项目中存在多个 mockData 文件路径，前端和后端各用各的。
- **解决**：统一数据源，删除多余 mockData。接数据库后删除所有 mockData，全部走真实 API。
- **教训**：项目一开始就明确只有一个数据源；mock 只用于过渡，不能长期双轨运行。
- **相关文件**：`src/shared/mockData.*`、`api/_internal/mockData.*`。
- **相关坑**：3.6 坑 34 两套 mockData 路径不一致。

### 坑 6：Vite 开发代理不影响生产部署（轻微）

- **场景**：担心 `vite.config.ts` 中的 `/api` 代理配置会影响线上。
- **现象**：开发者在配置代理时犹豫不决，或线上请求路径与本地不一致。
- **根因**：`server.proxy` 只在本地开发时生效，Vercel 部署的是编译后的静态文件。
- **解决**：不需要担心，代理配置不影响生产；生产环境 API 路由由 `vercel.json` 或独立后端服务处理。
- **教训**：理解各配置项的作用域（开发 vs 生产 vs 部署），不要混淆。
- **相关文件**：`vite.config.ts`、`vercel.json`。
- **相关坑**：无。

### 坑 7：Tailwind CSS 类名拼写错误无编译报错（轻微）

- **场景**：样式看起来不对，但 `npm run build` 没有任何错误。
- **现象**：按钮、布局、颜色等样式缺失或异常。
- **根因**：Tailwind 会 purge 未使用的类，拼错的类名被直接忽略，不会触发编译错误。
- **解决**：用 VS Code Tailwind 插件，实时显示无效的类名（红色下划线）。
- **教训**：样式问题不能只看构建结果，要借助编辑器插件和浏览器 DevTools 双重检查。
- **相关文件**：`tailwind.config.js`、各组件 `.tsx` 文件。
- **相关坑**：无。

### 坑 8：构建产物缓存导致更新不生效（轻微）

- **场景**：部署后刷新页面看到的是旧版。
- **现象**：代码已更新、部署已完成，但浏览器仍显示旧 JS/CSS。
- **根因**：浏览器缓存了旧的 JS/CSS 文件。
- **解决**：
  - Vercel 部署时会自动给文件加 hash，强制刷新 `Ctrl+Shift+R`；
  - 在 `index.html` 的 `<head>` 中加 `<meta http-equiv="Cache-Control" content="no-cache">`（仅开发用）。
- **教训**：生产环境使用 Vite 的 hash 命名，通常不需要额外处理；优先用强制刷新排除缓存干扰。
- **相关文件**：`index.html`、Vite 构建输出。
- **相关坑**：3.12 坑 38 改了代码但不生效。

## 3.3 状态管理

### 坑 9：Zustand Store 刷新页面后数据丢失（严重）

- **场景**：登录后刷新页面，用户信息没了，又跳回登录页。
- **现象**：登录状态在页面刷新后消失，必须重新登录。
- **根因**：Zustand 默认是内存存储，页面刷新即清空。需要配合 localStorage 或其他持久化方案。
- **解决**（两种方式）：
  ```typescript
  // 方式1：刷新时从 localStorage 恢复
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    setCurrentEmployee(user);
  }

  // 方式2：用 zustand/middleware/persist
  import { persist } from 'zustand/middleware';
  export const useAppStore = create(persist((set, get) => ({...}), {
    name: 'app-storage', // localStorage key
  }));
  ```
- **教训**：前端状态管理两层（内存 + 持久化）必须同时同步；刷新即丢是预期行为，不是 bug。
- **相关文件**：`src/store.ts`、登录相关组件。
- **相关坑**：3.3 坑 10 状态管理两层不同步。

### 坑 10：状态管理两层（localStorage + Zustand）不同步（严重）

- **场景**：localStorage 里改了数据，页面不更新；或者反过来。
- **现象**：状态变更后 UI 未刷新，或刷新后显示旧数据。
- **根因**：改了一处，另一处没改；或者绕过 Zustand 直接操作 localStorage。
- **解决**：在同一个地方同时改两个存储，或者用 `zustand/middleware/persist` 自动同步。
- **教训**：所有状态变更走同一个入口，避免直接操作 localStorage；API 失败时的 fallback 缓存也要同步更新 Zustand。
- **相关文件**：`src/store.ts`、`src/api.ts`。
- **相关坑**：3.3 坑 9 Zustand Store 刷新页面后数据丢失。

## 3.4 TypeScript

### 坑 11：`btoa()` 不支持中文（严重 ⭐）

- **场景**：登录时报错 `DOMException: 'btoa()' called with non-Latin1 input`。
- **现象**：包含中文的 token 或数据在编码时抛出异常。
- **根因**：`btoa()` 只支持 Latin1 字符（0-255），中文超出范围。
- **解决**：
  ```typescript
  // 用这个代替 btoa/atob
  const fakeToken = 'mock_' + encodeURIComponent(JSON.stringify(data));
  const data = JSON.parse(decodeURIComponent(token.replace('mock_', '')));
  ```
- **教训**：任何涉及非 ASCII 字符的编码，永远不要用 `btoa`。
- **相关文件**：登录/认证相关组件或工具函数。
- **相关坑**：无。

### 坑 12：空数组是 truthy（严重 ⭐）

- **场景**：`if (result.data)` 判断成功，但 `[].token` 是 `undefined`。
- **现象**：API 返回空数组时，代码误以为有数据，后续访问属性时报错或行为异常。
- **根因**：JavaScript 中空数组 `[]` 是 truthy 值。
- **解决**：
  ```typescript
  // 用可选链判断具体属性
  if (result?.success && result.data?.token) { ... }
  // 或者用 Boolean 强制转换（但不够精确）
  if (Boolean(result?.data?.token)) { ... }
  ```
- **教训**：判断 API 返回值是否有效，必须检查具体属性，不能只判断对象本身。
- **相关文件**：`src/api.ts`、各 API 调用处。
- **相关坑**：3.4 坑 14 可选链滥用导致难以调试。

### 坑 13：TypeScript 类型不匹配导致编译失败（中）

- **场景**：`setCurrentEmployee({ ...result.user, role: ... })` 报 TS 错误。
- **现象**：编译器提示缺少 required 属性或类型不兼容。
- **根因**：目标类型有 required 属性，源对象缺少该属性。
- **解决**：
  ```typescript
  // 方式1：补全所有字段
  setCurrentEmployee({ ...result.user, role: ..., isActive: true });

  // 方式2：用 as any 绕过（临时方案，有风险）
  setCurrentEmployee({ ...result.user } as any);

  // 方式3：修改类型定义（正确方案）
  // 在 types.ts 中将 isActive 改为 optional: isActive?: boolean
  ```
- **教训**：改类型定义比到处加 `as any` 更干净；新增字段时同步更新 `shared/types.ts`。
- **相关文件**：`shared/types.ts`、调用 `setCurrentEmployee` 的组件。
- **相关坑**：3.11 坑 37 数据库 Schema 和前端类型不同步。

### 坑 14：可选链滥用导致难以调试（轻微）

- **场景**：用了很多 `?.` 后，某个值为 null 时代码静默失败，不知道哪里出了问题。
- **现象**：功能不工作，但控制台没有明确报错，或报错位置远离真正问题。
- **根因**：可选链过度使用，隐藏了本应及时发现的空值。
- **解决**：在关键路径加明确的非空判断和错误日志：
  ```typescript
  if (!user) {
    console.error('用户未登录', { url: window.location.href });
    navigate('/login');
    return;
  }
  ```
- **教训**：可选链是“优雅降级”的工具，不是“逃避空值判断”的工具；核心业务路径必须显式校验。
- **相关文件**：登录后页面、依赖用户信息的组件。
- **相关坑**：3.4 坑 12 空数组是 truthy。

## 3.5 React 组件

### 坑 15：useEffect 中 navigate 导致循环跳转（中）

- **场景**：为消除 React Router 的 warning，把 `navigate()` 放到 useEffect 中，结果不断触发跳转。
- **现象**：页面无限跳转，浏览器地址栏快速变化，甚至崩溃。
- **根因**：导航触发状态变化 → 状态变化触发 useEffect → useEffect 再次导航 → 循环。
- **解决**：
  ```typescript
  // 简单场景：直接放在 render 中（不需要 useEffect）
  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }
  ```
  ```typescript
  // 复杂场景：加 guard 防止重复
  const navigateRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn && !navigateRef.current) {
      navigateRef.current = true;
      navigate('/login');
    }
  }, [isLoggedIn, navigate]);
  ```
- **教训**：`useEffect` 中放导航逻辑要非常小心依赖项；简单场景直接放 render 中更安全。
- **相关文件**：登录拦截组件、权限守卫组件。
- **相关坑**：无。

### 坑 16：列表渲染缺少 key 或 key 用 index（中）

- **场景**：删除列表中某一项后，其他项的数据错位。
- **现象**：删除一行后，剩余行的数据或状态显示错误。
- **根因**：用 `index` 做 key，删除项后剩余项的 index 变了但 key 没变，React 无法正确 diff。
- **解决**：用唯一 ID 做 key：
  ```tsx
  // 错误
  {customers.map((c, i) => <div key={i}>{c.name}</div>)}

  // 正确
  {customers.map((c) => <div key={c.id}>{c.name}</div>)}
  ```
- **教训**：列表 key 必须是稳定且唯一的标识，不要用 index 偷懒。
- **相关文件**：`CustomerManagement.tsx`、任何列表渲染组件。
- **相关坑**：无。

### 坑 17：useEffect 依赖项遗漏导致闭包陷阱（中）

- **场景**：函数内读到的是过时的值。
- **现象**：状态已更新，但 useEffect 内使用的变量仍是旧值。
- **根因**：useEffect 依赖项不全。
- **解决**：
  ```typescript
  // 错误
  useEffect(() => {
    fetchData(data); // data 是过时的闭包值
  }, []); // 空依赖

  // 正确
  useEffect(() => {
    fetchData(data);
  }, [data]); // 加上依赖
  ```
- **教训**：useEffect 依赖数组要诚实；不确定时先用 `eslint-plugin-react-hooks` 自动检查。
- **相关文件**：使用 `useEffect` 的组件。
- **相关坑**：无。

### 坑 17.5：UI 按钮/功能加不上或显示不出来（中）

- **场景**：代码里加了按钮，但页面上看不到；或者按钮点击后报错。
- **现象**：新按钮、新功能未渲染，或只有特定角色能看到。
- **根因（多种可能）**：
  1. **权限判断包裹**：按钮被 `{canEdit && (...)}` 或类似条件包裹，当前用户没有权限；
  2. **状态未初始化**：按钮依赖的 state（如 `showEdit`）没有在组件中声明；
  3. **CSS 隐藏**：按钮被其他元素遮挡，或者 `className` 写错了导致样式问题；
  4. **条件渲染顺序**：按钮在 `{loading && ...}` 之后，loading 状态一直为 true；
  5. **路由/组件未加载**：按钮所在的组件没有被正确渲染（路由配置问题）。
- **解决**：
  1. 在按钮所在组件的 return 最前面加 `console.log('组件渲染了')`，确认组件已挂载；
  2. 找到按钮附近的 `{xxx && (...)}`，临时去掉条件测试；
  3. 确保 `const [showEdit, setShowEdit] = useState(false)` 存在；
  4. 用浏览器 DevTools 检查按钮元素是否存在、是否被隐藏；
  5. 确保 loading 在数据加载完成后变为 false。
- **教训（本项目实际踩坑）**：
  - 「编辑信息」按钮在详情弹窗底部，被权限判断 `{canEditProfile && (...)}` 包裹，CEO/店长角色才有权限；
  - 添加客户按钮在 `{canExport && (...)}` 块内，导致非管理员角色看不到；
  - 加 UI 元素前先确认权限逻辑，新功能先用最简单的方式实现（无条件渲染），再加权限控制。
- **相关文件**：`src/pages/shop/CustomerManagement.tsx`、含权限判断的组件。
- **相关坑**：无。

### 坑 17.6：未登录直接访问后台路由导致白屏（中）

- **场景**：用户在未登录状态下，直接在地址栏输入 `/shop` 或 `/shop/customers` 等后台页面 URL。
- **现象**：页面白屏，`<div id="root"></div>` 为空；正常按登录流程进入则没有问题。
- **根因**：后台页面组件在渲染时假设用户已登录、当前员工/店铺信息已存在；未登录时这些状态为 `null` 或 `undefined`，组件访问其属性或调用依赖登录态的 hook，触发 JS 运行时错误，React 初始化失败，整个页面不渲染。
- **解决**：给 `/shop/*` 路由加统一的登录守卫（Route Guard），未登录时自动重定向到 `/shop/login`：
  ```tsx
  // src/App.tsx
  const ShopRouteGuard = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, currentEmployee } = useAppStore();
    if (!isAuthenticated || !currentEmployee) {
      return <Navigate to="/shop/login" replace />;
    }
    return <>{children}</>;
  };

  <Route path="/shop" element={<ShopRouteGuard><ShopLayout /></ShopRouteGuard>}>
    {/* ... */}
  </Route>
  ```
- **教训**：任何需要登录态的页面，都必须在路由层做守卫，不能依赖组件内部的容错；白屏问题往往源于“预期之外的状态”而不是 CSS。
- **相关文件**：`src/App.tsx`、路由配置文件、权限/登录状态 store。
- **相关坑**：3.5 坑 15 useEffect 中 navigate 导致循环跳转。

## 3.6 API 设计

### 坑 18：后端 API 返回格式不统一（轻微）

- **场景**：有的接口返回 `{ success, data }`，有的返回 `{ code, message, data }`，前端处理混乱。
- **现象**：同一项目里多种响应结构并存，前端需要写多种错误处理分支。
- **根因**：没有统一的 API 响应格式规范。
- **解决**：统一约定后，所有接口遵守：
  ```typescript
  // 成功
  { success: true, data: { ... } }
  // 失败
  { success: false, error: '错误信息' }
  ```
- **教训**：项目开始就定好 API 格式规范，前后端都要遵守；新增接口先写响应结构再写逻辑。
- **相关文件**：`src/api.ts`、所有 `api/routes/*.ts`。
- **相关坑**：3.6 坑 19 API 请求没有统一错误处理。

### 坑 19：API 请求没有统一错误处理（轻微）

- **场景**：网络断了，页面没有任何反馈，用户不知道请求失败了。
- **现象**：请求失败时 UI 卡住或显示空白，没有错误提示。
- **根因**：每个 fetch 调用独立处理错误，或者根本不处理。
- **解决**：统一封装 http 工具：
  ```typescript
  async function http<T>(url: string, options?: RequestInit): Promise<T> {
    try {
      const res = await fetch(url, options);
      return await res.json();
    } catch (err) {
      console.error('请求失败:', err);
      throw err; // 让调用方决定如何处理
    }
  }
  ```
- **教训**：统一的错误处理层是用户体验的最后一道防线；至少要在控制台输出、UI 提示、兜底数据三选一。
- **相关文件**：`src/api.ts`。
- **相关坑**：3.6 坑 18 后端 API 返回格式不统一。

### 坑 20：敏感信息存在前端（严重）

- **场景**：把 API Key 或数据库连接字符串写在前端代码里。
- **现象**：密钥暴露在浏览器可读的 JS 中，可被任意用户提取。
- **根因**：前端代码对用户完全可见。
- **解决**：
  - API Key 放在后端环境变量，前端只调用自己的后端；
  - 用后端作为代理访问第三方服务；
  - 前端只存不敏感的配置。
- **教训**：永远不要相信前端是安全的；任何进入浏览器的代码/配置都视为公开。
- **相关文件**：`.env`、`.env.local`、前端配置文件。
- **相关坑**：3.10 坑 31 localStorage 存敏感信息。

### 坑 33：相对路径层级混乱（中）

- **场景**：`import '../../shared/mockData'` 还是 `import '../shared/mockData'` 分不清楚。
- **现象**：编译报错模块找不到，或代码审查时路径难以阅读。
- **根因**：没搞清楚文件深度，路径写错。
- **解决**：根据文件所在层级数：
  ```
  src/
    api.ts              → ../shared/mockData   (向上1级)
    pages/shop/Login.tsx → ../../../shared/mockData  (向上3级)
  ```
- **教训**：使用 path alias（tsconfig.json 的 paths 配置），避免手写相对路径。
  ```json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@/*": ["src/*"],
        "@shared/*": ["src/shared/*"]
      }
    }
  }
  ```
- **相关文件**：`tsconfig.json`、所有 import 语句。
- **相关坑**：3.6 坑 34 两套 mockData 路径不一致。

### 坑 34：两套 mockData 路径不一致（中）

- **场景**：前端 `src/api.ts` 用 `../shared/mockData`，后端 `api/routes/` 用 `../_internal/mockData`，内容不同步。
- **现象**：同一字段前后端 mock 值不同，联调时数据对不上。
- **根因**：没有统一的数据源管理。
- **解决**：mockData 只留一份，要么在前端，要么在后端，不要两边都放；接数据库后全部删除。
- **教训**：mock 数据也是代码资产，必须统一维护；双轨 mock 是隐性的数据不一致来源。
- **相关文件**：`src/shared/mockData.*`、`api/_internal/mockData.*`。
- **相关坑**：3.2 坑 5 前端和后端两套 mockData 导致数据不一致、3.6 坑 33 相对路径层级混乱。

## 3.7 部署与运维

### 坑 21：Vercel Hobby 函数数量限制（严重 ⭐）

- **场景**：Vercel 部署报错 `No more than 12 Serverless Functions`。
- **现象**：部署失败，无法上线。
- **根因**：Hobby 免费版最多 12 个 Serverless Function，每个 `api/*.ts` 文件默认各占一个。
- **解决**：
  1. `vercel.json` 中明确指定单一入口函数：
     ```json
     {
       "rewrites": [
         { "source": "/api/(.*)", "destination": "/api/index" },
         { "source": "/(.*)", "destination": "/index.html" }
       ],
       "functions": {
         "api/index.ts": {
           "memory": 256,
           "maxDuration": 10,
           "includeFiles": "api/**"
         }
       }
     }
     ```
  2. 只保留 `api/index.ts` 作为 Vercel 入口，`api/app.ts` 挂载所有路由；
  3. 删除不再需要的独立路由文件（`bookings.ts`、`shops.ts`、`stylists.ts` 等），把功能合并到 `customers.ts`、`auth.ts` 或后续再恢复。
- **教训**：接 Supabase 之前先数 `api/` 下文件数量，超过 10 个就要考虑合并成单一入口。
- **相关文件**：`vercel.json`、`api/index.ts`、`api/app.ts`。
- **相关坑**：3.14.1 部署与函数限制。

### 坑 21.5：API 返回 500 Internal Server Error（严重 ⭐）

- **场景**：所有 API 请求返回 500，前端 Console 红色报错。
- **现象**：前端功能全部不可用，Vercel Functions 日志显示异常。
- **根因（多种可能）**：
  1. **后端代码语法错误**：文件编码问题导致中文字符串被破坏，引号缺失（见坑 1）；
  2. **路由配置错误**：`vercel.json` 的 `rewrites` 或 `functions` 配置不正确，请求没有到达正确的处理函数；
  3. **模块导入失败**：后端 import 的文件路径不存在或路径写错；
  4. **环境变量缺失**：后端依赖的环境变量（如数据库连接字符串）未在 Vercel 设置；
  5. **运行时异常**：后端代码执行过程中抛出未捕获的错误。
- **解决**：
  1. 看 Vercel Functions 日志：Vercel Dashboard → 项目 → Functions → 点击具体函数 → Logs；
  2. 本地复现：`npm run server:api` 启动本地后端，用 Postman 测试 API；
  3. 检查语法：确保所有后端文件没有语法错误（中文编码问题尤其注意）；
  4. 检查路由：确保 `vercel.json` 的 `rewrites` 正确指向 `api/index`；
  5. 检查 import：确保所有导入路径正确，文件存在。
- **教训（本项目实际踩坑）**：
  - Windows GB2312 编码破坏 `server/app.ts` 中文字符串 → 用 Base64 重新写入正确内容；
  - `vercel.json` 配置从 `builds/routes` 改为 `functions/rewrites` 格式；
  - 删除多余后端文件，只保留 `api/index.ts` 和 `api/app.ts`。
- **相关文件**：`api/app.ts`、`vercel.json`、后端路由文件。
- **相关坑**：3.1 坑 1 Windows 系统编码破坏文件、3.7 坑 22 环境变量未在部署平台设置、3.14.2 编码与中文破坏。

### 坑 22：环境变量未在部署平台设置（中）

- **场景**：本地 `.env` 有配置，但 Vercel 上没有，部署后 API 不通。
- **现象**：本地 `npm run dev` 能连上 Supabase，Vercel 部署后 API 返回 500 或空数据。
- **根因**：.env 文件不在 Git 中，部署平台读不到。
- **解决**：在 Vercel 项目 Settings → Environment Variables 中手动添加：
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **教训**：.env 不提交到 Git，但部署时要在平台重新配置；本地和线上环境变量是两套东西，缺一不可。
- **相关文件**：`.env`、Vercel 项目设置。
- **相关坑**：3.14.4 环境变量配置。

### 坑 23：Vercel 冷启动慢（轻微）

- **场景**：一段时间没访问后，第一次请求需要几秒钟。
- **现象**：首次请求响应慢，后续请求正常。
- **根因**：Serverless 函数的冷启动特性。
- **解决**：
  - Vercel Hobby 升级到 Plus 版（付费）；
  - 或者接受冷启动延迟（通常 1-3 秒可接受）。
- **教训**：免费版的冷启动是架构特性，不是 bug；对响应时间敏感的功能要提前评估。
- **相关文件**：`vercel.json`。
- **相关坑**：无。

### 坑 24：内存超限（Vercel 默认 256MB）（中）

- **场景**：大数据量请求时 Vercel 函数报错 500。
- **现象**：特定接口在数据量大时失败，本地正常。
- **根因**：函数内存超限。
- **解决**：在 vercel.json 中调整内存（付费功能）：
  ```json
  { "functions": { "api/index.ts": { "memory": 1024 } } }
  ```
- **教训**：免费版内存有限，大数据量查询要分页或聚合；付费升级前先优化代码。
- **相关文件**：`vercel.json`、大数据量接口。
- **相关坑**：无。

### 坑 24.5：Vercel + Express 请求体解析失败（严重 ⭐）

- **场景**：客户管理页面新增/编辑客户时，前端 Payload 明明带了 `name`、`phone` 等字段，后端也返回 `success: true`，但数据库里存进去的却是 `name: "未命名客户"`、`phone: ""` 等兜底值，所有用户填写字段全部丢失。
- **现象时间线**：
  1. 用户填写姓名“亚列”、电话“15900000001”、年龄 123、生日等字段；
  2. 浏览器 Network 面板显示 `POST /api/customers` 的 Payload 完全正确；
  3. 后端返回的 Response 里，`name` 变成“未命名客户”，`phone` 为空字符串，`age`、`birthday`、`gender` 等全部变为 `null` 或默认值；
  4. Supabase 数据库里只有系统自动生成的 `id`、`shop_id`、`created_at` 有值，其他字段都是兜底值。
- **根因（多层叠加）**：
  - **第一层：前端 `Content-Type` 被覆盖**。`src/api.ts` 的 `http` 工具中 `headers` 放在 `...opts` 后面，自定义 headers 会覆盖默认 `Content-Type`，导致后端 `express.json()` 不解析 body，`req.body` 为空对象 `{}`。
  - **第二层：Vercel Runtime 下 `express.json()` 不可靠**。即使修复了 `Content-Type`，在部分 Vercel Node Runtime 版本里，`express.json()` 仍然读不到请求流，或者流被提前消费，`req.body` 依然是 `{}`。这个行为在本地 `npm run server:api` 完全正常，部署到 Vercel 后才暴露。
  - **第三层：后端字段映射工具把数组展开成数字 key**。早期 `customers.ts` 用 `toSnakeCase(body)` 直接转换整个请求体，这个函数会把 `tags: ["烫发"]` 变成 `{0: "烫发"}`，导致 Supabase 报错 `Could not find the '0' column of 'customers'`。
- **解决**：
  1. 前端 `src/api.ts` 确保 Content-Type 不被覆盖：
     ```typescript
     const res = await fetch(url, {
       ...opts,
       headers: {
         'Content-Type': 'application/json',
         ...(opts.headers || {}),
       },
       signal: controller.signal,
     });
     ```
  2. 后端 `api/app.ts` 用自定义 JSON body parser 替代 `express.json()`：
     ```typescript
     // 兼容 Vercel Runtime 的自定义 JSON body parser
     const getRawBody = (req: any): Promise<string> => {
       return new Promise((resolve, reject) => {
         let data = '';
         req.setEncoding('utf8');
         req.on('data', (chunk: string) => { data += chunk; });
         req.on('end', () => { resolve(data); });
         req.on('error', (err: any) => { reject(err); });
       });
     };

     const jsonBodyParser = async (req: any, _res: any, next: any) => {
       if (req._body) return next();

       const contentType = req.headers['content-type'] || '';
       if (!contentType.includes('application/json')) return next();

       try {
         const raw = await getRawBody(req);
         console.log('[body-parser] raw body:', raw);
         req.body = raw ? JSON.parse(raw) : {};
         req._body = true;
         next();
       } catch (err: any) {
         console.error('[body-parser] parse error:', err.message);
         next(err);
       }
     };

     app.use(jsonBodyParser);
     ```
  3. 后端 `api/routes/customers.ts` 改用手动字段映射：
     ```typescript
     const insertData: Record<string, any> = {
       id: customerId,
       shop_id: shopId,
       name: body.name || '未命名客户',
       phone: body.phone || '',
     };

     if (body.gender) insertData.gender = body.gender;
     if (body.age !== undefined && body.age !== null) insertData.age = body.age;
     if (body.birthday) {
       const d = typeof body.birthday === 'string' ? body.birthday.split('T')[0] : body.birthday;
       insertData.birthday = d;
     }
     if (body.tags && Array.isArray(body.tags)) insertData.tags = body.tags;
     if (body.membershipLevel) insertData.membership_level = body.membershipLevel;
     if (body.source) insertData.source = body.source;
     ```
- **关键验证点**：
  - 部署后添加客户，Vercel Functions 日志应显示：
    ```
    [body-parser] raw body: {"name":"亚列","phone":"15900000001",...}
    [customers] 收到请求体: {"name":"亚列","phone":"15900000001",...}
    ```
  - Response 里的 `name` 和 `phone` 应与 Payload 一致；
  - Supabase 数据库中对应字段应写入用户真实输入。
- **教训**：
  1. **本地正常 ≠ 线上正常**：`express.json()` 在本地开发完美运行，到 Vercel Serverless 环境可能失效，部署后必须实测 POST/PUT 请求。
  2. **HTTP 工具封装要小心 headers 合并顺序**：`fetch` 的 `headers` 放在 `...opts` 后面时，任何自定义 header 都会覆盖默认值，导致 `Content-Type` 丢失。
  3. **请求体解析要加日志**：在 body parser 和路由入口分别打印 `req.body` 和 `content-type`，是定位“前端传了后端没收到”最快的方式。
  4. **不要直接把整个对象塞进数据库**：`toSnakeCase` 这类通用转换工具对数组、嵌套对象不友好，写数据库前必须显式字段映射并过滤非法 key。
  5. **兜底值会掩盖真实问题**：`name || '未命名客户'` 这种写法让问题看起来只是“数据没显示”，实际上后端根本没收到数据。排查时要对比 Payload 和 Response 的每个字段。
- **相关文件**：`src/api.ts`、`api/app.ts`、`api/routes/customers.ts`、`api/utils/case.ts`。
- **相关坑**：3.14.5 字段映射与数组展开、3.14.6 HTTP 请求头合并、3.14.7 Vercel Runtime 请求体解析。

## 3.8 网络与环境

### 坑 25：国内网络无法访问境外 API（严重 ⭐）

- **场景**：头像图片加载失败；第三方 SDK 不工作。
- **现象**：浏览器 Network 中特定外部请求失败或超时。
- **根因**：dicebear.com 等境外服务在国内被墙。
- **解决**：替换为国内可访问的服务：
  ```typescript
  // 原来（被墙）
  'https://api.dicebear.com/7.x/personas/svg?seed='

  // 改用
  'https://ui-avatars.com/api/?name=&background=random&size=80'
  ```
- **教训**：国内项目依赖外部 API 时，优先选国内可访问的服务；上线前在目标用户网络环境下实测。
- **相关文件**：头像/图片渲染组件。
- **相关坑**：3.1 坑 27 代理/VPN 导致开发环境异常、3.8 坑 26 境外 CDN 加载慢或失败。

### 坑 26：境外 CDN 加载慢或失败（轻微）

- **场景**：字体、图标库加载时间很长或失败。
- **现象**：页面白屏时间变长，图标显示为方框或缺失。
- **根因**：BootCDN、unpkg 等国内 CDN 不稳定，或者链接已失效。
- **解决**：
  - 优先用 npm 包引入（内网环境下也能用）；
  - CDN 链接要定期检查是否有效；
  - 字体用 woff2 格式并做好降级。
- **教训**：对外部 CDN 的依赖要有备案；生产环境尽量把关键资源打包到产物中。
- **相关文件**：`index.html`、字体/图标引入配置。
- **相关坑**：3.1 坑 27 代理/VPN 导致开发环境异常、3.8 坑 25 国内网络无法访问境外 API。

## 3.9 Git 工作流

### 坑 28：Git CRLF/LF 换行符警告（轻微）

- **场景**：每次 git push 大量警告 "LF will be replaced by CRLF"。
- **现象**：提交时控制台满是换行符警告，跨平台协作时 diff 混乱。
- **根因**：Windows 默认换行符是 CRLF，Git 配置了 `core.autocrlf=true`。
- **解决**：在项目根目录创建 `.gitattributes`：
  ```
  * text=auto
  ```
- **教训**：跨平台项目（Windows + Unix）一定要加 .gitattributes；不要依赖每个开发者的全局 Git 配置。
- **相关文件**：`.gitattributes`。
- **相关坑**：无。

### 坑 29：一次提交太多改动，难以定位问题（轻微）

- **场景**：改了一堆文件后报错，不知道哪个改动导致的。
- **现象**：回滚或排查时无从下手，commit 体积过大。
- **根因**：没有养成小步提交的习惯。
- **解决**：
  - 每次只改一个功能点；
  - 改完立刻 `git add` + `git commit`；
  - Commit message 要写清楚改了什么。
- **教训**：小步提交是团队协作的最低成本保险；好的 commit history 本身就是调试工具。
- **相关文件**：Git 仓库。
- **相关坑**：3.9 坑 30 出问题不知道回退到哪个版本。

### 坑 30：出问题不知道回退到哪个版本（轻微）

- **场景**：改坏了不知道怎么办。
- **现象**：线上或本地出现故障，想回退但找不到稳定版本。
- **根因**：没有打标签或清晰的 commit message，缺少稳定版本锚点。
- **解决**：
  ```bash
  git log --oneline -10           # 看最近10次提交
  git reset --hard <commit-id>    # 回到某个正常版本
  git push --force                # 强制推送（谨慎！）
  ```
- **教训**：每次大改动前 `git tag v1.0` 打标签；有稳定版本就推一个 tag；回滚前先确认影响范围。
- **相关文件**：Git 仓库。
- **相关坑**：4.3 回滚决策流程、3.9 坑 29 一次提交太多改动。

## 3.10 安全

### 坑 31：localStorage 存敏感信息（严重）

- **场景**：token 存在 localStorage，被 XSS 攻击读取。
- **现象**：一旦页面被注入恶意脚本，token 可被直接提取。
- **根因**：localStorage 对任何 JS 代码都可读。
- **解决**：
  - 敏感 token 用 httpOnly Cookie 存储（后端设置）；
  - localStorage 只存不敏感的配置和缓存数据；
  - 前端 token 只用于标识，不要存密码或关键数据。
- **教训**：前端存储没有秘密；敏感凭证必须放在后端可控的 httpOnly Cookie 中。
- **相关文件**：登录接口、认证中间件、状态管理文件。
- **相关坑**：3.6 坑 20 敏感信息存在前端。

### 坑 32：未限制 API 访问频率（轻微）

- **场景**：接口被恶意刷请求。
- **现象**：登录接口被暴力破解，或公共接口被滥用导致额度耗尽。
- **根因**：没有 rate limiting。
- **解决**：
  - 后端加 rate limiting 中间件（如 express-rate-limit）；
  - 或使用 Supabase 内置的 rate limit；
  - 对外接口必加，登录接口尤其重要。
- **教训**：免费版资源有限，rate limiting 既是安全手段也是成本保护。
- **相关文件**：`api/app.ts`、登录路由、公共 API 路由。
- **相关坑**：3.13 坑 46 低估运维成本。

## 3.11 Supabase 数据库

### 坑 35：RLS 策略阻止读写（严重）

- **场景**：插入数据时静默失败，控制台没有报错。
- **现象**：请求发送了但数据没写入，页面没有反馈。
- **根因**：Supabase 默认启用 Row Level Security，表没有配置读写策略。
- **解决**：在 SQL 中明确配置 RLS：
  ```sql
  -- 允许所有操作（演示版）
  ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON customers FOR ALL USING (true);
  ```
- **教训**：每新建一张表，第一时间配置 RLS 策略；否则写入会静默失败，排查极耗时间。
- **相关文件**：`schema.sql`、Supabase SQL Editor 执行记录。
- **相关坑**：3.11 坑 36 RLS 导致 API 返回 400 但前端无提示、3.14.3 数据库 RLS 策略。

### 坑 36：RLS 导致 API 返回 400 但前端没有报错提示（中）

- **场景**：请求发送了但数据没写入，页面没有反馈。
- **现象**：Supabase 返回 400 但 JS SDK 没有正确处理，用户看不到错误。
- **根因**：前端代码未对 Supabase 错误做处理，或错误被吞掉。
- **解决**：所有 Supabase 操作加错误处理和日志：
  ```typescript
  const { data, error } = await supabase.from('customers').select('*');
  if (error) {
    console.error('Supabase error:', error);
    throw new Error(error.message);
  }
  ```
- **教训**：Supabase 的静默失败是高频坑；每次查询/写入都要检查 `error`，并在 UI 给出反馈。
- **相关文件**：所有调用 Supabase 的文件。
- **相关坑**：3.11 坑 35 RLS 策略阻止读写、3.14.3 数据库 RLS 策略。

### 坑 37：数据库 Schema 和前端类型不同步（中）

- **场景**：数据库加了字段，前端类型没更新，报 TS 错误或数据丢失。
- **现象**：前端表单传了新字段，但数据库没存；或 TS 编译报错缺少字段。
- **根因**：没有 schema 管理流程，前端、后端、数据库各自为政。
- **解决**：
  - 每次改数据库同步更新 `schema.sql` 文件；
  - 前端类型从 schema 生成或手动同步；
  - 用同一份 SQL 作为本地和远程的“真相源”。
- **教训**：新增字段必须走“数据库 → 后端映射 → 类型定义 → 前端表单”四步，缺一不可。
- **相关文件**：`schema.sql`、`shared/types.ts`、`api/routes/customers.ts`、前端表单组件。
- **相关坑**：3.4 坑 13 TypeScript 类型不匹配、3.14.8 Schema 与前端字段对齐。

### 坑 41：Schema 变更没有迁移脚本（中）

- **场景**：本地改了表结构，但生产环境还是旧的，部署后功能异常。
- **现象**：本地功能正常，线上缺表/缺列，接口报错。
- **根因**：只有一个 `schema.sql` 文件，每次修改表结构都直接覆盖它，没有记录变更历史；生产环境不知该执行哪些增量 SQL。
- **解决**：维护 `migrations/` 文件夹，每次变更写一个迁移文件：
  ```
  migrations/
    001_initial.sql           # 初始建表
    002_add_customer_profile.sql  # 新增客户画像表
    003_add_refund_table.sql      # 新增退款表
  ```
- **教训**：数据库变更走迁移脚本，而不是手动改表；迁移文件命名规范 `序号_描述.sql`，每个迁移只改一个功能点，方便回滚。
- **相关文件**：`migrations/`、`schema.sql`。
- **相关坑**：3.11 坑 37 数据库 Schema 和前端类型不同步。

### 坑 42：种子数据导入流程不清晰（中）

- **场景**：项目已有 `scripts/seed-db.ts` 种子数据脚本，但新人不知道要先执行 `schema.sql` 建表，再运行 `npm run seed-db` 导入数据。
- **现象**：新人跑 `npm run seed-db` 报错表不存在，或数据导入后表结构不对。
- **根因**：种子数据脚本依赖 Supabase 已建表，但操作步骤没有文档化。
- **解决**：
  1. 先在 Supabase SQL Editor 中执行 `schema.sql` 建表；
  2. 在 `.env` 中配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`；
  3. 运行 `npm run seed-db` 导入演示数据。
- **教训**：在 README 中写清楚建表 → 导数据的顺序；新建项目时第一时间执行种子数据，确保新人能跑起来。
- **相关文件**：`scripts/seed-db.ts`、`schema.sql`、README。
- **相关坑**：3.11 坑 41 Schema 变更没有迁移脚本。

## 3.12 调试与效率

### 坑 38：改了代码但不生效（轻微）

- **场景**：改了文件，但页面没变化。
- **现象**：开发或部署后功能未更新。
- **根因**：可能是部署未完成、浏览器缓存、未 push、分支错误等多种原因。
- **解决**：按以下顺序排查：
  1. Vercel 部署是否完成？（看 Vercel Dashboard 的 Deployment 状态）
  2. 浏览器是否缓存了旧文件？（Ctrl+Shift+R 强制刷新）
  3. Git 是否正确 push 了？（`git log` 确认）
  4. 是否在正确的分支上操作？（main vs feature）
- **教训**：改代码不生效时，先排除环境/缓存/分支问题，再怀疑代码逻辑。
- **相关文件**：Git 仓库、Vercel Dashboard。
- **相关坑**：3.2 坑 8 构建产物缓存导致更新不生效。

### 坑 39：生产环境报错无法调试（中）

- **场景**：本地正常，Vercel 上报错。
- **现象**：无法 attach debugger，错误信息不完整。
- **根因**：Serverless 环境调试能力受限，console 日志分散。
- **解决**：
  - Vercel Functions 日志：在 Vercel Dashboard → Functions 查看；
  - 加 console.log 辅助调试，但注意敏感信息；
  - 考虑接入 Sentry：错误监控和追踪。
- **教训**：生产环境日志是第一调试手段；上线前规划好日志和监控方案。
- **相关文件**：`api/app.ts`、各 API 路由、Sentry 配置（如有）。
- **相关坑**：3.13 坑 43 生产报错无法通知开发者。

### 坑 40：npm run build 通过了但运行时出错（中）

- **场景**：编译时没有类型错误，但运行时浏览器报错。
- **现象**：构建产物正常，打开页面后功能异常。
- **根因**：
  - 运行时动态导入的模块找不到；
  - 环境变量未定义；
  - 浏览器兼容性问题（如 `?.` 在旧浏览器不支持）。
- **解决**：
  - 检查浏览器控制台的 Source Map；
  - 确认 `tsconfig.json` 的 `target` 和 `lib` 配置；
  - 运行时错误优先看浏览器 Console，而不是终端。
- **教训**：构建通过只是静态检查通过；运行时行为依赖环境、浏览器、网络、第三方服务。
- **相关文件**：`tsconfig.json`、动态导入代码、环境变量引用处。
- **相关坑**：3.12 坑 39 生产环境报错无法调试。

## 3.13 运维与成本

### 坑 43：生产环境报错无法通知到开发者（中）

- **场景**：用户遇到错误，但开发者完全不知道，等用户投诉才发现。
- **现象**：问题已经存在很久，直到有用户反馈才被动处理。
- **根因**：没有错误监控系统，console.error 只在服务器日志中，没有人主动查看。
- **解决**：
  - 接入 Sentry 或类似错误监控工具；
  - 在关键 API 捕获异常并上报：
    ```typescript
    try {
      // ...
    } catch (err) {
      console.error('[API Error]', err);
      // 上报到监控系统
      await reportError(err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    ```
- **教训**：项目上线前先接入错误监控；Vercel Functions 日志是排查 500 的第一入口；至少加一个全局 error boundary，前端报错时显示友好提示。
- **相关文件**：`api/app.ts`、全局错误处理、Sentry 配置。
- **相关坑**：3.12 坑 39 生产环境报错无法调试。

### 坑 44：没有任何测试，改一处坏十处（中）

- **场景**：改了一个看似无关的地方，另一个功能崩溃了，但没发现，部署后用户投诉。
- **现象**：回归问题频发，每次改动都需要大量手动验证。
- **根因**：没有自动化测试，每次改动全靠手动验证（容易遗漏）。
- **解决**：
  - 关键 API 加集成测试（至少测试 happy path）；
  - 用 Jest 或 Vitest 保存测试用例：
    ```typescript
    test('login with valid phone returns token', async () => {
      const res = await request(app).post('/api/auth/login').send({ phone: '13900000001' });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });
    ```
- **教训**：至少写一个最基础的测试（如登录、获取客户列表）；每次改关键功能后跑一遍测试 `npm test`；不需要追求 100% 覆盖率，核心流程有测试即可。
- **相关文件**：`tests/`、`__tests__/`、API 路由文件。
- **相关坑**：无。

### 坑 45：新人接手不知道怎么跑起来（轻微）

- **场景**：换电脑、换人接手项目，跑不起来，到处问人。
- **现象**：新成员花费大量时间在环境搭建和启动项目上。
- **根因**：没有 README，环境要求、启动步骤全靠口口相传。
- **解决**：在 README.md 中写清楚：
  1. 环境要求（Node 版本、npm 版本）；
  2. 启动步骤（`npm install` → `npm run dev`）；
  3. 构建步骤（`npm run build`）；
  4. 部署步骤（`git push` 自动触发 Vercel）；
  5. 常见问题（FAQ，如 "npm install 报错怎么办"）。
- **教训**：项目创建时就写 README，不要等到最后；每次新增功能/依赖，同步更新 README；FAQ 从踩坑记录中提取。
- **相关文件**：`README.md`。
- **相关坑**：无。

### 坑 46：低估运维成本，没有预留时间（轻微）

- **场景**：功能开发完就以为结束了，结果部署、调试、修复占用了大量时间。
- **现象**：项目延期，团队疲惫，线上问题频发。
- **根因**：开发计划只看“写代码”的时间，没留调试和部署的窗口。
- **解决**：
  - 开发完成后预留 **30% 时间**给部署 + 调试 + 修复；
  - 小项目也需要预留 **1-2 天**的运维窗口；
  - Vercel 日志是排查 500 的第一入口；
  - 每次部署后至少手动验证 3 个核心流程（登录、添加数据、查看数据）。
- **教训**：制定计划时，开发时间 × 1.3 才是真实工期；凌晨不部署，出问题没人能帮你；下午部署，留出 2 小时调试窗口。
- **相关文件**：项目计划书、发布日历。
- **相关坑**：3.13 坑 43 生产报错无法通知开发者、3.13 坑 44 没有任何测试。

## 3.14 第二阶段专项踩坑

> 本阶段目标：把演示版的浏览器 localStorage 数据迁移到 Supabase PostgreSQL，实现数据永久保存、多设备同步。本节把原第十九节按技术领域重新组织，并与第三卷其他坑交叉链接。

### 3.14.1 部署与函数限制：Vercel Hobby 免费版 Serverless Function 数量限制

- **参考坑**：坑 21
- **场景**：MBS 第二阶段开始把数据持久化到 Supabase，需要更多后端路由。
- **现象**：部署时报错 `No more than 12 Serverless Functions`，无法上线。
- **根因**：Vercel Hobby 免费版最多 12 个 Serverless Function。项目早期 `api/` 目录下每个 `.ts` 路由文件都会被识别为一个独立 Function（`auth.ts`、`customers.ts`、`bookings.ts`、`shops.ts` 等），很快超限。
- **解决**：
  1. `vercel.json` 中配置单一函数入口：
     ```json
     {
       "rewrites": [
         { "source": "/api/(.*)", "destination": "/api/index" },
         { "source": "/(.*)", "destination": "/index.html" }
       ],
       "functions": {
         "api/index.ts": {
           "memory": 256,
           "maxDuration": 10,
           "includeFiles": "api/**"
         }
       }
     }
     ```
  2. 只保留 `api/index.ts` 作为 Vercel 入口，`api/app.ts` 挂载所有路由；
  3. 删除不再需要的独立路由文件（`bookings.ts`、`shops.ts`、`stylists.ts` 等），把功能合并到 `customers.ts`、`auth.ts` 或后续再恢复。
- **教训**：接 Supabase 之前先数 `api/` 下文件数量，超过 10 个就要考虑合并成单一入口。
- **相关文件**：`vercel.json`、`api/index.ts`、`api/app.ts`。
- **相关坑**：3.7 坑 21 Vercel Hobby 函数数量限制。

### 3.14.2 编码与中文破坏：Windows GB2312 编码破坏后端中文文件

- **参考坑**：坑 1、坑 21.5
- **场景**：在 Windows 上维护后端文件，含中文的错误提示、日志文案较多。
- **现象**：本地 `npm run build` 通过，Vercel 部署后 API 返回 500，日志里出现乱码或引号缺失。
- **根因**：Windows 系统被某些软件（如天正给排水）修改默认编码为 GB2312，用 PowerShell `Set-Content` 写入含中文的文件后，UTF-8 中文字符被破坏。
- **解决**：
  - 后端文件统一用 VS Code 编辑，不用 PowerShell 直接写文件；
  - 如果必须通过 PowerShell 传输长文本，用 Base64 解码写入：
    ```powershell
    $b64 = 'Base64字符串'
    $bytes = [System.Convert]::FromBase64String($b64)
    [System.IO.File]::WriteAllBytes('文件路径', $bytes)
    ```
- **教训**：涉及中文的代码文件，永远不要用 PowerShell 直接 `Set-Content`。
- **相关文件**：`api/app.ts`、`api/routes/customers.ts` 等含中文字符串的后端文件。
- **相关坑**：3.1 坑 1 Windows 系统编码破坏文件、3.7 坑 21.5 API 返回 500 Internal Server Error。

### 3.14.3 数据库 RLS 策略：Supabase RLS 策略静默阻止读写

- **参考坑**：坑 35、坑 36
- **场景**：第二阶段新建 `customers`、`employees` 等表后，前端调用 Supabase 插入/查询数据。
- **现象**：调用 Supabase 插入/查询数据时没有任何报错，但数据没写进去，页面也没有反馈。
- **根因**：Supabase 默认启用 Row Level Security（RLS），表没有配置策略时，所有访问都被拒绝。JS SDK 不会抛明显异常，导致问题极难定位。
- **解决**：在 Supabase SQL Editor 中执行：
  ```sql
  ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON customers FOR ALL USING (true);
  ```
- **教训**：每新建一张表，第一时间配置 RLS 策略，否则后续排查会浪费大量时间。
- **相关文件**：`schema.sql`。
- **相关坑**：3.11 坑 35 RLS 策略阻止读写、3.11 坑 36 RLS 导致 API 返回 400 但前端无提示。

### 3.14.4 环境变量配置：环境变量未在 Vercel 配置

- **参考坑**：坑 22
- **场景**：第二阶段接入 Supabase，本地 `.env` 已配置但忘记在 Vercel 配置。
- **现象**：本地 `npm run dev` 能连上 Supabase，Vercel 部署后 API 返回 500 或空数据。
- **根因**：`.env` 文件没有提交到 Git，Vercel 上缺少 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
- **解决**：在 Vercel 项目 Settings → Environment Variables 中添加：
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **教训**：本地 `.env` 和部署平台环境变量是两套东西，接数据库后第一时间在平台配置。
- **相关文件**：`.env`、Vercel 项目设置。
- **相关坑**：3.7 坑 22 环境变量未在部署平台设置。

### 3.14.5 字段映射与数组展开：toSnakeCase 通用转换工具把数组展开为数字 key

- **参考坑**：坑 24.5 第三层根因
- **场景**：第二阶段创建客户时，`tags` 等数组字段需要写入 Supabase。
- **现象**：创建客户时报错 `Could not find the '0' column of 'customers' in the schema cache`。
- **根因**：`api/utils/case.ts` 里的 `toSnakeCase` 函数遍历对象每个 key，把 `tags: ["烫发"]` 转换成了 `{0: "烫发"}`，Supabase 把 `0` 当成列名去插入，从而报错。
- **解决**：`api/routes/customers.ts` 的 POST/PUT 不再使用 `toSnakeCase(body)`，而是手动构建 `insertData` / `updateData`：
  ```typescript
  const insertData: Record<string, any> = {
    id: customerId,
    shop_id: shopId,
    name: body.name || '未命名客户',
    phone: body.phone || '',
  };
  if (body.gender) insertData.gender = body.gender;
  if (body.age !== undefined && body.age !== null) insertData.age = body.age;
  // ... 只写需要的字段
  ```
- **教训**：不要把整个前端对象直接转换后塞进数据库。必须显式字段映射，并过滤数组/嵌套对象。
- **相关文件**：`api/utils/case.ts`、`api/routes/customers.ts`。
- **相关坑**：3.7 坑 24.5 Vercel + Express 请求体解析失败。

### 3.14.6 HTTP 请求头合并：前端 fetch headers 合并顺序错误导致 Content-Type 丢失

- **参考坑**：坑 24.5 第一层根因
- **场景**：第二阶段客户管理接入真实 API，`customerApi.create` 传入自定义 Authorization header。
- **现象**：创建客户时报错 `null value in column "name" of relation "customers" violates not-null constraint`。
- **根因**：`src/api.ts` 的 `http` 工具原来写成：
  ```typescript
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...opts,  // 覆盖前面的 headers
    signal: controller.signal,
  });
  ```
  当 `customerApi.create` 传入 `headers: { Authorization: 'Bearer ...' }` 时，`...opts` 把整个 `opts.headers` 覆盖上来，导致 `Content-Type` 丢失。后端 `express.json()` 不解析无 Content-Type 的请求体，`req.body` 为空。
- **解决**：调整顺序：
  ```typescript
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: controller.signal,
  });
  ```
- **教训**：封装 `fetch` 时，默认 headers 要放在 `...opts` 后面，但又要让自定义 headers 追加而不是覆盖默认值。最稳妥的方式是把 `headers` 单独合并。
- **相关文件**：`src/api.ts`。
- **相关坑**：3.7 坑 24.5 Vercel + Express 请求体解析失败。

### 3.14.7 Vercel Runtime 请求体解析：Vercel Runtime 下 express.json() 读不到请求体

- **参考坑**：坑 24.5 第二层根因
- **场景**：第二阶段部署到 Vercel 后，创建/编辑客户时前端 Payload 正确但后端没收到。
- **现象**：即使修复了 `Content-Type`，浏览器 Network 面板显示 Payload 完全正确，后端返回的 Response 里 `name` 仍是“未命名客户”，`phone` 为空，所有用户填写字段都变成兜底值或 `null`。
- **根因**：在部分 Vercel Node Runtime 版本里，`express.json()` 无法正确读取请求流，或者流被提前消费，导致 `req.body` 为 `{}`。这个行为在本地 `npm run server:api` 完全正常，只有部署到 Vercel 后才暴露。
- **解决**：`api/app.ts` 用自定义 JSON body parser 替代 `express.json()`，直接读流并 `JSON.parse()`：
  ```typescript
  const getRawBody = (req: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => { data += chunk; });
      req.on('end', () => { resolve(data); });
      req.on('error', (err: any) => { reject(err); });
    });
  };

  const jsonBodyParser = async (req: any, _res: any, next: any) => {
    if (req._body) return next();
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) return next();
    try {
      const raw = await getRawBody(req);
      console.log('[body-parser] raw body:', raw);
      req.body = raw ? JSON.parse(raw) : {};
      req._body = true;
      next();
    } catch (err: any) {
      console.error('[body-parser] parse error:', err.message);
      next(err);
    }
  };

  app.use(jsonBodyParser);
  ```
- **教训**：
  - **本地正常 ≠ 线上正常**：`express.json()` 在本地开发完美运行，到 Vercel Serverless 环境可能失效。
  - 请求体解析必须加日志：在 body parser 和路由入口分别打印 `req.body` 和 `content-type`，是定位“前端传了后端没收到”最快的方式。
  - 兜底值会掩盖真实问题：`name || '未命名客户'` 让 bug 看起来像“数据没显示”，实际上后端根本没收到数据。
- **相关文件**：`api/app.ts`。
- **相关坑**：3.7 坑 24.5 Vercel + Express 请求体解析失败。

### 3.14.9 评价系统实战踩坑：代码改了线上不生效、表结构不一致、重复数据

> 本小节记录 2026-06-29 至 2026-06-30 评价系统打通真实数据链路过程中反复踩到的坑。这些问题看似分散，实则围绕同一个主题：**本地代码、GitHub、Vercel、Supabase 四个环境没有同步，且前端 fallback 掩盖了后端真实错误**。

#### 1. Trae `/workspace` 修改不会自动同步到 GitHub

- **场景**：在 Trae 里改好文件后，以为已经 push 到 GitHub，用户本地直接 `git pull` 即可。
- **现象**：用户本地 `git pull` 后没有更新，或线上功能仍显示旧行为。
- **根因**：Trae 的 `/workspace` 是独立沙盒，修改默认只保存在工作区，不会自动 commit/push。
- **解决**：本项目已约定工作流为
  1. Trae 在 `/workspace` 修改代码；
  2. 用户把改动的文件下载到本地 `E:\MBS` 覆盖；
  3. 用户在本地执行 `git add . && git commit -m "..." && git push origin main`；
  4. Vercel 自动从 GitHub 部署。
- **教训**：不要让用户直接 `git pull` 拿 Trae 的修改；每次改完必须明确告诉用户要下载哪些文件。

#### 2. 只改后端文件时 Vercel 前端可能不重新构建

- **场景**：修改了 `api/routes/reviews.ts` 等后端文件，push 后 Vercel 部署状态显示 Ready，但浏览器里运行的还是旧版前端 JS。
- **现象**：Network 里看不到新的 `/api/reviews/...` 请求，JS 文件名（如 `index-Dmdg739j.js`）和上次部署相同。
- **根因**：Vite 给 JS 文件加 content hash，前端源码没变化时 hash 不变；Vercel 可能复用上次构建产物。
- **解决**：
  - 方法 A：在 Vercel Dashboard 找到对应部署，点 **Redeploy** 强制重建；
  - 方法 B：在任意前端文件（如 `src/pages/customer/Review.tsx`）里加一个空行/空格，保存后重新 push，强制 Vite 重新构建。
- **教训**：部署完成后不能只看 Vercel 状态，必须实测浏览器 Network；只改后端也要确认前端构建产物 hash 是否变化。

#### 3. 文件名大小写导致 Git 识别异常

- **场景**：用户说已经下载覆盖了 `review.tsx`，但功能没更新。
- **现象**：Windows 文件系统不区分大小写，Git 却区分；`review.tsx` 和 `Review.tsx` 可能被当成同一文件，导致替换没生效或 Git 状态混乱。
- **解决**：下载覆盖时严格使用仓库中的真实文件名：`src/pages/customer/Review.tsx`（R 大写）。
- **教训**：口头提醒文件名时要强调大小写；Windows 用户特别容易忽略这一点。

#### 4. 前端 fallback 到 mock 数据掩盖后端错误

- **场景**：顾客端提交评价后提示成功，但店铺端看不到；或者页面正常显示，但 Network 里 API 返回 500。
- **现象**：功能看起来正常，实际没有走真实 API，数据没进数据库。
- **根因**：`src/api.ts` 里很多接口在真实 API 失败时会 fallback 到 `mockBookings` / `mockReviews`。
- **解决**：
  - 测试时打开 F12 Network，确认请求真实发生了；
  - 关键接口（如创建评价、查询评价状态）取消静默 fallback，失败时显式提示用户；
  - 后端接口返回具体错误信息，不要只返回 `"操作失败"`。
- **教训**："页面能打开"不等于"功能正常"；线上问题排查必须看 Network 的 Payload、Response、Status。

#### 5. Supabase 表结构和代码预期不一致

- **场景**：顾客端提交评价报 `null value in column "id" of relation "reviews" violates not-null constraint`，后来又报 `null value in column "type"`。
- **现象**：同样的 `reviews` 表，不同字段报错，SQL 执行成功但运行时仍失败。
- **根因**：
  - 实际 `reviews` 表的 `id` 列是 `text` 类型且没有默认值；
  - 表中还存在代码里未声明的 `type` 列，且为 `NOT NULL`；
  - 建表 SQL 被执行了多次，不同来源的 SQL 导致字段差异。
- **解决**：
  - 在 Supabase SQL Editor 执行修复：
    ```sql
    alter table reviews alter column id set default gen_random_uuid()::text;
    alter table reviews alter column type drop not null;
    ```
  - 后端 `INSERT` 时显式生成 `id: randomUUID()`，不依赖数据库默认值；
  - 用 `information_schema.columns` 查看实际表结构，不要只凭代码假设。
- **教训**：数据库 Schema 是真相源，改字段前先查 `information_schema.columns`；多条增量 SQL 叠加执行不会互相破坏，但要确认每条都执行成功。

#### 6. 重复数据导致 `.maybeSingle()` 报错

- **场景**：顾客端重复提交评价多次后，再次进入评价页面，调用 `GET /api/reviews/booking/:bookingId` 返回 500。
- **现象**：错误信息为 `JSON object requested, multiple (or no) rows returned`。
- **根因**：同一个 `booking_id` 在 `reviews` 表中有多条记录，Supabase `.maybeSingle()` 要求最多返回一行。
- **解决**：
  - 后端查询改为取最新一条：
    ```typescript
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ```
  - 前端在列表页预先判断已评价状态，避免用户重复点击"去评价"；
  - 后端 `POST` 接口在插入前检查 `booking_id` 是否已存在，存在则返回 409。
- **教训**：任何用 `.single()` / `.maybeSingle()` 的地方都要考虑数据是否可能重复；防重不仅靠前端，后端必须有唯一性校验。

#### 7. 个人中心缺少"已评价"状态，导致重复点击

- **场景**：用户完成一次服务后评价完，返回个人中心，该预约仍然显示"去评价"按钮。
- **现象**：虽然评价详情页会拦截并提示"已经评价过"，但入口没有变化，用户会反复点击。
- **根因**：`Profile.tsx` 只加载了预约列表，没有加载顾客的评价记录来判断每个预约是否已评价。
- **解决**：
  - 后端新增 `GET /api/reviews/customer/:customerId`；
  - 前端 `Profile.tsx` 加载顾客评价列表，构建 `bookingId → Review` 映射；
  - 已评价的 completed 预约显示"已评价，查看评价"，未评价的显示"去评价"。
- **教训**：状态入口要和后端真实数据对齐，不能依赖下一级页面的拦截。

#### 8. Network 请求名被截断，找不到对应接口

- **场景**：让用户看 `/api/reviews/booking/:bookingId` 请求，用户找不到，只看到 `book_...`。
- **现象**：Network 列表里请求名显示被截断，看起来像直接请求了 booking ID。
- **根因**：请求 URL 较长时，Chrome DevTools 的 Name 列会截断显示，但实际路径是 `/api/reviews/booking/book_xxx`。
- **解决**：点击请求后看 **Headers** 标签页的 `Request URL`，而不是只看 Name 列。
- **教训**：教用户排查时，要说明具体看哪个面板、哪个字段，避免误解。

---

### 3.14.8 Schema 与前端字段对齐：数据库 Schema 字段与前端 payload 不完全对齐

- **参考坑**：坑 37
- **场景**：第二阶段客户表单字段较多，但数据库表结构未完全同步。
- **现象**：前端客户表单传了 `wechat`、`hobbies`、`idCardNumber`、`isReferred`、`referrerName`、`referrerPhone`、`lastServiceItems` 等字段，但 `customers` 表没有对应列。即使请求体解析正常，这些字段也不会被持久化。
- **根因**：演示版为了快速验证 UI，表单字段设计得比较全；但 `schema.sql` 里的 `customers` 表只包含核心业务字段（`name`、`phone`、`gender`、`age`、`birthday`、`tags`、`membership_level`、`balance`、`points` 等）。
- **当前处理**：
  - 核心字段已在 POST/PUT 中手动映射并正确保存；
  - 非常用字段（微信号、身份证号、推荐人信息等）短期忽略，不影响主流程；
  - 长期需要在 `customers` 表新增列，或拆出 `customer_profiles` / `customer_referrals` 扩展表。
- **教训**：
  - 前端表单字段和数据库 Schema 必须同步设计，不能前端加字段、数据库不同步；
  - 每次新增表单字段，先确认数据库有对应列，否则就是“假性保存”。
- **相关文件**：`schema.sql`、`src/pages/shop/CustomerManagement.tsx`、`shared/types.ts`。
- **相关坑**：3.11 坑 37 数据库 Schema 和前端类型不同步、2.3 常规迭代任务标准工作流示例。

---

### 3.14.10 会员体系与客户管理实战踩坑

> 本小节记录 2026-07-01 至 2026-07-03 打通客户管理、会员管理真实数据链路过程中踩到的坑。核心主题是：**seed 数据/前端 fallback/mock 数据会掩盖真实错误，以及字段命名大小写不一致导致筛选失效**。

#### 1. 员工表 seed 缺少 `password_hash`，登录报“手机号或密码错误”

- **场景**：店铺端登录时，`/api/auth/login` 返回 `{"success":false,"error":"手机号或密码错误"}`，但前端却跳转进了首页。
- **现象**：后续请求 `/api/customers` 返回 `登录已过期，请重新登录`，点其他菜单正常。
- **根因**：
  - `seed_basic.sql` 插入 `employees` 时漏了 `password_hash` 字段，Supabase 中该列为 `null`；
  - 后端 `auth.ts` 用 `employee.password_hash !== password` 比对，`null !== '123456'` 为 `true`，返回 401；
  - 前端 `src/api.ts` 在真实登录失败时降级生成 `mock_token`，导致后续真实 API 带上了无效 token，被 `authMiddleware` 拦截。
- **解决**：
  - `seed_basic.sql` 中补齐 `password_hash` 字段，默认值 `'123456'`；
  - `src/api.ts` 取消真实 API 失败后的 mock token fallback，直接抛错；
  - 在 Supabase SQL Editor 重新执行 seed 脚本（仅 push 不会自动更新数据库）。
- **教训**：真实登录接口失败后必须直接失败，不能为了“页面不卡”而生成假 token；seed 数据变更后必须重新在数据库端执行。
- **相关文件**：`seed_basic.sql`、`api/routes/auth.ts`、`src/api.ts`、`src/pages/shop/Login.tsx`。

#### 2. 前端 fallback 到 mock 数据，导致“客户只有 3 个但会员很多”

- **场景**：真实数据库里只有 3 个客户，但页面上会员/客户管理显示的会员数量远多于 3。
- **现象**：筛选、统计和客户管理页看到的不是同一批人。
- **根因**：`src/api.ts` 中 `customerApi.getAll()` 在真实 API 失败时会 fallback 到 `localStorage` 缓存或 `mockCustomers`；本地曾缓存过旧 mock 数据，导致页面展示的是历史 mock 数据。
- **解决**：
  - 清除浏览器 `localStorage` 中的 `mbs_auth_token` 和 `mbs_customers_cache`；
  - 真实 API 失败时不静默 fallback（与坑 1 一起修复）；
  - 重新登录后强制从 `/api/customers` 拉取真实数据。
- **教训**：
  - “页面能打开”不等于“数据是对的”；
  - 缓存 fallback 必须有时效和来源标记，不能无限期使用旧缓存；
  - 排查数据不一致问题时，优先清缓存、看 Network 的 Response。
- **相关文件**：`src/api.ts`、浏览器 DevTools Application → Local Storage。

#### 3. 客户管理页面会员等级标签未随双轨体系更新

- **场景**：业务上已改为双轨会员体系（购买型 VIP + 储值型会员），但客户管理页的分类标签还是“普通用户 / 高级会员 / 股东会员”。
- **现象**：筛选条件、统计卡片、CSV 导出都不符合当前会员体系；会员总数和客户总数口径不一致。
- **根因**：`CustomerManagement.tsx` 仍使用旧的 `MembershipLevel`（`REGULAR / PREMIUM / STOCKHOLDER`），没有接入 `PurchaseVIPLevel` 和 `StoredValueLevel`。
- **解决**：
  - 客户管理页分类标签拆成两组：购买型 VIP（普通用户、普卡/银卡/金卡/钻石 VIP）和储值会员（未储值、储值卡/安心卡/顺心卡/随心卡）；
  - 统计卡片增加“会员总数”并去重（购买型 VIP 或储值会员任一满足即算 1 人），避免分类卡片数字相加超过总客户数；
  - 列表徽章、详情弹窗、CSV 导出同步更新。
- **教训**：会员体系这种核心业务规则变更，必须同时更新所有展示入口和统计口径，不能只改一处。
- **相关文件**：`src/pages/shop/CustomerManagement.tsx`、`shared/types.ts`。

#### 4. 驼峰转换把 `purchase_vip_level` 转成 `purchaseVipLevel`，前端类型却是 `purchaseVIPLevel`

- **场景**：客户管理页购买型 VIP 筛选里，“全部”显示 3 人，但后面每个具体等级（普通用户、普卡、银卡、金卡、钻石）全是 0 人。
- **现象**：储值会员筛选正常，只有购买型 VIP 异常。
- **根因**：`api/utils/case.ts` 的 `toCamelCase()` 把 `purchase_vip_level` 转成 `purchaseVipLevel`，而前端 `Customer` 类型属性是 `purchaseVIPLevel`（VIP 全大写），导致筛选时 `customer.purchaseVIPLevel` 是 `undefined`。
- **解决**：
  - 修复 `toCamelCase()`：转换后将 `Vip` 统一替换为 `VIP`；
  - 同时修复 `toSnakeCase()`：把 `VIP` 先转成 `Vip`，避免 `purchaseVIPLevel` 被转成 `purchase_v_i_p_level`。
- **教训**：
  - 通用大小写转换工具必须处理团队约定的缩写（如 VIP、ID、URL）；
  - 后端返回字段名和前端类型字段名必须完全一致，大小写敏感；
  - 同一缩写在前端/后端命名规范要统一。
- **相关文件**：`api/utils/case.ts`、`src/pages/shop/CustomerManagement.tsx`。

#### 5. 会员管理/客户表格/客户智能召回等页面仍用 `mockCustomers`

- **场景**：客户管理页数据已正确，但“会员管理”“客户表格管理”“客户智能召回”等页面看到的人、数量对不上。
- **现象**：不同菜单统计口径不一致，筛选结果互相矛盾。
- **根因**：这些页面初始状态直接用了 `[...mockCustomers]` 或本地旧缓存，没有从真实 API 拉取数据。
- **解决**：所有客户相关页面统一调用 `customerApi.getAll()`；清除浏览器旧缓存；统一双轨会员体系统计逻辑。
- **教训**：同一类数据的所有展示入口必须走同一套数据源，不允许某个页面私自使用 mockData 或历史缓存。
- **相关文件**：`src/pages/shop/MembershipManagement.tsx`、`src/pages/shop/CustomerTableManagement.tsx`、`src/pages/shop/CustomerRecall.tsx`、`src/api.ts`。

#### 6. 客户画像保存后刷新丢失 / 单客户详情接口缺失

- **场景**：客户画像表单提交提示成功，但重新进入页面看不到已保存的画像内容。
- **现象**：画像数据写不进数据库，或读取时返回空。
- **根因**：
  - 后端缺少 `GET /api/customers/:id` 单客户详情和 `/api/customers/:id/profile` 画像读写接口；
  - `CustomerProfileForm.tsx` 使用原生 `fetch` 直接请求后端，未携带 `Authorization`，被 `authMiddleware` 拦截返回 401。
- **解决**：
  - 后端补充单客户详情和画像 CRUD 接口，并校验店铺归属；
  - 前端统一使用 `customerApi` 并带 token，不再直接写裸 `fetch`。
- **教训**：表单提交和详情读取必须走同一套带认证的 API 抽象层，禁止组件内裸调后端 URL。
- **相关文件**：`api/routes/customers.ts`、`src/pages/shop/CustomerProfileForm.tsx`、`src/api.ts`。

#### 7. `seed-db` 导入失败的三类典型错误

- **场景**：运行 `npm run seed-db` 时，部分表导入成功，部分表失败。
- **现象与根因**：
  1. `Could not find the 'has_booking' column`：Supabase schema 缓存未刷新，字段已存在但 SDK 缓存未更新；
  2. `invalid input syntax for type integer: "4.7"`：`reviews.rating` 是整数，但 mock 数据里给了小数；
  3. `violates foreign key constraint "customer_visit_records_booking_id_fkey"`：到店记录引用了 `bookings` 表中不存在的 `booking_id`。
- **解决**：
  1. 在 SQL Editor 手动执行 `alter table ... add column if not exists` 并 `NOTIFY pgbench, 'reload schema'` 刷新缓存；
  2. `seed-db.ts` 中对评分字段用 `Math.round()` 取整；
  3. 导入到店记录前校验 `booking_id` 是否存在于 `mockBookings` 中，不存在则置 `null`。
- **教训**：seed 脚本失败必须逐条看错误信息，不能只 rerun；导入顺序和外键引用必须和 mock 数据对齐。
- **相关文件**：`scripts/seed-db.ts`、`schema_complete.sql`。

#### 8. Node.js 20 启动时报 `Node.js 20 detected without native WebSocket support`

- **场景**：`npm run dev` 启动后端后立即报错退出。
- **现象**：`api/server.ts` 启动失败，提示缺少原生 WebSocket 支持。
- **根因**：`@supabase/supabase-js` 的 realtime 默认使用原生 `WebSocket`，Node.js 22 以下未内置该 API。
- **解决**：在 `api/db/index.ts` 中动态引入 `ws` 包，并配置到 Supabase client 的 `realtime.transport` 选项。
- **教训**：Node 版本与 SDK 默认行为要匹配；遇到启动期报错优先检查 transport/依赖注入配置。
- **相关文件**：`api/db/index.ts`、`package.json`。

#### 9. API 请求 5 秒超时导致静默 fallback 到 mock 数据

- **场景**：页面看起来正常，但 F12 Console 出现黄色警告“`/api/customers` 请求失败（signal is aborted without reason），将使用 mock 数据”。
- **现象**：Network 中 `/api/customers` 状态为 `(canceled)` 或没有真实请求，数据实际来自 mock。
- **根因**：`src/api.ts` 的 `http` 函数设置了 5 秒超时，Supabase 网络慢时请求被 abort，触发 fallback。
- **解决**：将超时时间延长到 15 秒；同时通过 Network 面板确认请求真实返回 200 且 Response 来自后端。
- **教训**：
  - “页面正常”必须配合 Network 确认数据来自真实 API；
  - 超时 fallback 是双刃剑，既能提升容错也会掩盖真实错误，调试时应先关闭或延长超时。
- **相关文件**：`src/api.ts`。

### 3.14.11 开发环境约定：Trae `/workspace` 修改必须下载到本地后由用户 push 到 GitHub

- **参考坑**：3.14.9 第 1 条
- **场景**：在 Trae 里改好代码后，用户以为已经生效，但本地或线上仍是旧版。
- **现象**：用户反复说“已经更新了但还是不行”，实际上改动还在 Trae 工作区，没有同步到用户本地仓库或 GitHub。
- **根因**：Trae 的 `/workspace` 是独立沙盒，不会自动把修改写回用户电脑，也不会自动 push 到 GitHub。本项目的工作流是 **Trae 编程 → 用户下载到本地 `E:\MBS` → 用户从本地推送到 GitHub → Vercel 自动部署**。AI 曾多次错误地建议“在 Trae 里 push”，导致用户反复无效操作。
- **解决**（本项目固定工作流）：
  1. Trae 改完代码后，明确告诉用户要下载哪些文件到本地 `E:\MBS`；
  2. 用户本地执行 `git status` 确认文件已变更；
  3. 用户本地执行 `git add . && git commit -m "..." && git push origin main`；
  4. Vercel 自动从 GitHub 部署。
- **教训**：
  - Trae 是编辑器/开发环境，不是部署环境；改完必须显式同步到用户真实仓库或服务器；
  - AI 必须记住并遵守项目主人声明的工作流，不能因为 Trae 有终端就默认在 Trae 里 push；
  - 每次涉及部署/推送前，AI 应先复述工作流确认，避免让用户做无用功。
- **相关文件**：`E:\MBS`（用户本地仓库）、`https://github.com/EchoIslands/MBS.git`。
- **金鱼脑备忘录（给 AI 看）**：
  - 用户工作流 = Trae 写代码 → 下载到本地 → 本地 push GitHub；
  - 不要说“在 Trae 里 push”；
  - 不要说“Vercel 自动部署了你直接刷新就行”（除非代码已经到 GitHub）。


---

## 3.15 近期修复与功能新增专项记录

> 本阶段记录 2026-07-14 前后修复的三个核心问题及新增的员工自助资料编辑功能。主题围绕：**真实数据、容错兜底、移动端可用性**。

### 3.15.1 财务报表假数据：趋势图和发型师业绩排名用 `Math.random()` 生成

- **参考坑**：坑 47
- **场景**：财务报表页面的营收趋势图和发型师业绩排名使用随机数生成，无法反映真实经营状况。
- **现象**：切换周/月/季/年视图时，图表数据随机变化；发型师排名与真实结算记录无关。
- **根因**：早期为快速展示 UI，直接用 `Math.floor(Math.random() * ...)` 生成图表数据，没有接入 `settlements` 表。
- **解决**：
  1. `src/pages/shop/FinancialReport.tsx` 的趋势图数据改为基于 `settlements` 真实记录按时间聚合；
  2. 发型师业绩从 `settlements` + `settlement_items` 关联计算，只统计 `payment_status = 'completed'` 的订单；
  3. 核心卡片中的“较昨日 / 较上月”百分比改为真实环比计算。
- **关键验证点**：
  - 同一日期范围多次刷新，趋势数据保持一致；
  - 完成新的结算后，报表数据相应增加；
  - 发型师排名与实际服务金额一致。
- **教训**：
  - 凡是面向经营决策的报表，必须基于真实业务数据，不能为了“看起来有数据”而用随机数；
  - 趋势图聚合要考虑时间边界（本周/本月/本季度/本年），不能简单按条数平均。
- **相关文件**：`src/pages/shop/FinancialReport.tsx`、`api/routes/index.ts`。
- **相关坑**：3.11 坑 37 数据库 Schema 和前端类型不同步、3.7 坑 21.5 API 返回 500。

### 3.15.2 会员管理 500 错误：`/api/referrals` 查询 `referral_records` 失败

- **参考坑**：坑 48
- **场景**：点击“会员管理”菜单，页面报错，后端 `/api/referrals?shopId=shop1` 返回 500 Internal Server Error。
- **现象**：会员管理页面无法打开，Console 显示红色报错。
- **根因**：`api/routes/index.ts` 中 `/api/referrals` 路由对 `referral_records` 表的查询失败时，没有把错误捕获并返回友好响应，而是直接抛出未处理异常，导致整个 API 500。
- **解决**：
  1. 在 `/api/referrals` 路由中增加 try/catch；
  2. 查询失败时返回空数组 `{ success: true, data: [] }` 并记录错误日志，避免阻塞会员管理页面；
  3. 同时检查 `referral_records` 表是否已在 Supabase 中创建（依赖 `schema_complete.sql`）。
- **关键验证点**：
  - 会员管理页面能正常打开；
  - 即使 `referral_records` 表不存在或查询失败，页面也不白屏；
  - Vercel Functions 日志中能看到具体错误信息，便于后续修复。
- **教训**：
  - 列表类接口必须做降级处理，不能因为一个关联表异常就导致整个页面不可用；
  - 500 错误要尽快转化为可观察的日志 + 前端空状态，而不是直接暴露给用户。
- **相关文件**：`api/routes/index.ts`。
- **相关坑**：3.7 坑 21.5 API 返回 500 Internal Server Error、3.11 坑 41 Schema 变更没有迁移脚本。

### 3.15.3 店铺设置白屏：`openingHours` 字段不完整导致崩溃

- **参考坑**：坑 49
- **场景**：点击“店铺设置”菜单，页面无响应或白屏，无法进入。
- **现象**：Console 报错 `Cannot read properties of undefined (reading 'isOpen')`。
- **根因**：
  - `currentShop.openingHours` 中某些天的数据缺少 `isOpen` 字段；
  - 组件渲染时直接访问 `day.isOpen`，遇到 undefined 时报错；
  - 路由守卫只恢复了 `currentEmployee`，没有同步恢复 `currentShop`。
- **解决**：
  1. `src/pages/shop/Manage.tsx` 增加 `normalizeOpeningHours` 函数，把缺失字段用默认值补齐；
  2. 增加 `currentShop` 为空的兜底渲染，避免未加载完成时访问属性；
  3. 用 `useEffect` 在 `currentShop` 恢复后同步表单状态。
- **关键验证点**：
  - 点击店铺设置能正常进入；
  - 营业时间能正常显示和保存；
  - 即使某几天数据缺失，也不会白屏。
- **教训**：
  - 任何从外部（API、localStorage、seed 数据）读入的结构化数据，使用前都要做规范化；
  - 不要假设 seed 数据或历史缓存的字段一定完整。
- **相关文件**：`src/pages/shop/Manage.tsx`。
- **相关坑**：3.3 坑 10 状态管理两层不同步、3.5 坑 17.6 未登录直接访问后台路由导致白屏。

### 3.15.4 员工自助修改头像与手机号

- **参考坑**：坑 50、坑 51
- **场景**：员工（包括 CEO）想修改自己的头像和登录手机号，但找不到入口；早期只有店长/CEO 在“店铺设置”里能改员工头像。
- **现象**：
  - 发型师看板和个人资料弹窗中头像无法点击上传；
  - 个人资料里没有手机号编辑字段。
- **根因**：
  - 头像编辑入口只放在“店铺设置”的员工列表里，普通员工没有权限或找不到；
  - 没有为员工自助更新设计 API 和 UI 入口。
- **解决**：
  1. 后端新增 `PUT /api/employees/me`，允许员工自助修改头像、姓名、手机号、职位、专长、密码；
  2. `src/pages/shop/ShopLayout.tsx` 全局顶部导航增加个人资料弹窗入口，所有角色都能访问；
  3. 弹窗中头像区域可点击，使用原生 `<input type="file" accept="image/*">` 调用系统选择器，**同时支持手机拍照和手机相册、电脑文件选择**；
  4. 图片读取为 base64 后保存，限制 2MB；
  5. 增加手机号编辑字段，保存后同步更新 store 和 localStorage。
- **关键验证点**：
  - CEO/店长/发型师点击右上角头像/姓名都能打开个人资料；
  - 点击头像可上传图片，保存后刷新仍显示新头像；
  - 修改手机号后，用新手机号可以正常登录；
  - 手机端和电脑端都能正常上传。
- **教训**：
  - 员工个人信息修改应该放在全局可访问的位置，而不是藏在管理页面里；
  - 移动端图片上传优先用原生 file input + accept="image/*"，不要自己实现相机调用，浏览器会自动提供拍照/相册选项；
  - 修改登录手机号要同步验证后端唯一性（当前实现未加唯一性校验，后续如需可补充）。
- **相关文件**：`api/routes/index.ts`、`src/api.ts`、`src/store.ts`、`shared/types.ts`、`src/pages/shop/ShopLayout.tsx`、`src/pages/shop/StylistDashboard.tsx`。
- **相关坑**：3.3 坑 9 Zustand Store 刷新页面后数据丢失、3.3 坑 10 状态管理两层不同步、3.6 坑 18 后端 API 返回格式不统一。

### 3.15.5 预约权限控制与发型师调配

- **新增坑**：坑 52、坑 53、坑 54
- **场景**：店铺端预约管理需要支持发型师调配、权限分级操作（完成/取消），同时顾客端可自行取消预约。
- **需求背景**：
  - 店长或 CEO 可修改预约的发型师（调配）；
  - 只有对应服务的发型师或 CEO 能点击「已完成」；
  - 客户未到店时，由客服联系顾客后点击「已取消」，或顾客端自行取消；
  - CEO 拥有所有操作权限。
- **实现方案**：
  1. **后端权限校验**：在 `PUT /bookings/:id` 接口中增加角色校验，区分 CEO、店长、客服、发型师、顾客五种身份；
  2. **发型师调配接口**：新增 `PUT /bookings/:id/barber`，仅店长/CEO 可调用；
  3. **顾客取消预约**：状态更新接口支持 `customerId` 参数，允许预约所属顾客自行取消；
  4. **前端店铺端**：预约详情弹窗根据角色动态显示「调配发型师」「完成服务」「取消预约」按钮；
  5. **前端顾客端**：个人中心的预约详情增加取消按钮，调用时传递 `currentCustomer.id`。

#### 坑 52：权限判断逻辑散落在各处，新增角色时容易漏改

- **场景**：给预约管理加权限控制时，完成按钮、取消按钮、调配按钮各有各的判断逻辑，散落在不同组件和不同文件里。
- **现象**：新增一个角色（如前台）或调整权限时，要改好几个地方，容易漏掉某一处。
- **根因**：权限判断没有统一的封装，每个按钮各自写 `userRole === 'ceo' || userRole === 'shop_manager'` 之类的条件。
- **解决**：
  - 在 `BookingManagement.tsx` 顶部集中定义权限判断函数：
    ```typescript
    const canReassignBarber = userRole === UserRole.CEO || userRole === UserRole.SHOP_MANAGER;
    const canCompleteService = (booking: Booking) =>
      userRole === UserRole.CEO ||
      (userRole === UserRole.STYLIST &&
        (booking.stylistId === currentEmployee?.id || booking.barberId === currentEmployee?.id));
    const canCancelBooking = userRole === UserRole.CEO || userRole === UserRole.CUSTOMER_SERVICE;
    ```
  - 按钮渲染时直接引用这些变量，不要内联写判断；
  - 后端权限校验也集中在路由入口处，不要散落在业务逻辑中间。
- **教训**：
  - 权限判断是高频变更点，必须集中管理；
  - 前端 UI 权限和后端接口权限要双重校验，不能只靠前端隐藏按钮；
  - 新增角色或调整权限时，前端 UI 和后端接口要同步改，缺一不可。
- **相关文件**：`src/pages/shop/BookingManagement.tsx`、`api/routes/index.ts`。
- **相关坑**：3.5 坑 17.5 UI 按钮/功能加不上或显示不出来。

#### 坑 53：`stylistId` / `barberId` 两套命名混用，调配后展示不同步

- **场景**：历史代码中有的地方用 `barberId` / `barberName`，有的地方用 `stylistId` / `stylistName`，字段含义相同但命名不一致。
- **现象**：调配发型师后，列表里显示的还是旧发型师名字，或者筛选时对不上。
- **根因**：
  - `Booking` 类型同时存在 `barberId/barberName` 和 `stylistId/stylistName` 两套字段；
  - 有的组件读 `barberName`，有的读 `stylistName`；
  - 调配接口只更新了其中一套，另一套没同步。
- **解决**：
  1. 在 `BookingManagement.tsx` 中增加统一的读取函数：
     ```typescript
     const getBarberName = (booking: Booking) =>
       booking.stylistName || booking.barberName || '';
     ```
  2. 调配成功后，同时更新两套字段：
     ```typescript
     setViewingBooking((prev) =>
       prev
         ? { ...prev, stylistId: stylist.id, stylistName: stylist.name, barberId: stylist.id, barberName: stylist.name }
         : null
     );
     ```
  3. 长期建议：统一字段命名为一套（如全部用 `stylistId/stylistName`），逐步废弃 `barberId/barberName`。
- **教训**：
  - 同一个业务概念只能有一套命名，双轨命名是数据不一致的温床；
  - 历史遗留的双轨字段，过渡期要做兼容读取和双写，不能只改一半；
  - 类型定义是真相源，字段命名统一应该从 `shared/types.ts` 开始。
- **相关文件**：`src/pages/shop/BookingManagement.tsx`、`shared/types.ts`、`api/routes/index.ts`。
- **相关坑**：3.11 坑 37 数据库 Schema 和前端类型不同步、3.14.10 第 4 条驼峰转换大小写问题。

#### 坑 54：顾客取消预约时没有传 `customerId`，后端权限校验报 403

- **场景**：顾客端个人中心取消自己的预约，后端返回 403「无权取消该预约」。
- **现象**：店铺端客服取消没问题，但顾客端取消报权限不足。
- **根因**：
  - 后端 `PUT /bookings/:id` 的取消权限校验最初只考虑了员工角色（CEO、客服），没考虑顾客自己取消的场景；
  - 顾客端调用时没有传递自己的 `customerId`，后端不知道是谁在取消；
  - `authMiddleware` 只解析员工 token，顾客 token 走另一套逻辑（或直接传 customerId 参数）。
- **解决（最终方案，2026-07-16 更新）**：
  - 2026-07-15 的初步方案只在原接口里增加 `customerId` 校验，但没有解决顾客端没有员工 token 的问题；
  - 2026-07-16 最终方案：后端新增独立接口 `PUT /api/bookings/:id/cancel`，**不经过 `authMiddleware`**，仅校验 `customerId` 是否等于预约的 `customer_id`；
  - 前端 `bookingApi.updateBookingStatus` 在 `status === 'cancelled' && customerId` 时调用新接口；
  - 员工端取消仍走原 `PUT /bookings/:id` 接口。
- **教训**：
  - 权限设计时要列全所有操作主体：员工（各角色）、顾客本人、系统自动操作，不要只想着后台员工；
  - 顾客端和员工端是两套身份体系，**不能让顾客接口依赖员工 token**；
  - 同一个操作涉及两类用户时，应提供独立接口或在同一接口中支持两种认证方式；
  - 403/401 错误要给明确提示，并追溯到认证层，不能只改权限判断代码。
- **相关文件**：`api/routes/index.ts`、`src/api.ts`、`src/pages/customer/Profile.tsx`。
- **相关坑**：3.10 安全相关、3.6 坑 18 后端 API 返回格式不统一、3.15.6 顾客取消预约真实修复。

- **关键验证点**：
  - CEO 登录：能看到调配、完成、取消所有按钮，且都能操作；
  - 店长登录：能看到调配和取消按钮，看不到完成按钮（除非自己是该预约的发型师）；
  - 发型师登录：只能完成自己服务的预约，不能调配、不能取消；
  - 客服登录：能取消预约，不能调配、不能完成；
  - 顾客端：能取消自己的待确认/已确认预约；
  - 调配后，列表和详情的发型师名字同步更新；
  - 无权限用户直接调用 API 时返回 403（用 Postman 或 curl 测试）。
- **教训**：
  - 权限控制是多维度的（角色 + 资源归属 + 操作类型），设计时要画权限矩阵；
  - 前端隐藏按钮只是体验优化，后端接口校验才是安全底线；
  - 顾客端和员工端是两套身份体系，接口设计时要同时考虑；
  - 字段命名统一要尽早做，双轨运行越久，改起来越痛。

### 3.15.6 2026-07-16 定位失败兜底距离、网页提醒限制、顾客取消预约真实修复

> 本阶段记录 2026-07-16 一次会话中连续修复的三个问题：排队页距离显示错误、提醒按钮在手机浏览器无效、顾客端取消预约失败。

#### 问题 1：排队页到店距离显示 1km（实际十几公里）

- **场景**：顾客用手机网页预约后，排队页面显示的到店距离只有 1km，与实际位置相差甚远。
- **根因**：
  1. `shops` 表的 `latitude`/`longitude` 为 0，代码拿不到真实店铺坐标，fallback 到默认 1km；
  2. `Queue.tsx` 中 `getCurrentPosition` 使用 `enableHighAccuracy: false` 和 `maximumAge: 60000`，导致定位精度低或使用缓存位置；
  3. 手机自带浏览器定位权限受限时，定位直接失败，仍 fallback 到 1km，且没有任何提示。
- **解决**：
  1. 在 Supabase 中更新 `shops.latitude` 和 `shops.longitude` 为店铺真实高德坐标；
  2. `Queue.tsx` 改为 `enableHighAccuracy: true`、`maximumAge: 0`、`timeout: 15000`；
  3. 增加 `locationError` 状态，定位失败时显示“定位未获取，请允许浏览器使用位置权限，或通过微信打开本页面”，不再显示误导性的 1km。
- **关键验证点**：
  - 微信内置浏览器能正确获取定位并显示真实距离；
  - 手机自带浏览器定位失败时显示“定位未获取”而不是 1km；
  - 店铺坐标变更后同步更新 `shared/mockData.ts` 中的 mock 店铺坐标，避免重新 seed 时覆盖。
- **教训**：
  - 距离计算依赖店铺经纬度，文字地址填得再对也没用；
  - 网页定位必须有降级提示，不能 silent fallback 到默认值；
  - 浏览器定位 API 在非 HTTPS、无权限、部分内置浏览器中会被拦截，要管理用户预期。
- **相关文件**：`src/pages/customer/Queue.tsx`、`schema.sql`、`shared/mockData.ts`。

#### 问题 2：提醒按钮在微信能开关，手机浏览器里无效

- **场景**：排队页面“提醒”开关在微信内置浏览器能正常开启关闭，但用手机自带浏览器直接打开时无法真正提醒。
- **根因**：
  - 提醒功能依赖浏览器的 `Notification` API；
  - 微信内置浏览器通常支持或默认允许通知权限；
  - 手机自带浏览器可能不支持 `Notification` API，或权限被系统/用户拒绝。
- **解决**：
  - 增加 `notificationPermission` 状态检测；
  - 点击开启提醒时自动调用 `Notification.requestPermission()` 请求权限；
  - 根据权限状态显示不同提示：
    - 不支持：`当前浏览器不支持系统通知`
    - 被拒绝：`通知权限被拒绝，请前往浏览器设置开启`
    - 已授权：显示铃声选项。
- **关键说明（必须告知用户）**：
  - 网页提醒**不能关联手机系统铃声**，它只能播放网页内的 Web Audio 提示音和浏览器通知；
  - 铃声选择即便加上，也只是网页内提示音的风格选择，无法调用手机铃声。
- **教训**：
  - 网页能力边界要在一开始就讲清楚，避免用户期待网页能像 App 一样控制系统铃声；
  - 浏览器通知权限状态要显式反馈给用户，不要 silent 失败。
- **相关文件**：`src/pages/customer/Queue.tsx`。

#### 问题 3：顾客端取消预约按钮点击后显示“取消预约失败”

- **场景**：顾客在个人中心查看预约详情，点击“取消预约”，弹窗确认后提示“取消预约失败”。
- **根因**：
  - 后端 `PUT /bookings/:id` 受 `authMiddleware` 保护，需要员工 JWT token；
  - 顾客端没有员工 token，`Authorization` 头为空或无效，请求直接被 401/403 拒绝；
  - 坑 54 之前的修复只在原接口里增加了 `customerId` 校验，但没有解决“顾客端无法通过员工认证”的问题。
- **解决**：
  1. 后端新增独立接口 `PUT /api/bookings/:id/cancel`，**不需要 `authMiddleware`**，仅校验 `customerId` 是否等于预约的 `customer_id`；
  2. 前端 `bookingApi.updateBookingStatus` 在 `status === 'cancelled' && customerId` 时调用新接口；
  3. 新接口增加状态校验：已取消/已完成的预约不能重复取消。
- **关键验证点**：
  - 顾客端能成功取消自己的待确认/已确认预约；
  - 其他顾客的 customerId 无法取消别人的预约（返回 403）；
  - 员工端原有取消逻辑不受影响；
  - 已完成预约不能被取消。
- **教训**：
  - 顾客端和员工端是两套身份体系，不能让顾客接口依赖员工 token；
  - 同一个操作（取消预约）如果涉及两类用户，应该提供两个独立接口或在同一接口中支持两种认证方式；
  - 修复问题时要追溯到认证层，不能只改权限判断代码。
- **相关文件**：`api/routes/index.ts`、`src/api.ts`、`src/pages/customer/Profile.tsx`。

#### 本次会话的工作流教训（金鱼脑强化版）

- 用户工作流：**Trae `/workspace` 写代码 → 用户下载到本地 `E:\MBS` → 本地 `git push origin main` → Vercel 自动部署**。
- AI 多次错误建议“在 Trae 里 push”或“Vercel 自动部署后直接刷新”，导致用户做了一堆无效操作。
- **push 前必须跑 `npm run build`**，不能只跑 `npm run check`。`tsc` 通过不代表 Vite 生产构建能通过，本次 `Booking.tsx` 的 `Duplicate declaration` 就是血淋淋的教训。
- 以后任何涉及部署的回复，必须先确认代码是否已经在 GitHub 上，再告诉用户下一步。

---

# 第四卷：治理机制

## 4.1 需求变更管理

> 项目失控往往不是技术问题，而是范围问题。需求不断蔓延时，AI 会在局部过度优化，导致整体崩盘。本章把“变更”变成可控流程。

### 4.1.1 需求变更流程（任何新需求必须走这四步）

**第一步：先更新任务书/计划书**
- 任何新需求（新增字段、新页面、新角色权限）必须先落到 [`后续开发计划书.md`](file:///workspace/后续开发计划书.md) 或本章节中。
- 不允许口头需求直接进代码。

**第二步：定义验收标准**
- 在动手前写清楚：“这个功能做完后，我怎么验证它是好的”。
- 验收标准示例：
  ```
  功能：添加客户时保存微信号
  验收标准：
  1. 表单出现“微信号”输入框
  2. 提交后 Payload 包含 wechat 字段
  3. 数据库 customers.wechat 列写入对应值
  4. 刷新页面后仍能看到微信号
  ```

**第三步：评估影响范围**
- 新需求会影响哪些文件？
- 是否需要改数据库 Schema？
- 是否影响现有 API 字段映射？
- 是否影响前端类型定义 `shared/types.ts`？

**第四步：再动手开发**
- 一次只做一个需求，改完立即验证，不堆代码。

### 4.1.2 MVC（最小可行版本）原则

每个版本发布前，把功能分成两类：

| 类型 | 定义 | 处理方式 |
|------|------|---------|
| **必须有（Must have）** | 没有这个功能，版本无法交付 | 必须完成，阻塞发布 |
| **最好有（Nice to have）** | 有了更好，没有也能用 | 可延期到下一版 |

**MBS 当前示例**：
- **Must have**：登录、客户增删改查、数据持久化到 Supabase
- **Nice to have**：客户画像 24 字段全部可编辑、微信/身份证号等扩展字段、复杂报表

**为什么重要**：防止“演示版”无限膨胀成“完美版”，确保每个版本都是可交付的。

### 4.1.3 范围蔓延的红色信号

出现以下情况，说明范围在失控：
- 一个 bug 修复顺手加了 3 个新功能；
- 原计划 2 天完成的需求，做了 1 周还在加字段；
- 验收时发现需求方根本没提过某些字段；
- AI 回复中出现“顺便优化了 XXX”。

**应对措施**：
1. 暂停当前改动；
2. 把新想法记到“待办需求池”；
3. 回到原任务验收标准；
4. 确认是否需要更新任务书。

## 4.2 团队协作规范

> 你和 Trae 之间也是一种协作。沟通方式统一了，AI 才能给出风格一致、边界清晰的回答。

### 4.2.1 给 Trae 发指令的标准模板

```
任务：[具体要做什么，一句话说清楚]

背景：[为什么要做？当前是什么状态？已经尝试过什么？]

限制：[不要改什么？边界条件是什么？哪些文件不要动？]

验收标准：[怎么算完成？需要看到什么结果？]
```

**示例（好）**：
```
任务：修复添加客户时姓名电话丢失的问题

背景：前端 Payload 正确，但后端返回的 name 是“未命名客户”，phone 为空。
已确认 express.json() 在 Vercel 上读不到 body。

限制：不要改数据库 Schema，不要改前端表单结构。

验收标准：
1. npm run build 通过
2. 本地 npm run server:api 能启动
3. 浏览器添加客户后，Response 与 Payload 一致
4. Supabase 中 name、phone 字段有值
```

**反例（差）**：
```
客户添加不了，修一下。
```

### 4.2.2 报错信息提交格式

遇到 bug 时，按以下格式提交信息，能大幅减少反复沟通：

```
错误现象：[一句话描述你看到的问题]

操作步骤：
1. [第一步]
2. [第二步]
3. [第三步]

期望结果：[你期望发生什么]

实际结果：[实际发生了什么，附截图/日志/Network 数据]

已尝试：[你已经试过的解决方法]

环境信息：[浏览器、分支、Vercel 部署状态等]
```

**示例**：
```
错误现象：添加客户后显示“未命名客户”，电话为空。

操作步骤：
1. 登录店长账号
2. 进入客户管理
3. 点击添加客户
4. 填写姓名“亚列”、电话“15900000001”
5. 点击保存

期望结果：列表显示“亚列”，电话显示“15900000001”。

实际结果：列表显示“未命名客户”，电话为空。
浏览器 Network Payload：{name:"亚列", phone:"15900000001"}
浏览器 Response：{name:"未命名客户", phone:"", ...}

已尝试：刷新页面、换浏览器登录，问题一样。

环境信息：main 分支，Vercel 已部署。
```

## 4.3 回滚决策流程

> 出现以下情况，应该立即回滚到上一个稳定版本，而不是继续硬修。

### 4.3.1 回滚触发条件

| 情况 | 是否回滚 | 说明 |
|------|---------|------|
| 部署后核心功能（登录/客户增删改查）不可用 | 立即回滚 | 影响业务，先恢复再排查 |
| 连续 3 次修复同一问题仍未解决 | 回滚重开 | 说明方向错了，需要重新分析 |
| 改动引入了新的未知错误 | 回滚 | 防止灾难扩大 |
| 只是某个次要功能异常 | 评估后决定 | 不影响主流程可暂缓 |

### 4.3.2 回滚命令

```bash
git log --oneline -10          # 找到上一个稳定 commit
git reset --hard <commit-id>   # 回到稳定版本
git push --force               # 强制推送（谨慎！）
```

### 4.3.3 回滚原则

- 宁可损失一次改动，也不要让生产环境长期带病运行；
- 回滚前先通知相关方；
- 回滚后必须线上验证核心功能恢复；
- 回滚不是终点，24 小时内要完成根因分析和修复方案。

## 4.4 技术债务管理

> 当前文档里记录了大量“临时解决方案”：兜底值、手动字段映射、自定义 body parser。这些债务如果不管理，会成为下一阶段的隐患。本章把它们变成可追踪的项目资产。

### 4.4.1 当前技术债务清单

| 债务项 | 位置 | 临时方案 | 风险 | 状态 / 计划 |
|--------|------|---------|------|------------|
| 自定义 JSON body parser 替代 `express.json()` | `api/app.ts` | 手动读流解析 | 其他 JSON 路由可能受影响；依赖 Vercel Runtime 细节 | 🟡 待验证：本地和 Vercel 上暂时稳定，长期建议回退到标准 body parser |
| 客户字段手动映射 | `api/routes/customers.ts` | 每个字段单独 if 判断 | 新增字段容易漏；代码冗长 | ✅ 已偿还（2026-07-03）：引入 `api/utils/customerMapper.ts` 字段白名单映射工具 |
| `name` / `phone` 兜底值 | `api/routes/customers.ts` | `body.name \|\| '未命名客户'` | 掩盖 body 解析失败的真相 | ✅ 已偿还（2026-07-03）：改为 `validateCustomerData` 校验，缺失时返回 400 |
| 前端表单字段与 DB Schema 不同步 | `CustomerManagement.tsx` / `schema.sql` | `wechat`、`idCardNumber` 等字段未持久化 | 用户以为存了，实际没存 | ✅ 已偿还（2026-07-03）：扩展 customers 表并同步 seed-db；新增 customer_profiles / customer_visit_records |
| 大量 API 路由被删除后未恢复 | `api/routes/` | 只保留 `auth.ts` / `customers.ts` | 预约、店铺、技师等功能不可用 | 🔴 v3.0 按需逐步恢复 |
| 无自动化测试 | 整个项目 | 全靠手动验证 | 改一处坏十处 | 🔴 v3.0 引入 Vitest + 核心 API 测试 |
| localStorage 与 Zustand 两层缓存 | `src/api.ts` / `store.ts` | API 失败时回退到缓存 | 可能显示过期数据 | 🟡 部分偿还（2026-07-03）：登录和关键查询失败不再静默 fallback 到 mock；仍保留少量缓存兜底 |
| `USE_REAL_API` 硬编码为 `true` | `src/api.ts` | 无法在生产环境快速切回 mock | Supabase 故障或网络异常时系统完全不可用 | ✅ 已偿还（2026-06-26）：改为读取 `VITE_USE_REAL_API` 环境变量 |
| 查询端仍用 `toCamelCaseList` 自动转换 | `api/routes/customers.ts` GET 路由 | 查询结果批量 camelCase 转换 | 与写入端手动映射不对称；未来字段名冲突时难排查 | ✅ 已偿还（2026-06-26）：使用 `mapCustomerFromDB` 显式字段映射 |
| API 请求超时过短 | `src/api.ts` | 5 秒超时 | Supabase 网络慢时请求被 abort，静默 fallback | ✅ 已偿还（2026-07-03）：延长至 15 秒，并记录到宪章 |
| 财务报表趋势图/排名用随机数 | `src/pages/shop/FinancialReport.tsx` | `Math.random()` 生成假数据 | 经营者无法看到真实经营状况 | ✅ 已偿还（2026-07-14）：改为基于 `settlements` 真实记录聚合计算 |
| 员工头像用 base64 存在数据库 | `employees.avatar` | 前端图片转 base64 后存字符串 | 单张图片过大时增加数据库体积和传输开销；未来应迁移到对象存储（如 Supabase Storage / 阿里云 OSS） | 🟡 新增债务（2026-07-14）：当前方案满足 MVP，图片限制 2MB；长期建议接入对象存储 |
| 手机号修改未校验唯一性 | `api/routes/index.ts` `PUT /api/employees/me` | 直接更新 phone 字段 | 可能导致重复手机号，影响登录 | 🟡 新增债务（2026-07-14）：当前满足自助修改需求；生产环境建议加唯一性校验和冲突提示 |
| `stylistId` / `barberId` 两套命名混用 | `shared/types.ts`、各预约相关组件 | 同时存在两套字段，兼容读取和双写 | 数据不一致来源，新增功能容易只改一套 | 🟡 新增债务（2026-07-15）：过渡期用 getBarberName() 统一读取和双写；长期建议废弃 barber 命名，统一用 stylist |
| 顾客端与员工端认证体系不统一 | `api/routes/index.ts`、`src/api.ts` | 员工走 JWT token + authMiddleware，顾客走 customerId 参数传递 | 权限校验逻辑分散，顾客身份易伪造（参数传递）；是小程序与 H5 共用安全接口的前提 | 🔴 新增债务（2026-07-15）：用户决定待小程序资质到位后再启动；届时统一为顾客端签发 JWT，替代明文 customerId |
| 预约状态变更缺少操作日志 | `api/routes/index.ts` | 直接更新 status，不记录操作人和操作时间 | 出问题无法追溯是谁、什么时候改的状态 | 🟡 新增债务（2026-07-15）：当前功能满足 MVP；长期建议增加 booking_status_logs 表，记录每次状态变更的操作人、时间、原因 |

### 4.4.2 债务偿还计划

**v2.3（客户管理收尾与稳定性加固，2026-07-03 前后）**
- [x] 验证客户画像 24 字段在客户表格管理页面可编辑、可持久化；
- [x] 引入字段白名单映射工具，替代 `customers.ts` 中手动 if 判断；
- [x] 去掉 `name` / `phone` 兜底值，改为请求体验证并返回明确 400 错误；
- [x] 回归测试：登录 → 客户管理 → 客户表格管理 → 会员管理 → 客户智能召回 → 客户画像；
- [x] 更新宪章 4.4.1 中已偿还债务的状态标记。

**v2.4（财务报表真实化、店铺设置稳定性、员工自助资料，2026-07-14）**
- [x] 财务报表趋势图和发型师业绩排名改为基于 `settlements` 真实数据计算；
- [x] `/api/referrals` 增加容错，避免会员管理页面因单表异常整体 500；
- [x] 修复店铺设置 `openingHours` 不完整导致的白屏；
- [x] 新增员工自助修改头像、手机号等个人信息功能；
- [x] 头像上传同时支持手机拍照/相册选择和电脑文件选择；
- [ ] 评估并补充手机号修改的唯一性校验（可选，视业务需求）；
- [ ] 评估头像存储迁移到对象存储的可行性（可选，图片量大时）。

**v2.5（预约权限控制与发型师调配，2026-07-15）**
- [x] 后端 `PUT /bookings/:id` 增加基于角色的权限校验（CEO/店长/客服/发型师/顾客）；
- [x] 新增 `PUT /bookings/:id/barber` 发型师调配接口，仅店长/CEO 可调用；
- [x] 店铺端预约管理页面增加发型师调配下拉框和确认按钮；
- [x] 店铺端按钮按权限动态显示（调配/完成/取消）；
- [x] 顾客端支持自行取消预约（传递 customerId 参数）；
- [ ] 统一 `stylistId/stylistName` 与 `barberId/barberName` 命名，废弃 barber 命名（可选，债务偿还）；
- [ ] 顾客端接入 JWT 认证，统一 authMiddleware（可选，生产环境建议）；
- [ ] 预约状态变更增加操作日志表 booking_status_logs（可选，审计需求）。

**v2.6（开单结算、积分系统、定位修复、微信渠道技术准备，2026-07-16 ~ 2026-07-17）**
- [x] 修复店铺端完成服务后跳转结算，微信结算结果未记录服务项的问题；
- [x] 新增 `settlements` 结算记录表，持久化结算明细；
- [x] 新增积分系统：按实际消费金额 1:1 累计积分，`customers.points` 字段及客服管理入口；
- [x] 修改评价成功页：将"获得10元优惠券"改为"获得10个积分"，移除"新人体验券，满50可用"；
- [x] 修复手机网页端到店距离显示错误（店铺经纬度更新 + 高精度定位 + 定位失败提示）；
- [x] 修复顾客端取消预约权限问题，新增顾客专用取消接口；
- [x] 顾客端随机发型师自动匹配：基于真实预约档期计算，结果传递到后端；
- [x] 店铺端发型师数据隔离：发型师仅能看到分配给自己的预约，支持查看详情、完成服务、开单；
- [x] 修复 `npm run check` 类型错误；
- [x] 制定微信渠道接入规划：明确小程序优先支付、公众号做宣传/预约入口；
- [x] 小程序前期技术准备：`customers` 表扩展微信字段，`payments` 支付记录表设计，`shared/types.ts` 同步；
- [ ] 顾客端鉴权改造（token 替代明文 customerId）：用户决定暂时不做，待资质到位后再启动。

**v3.0（功能恢复与质量，预计 3-5 天）**
- [ ] 逐步恢复预约、店铺、技师等核心路由；
- [ ] 引入 Vitest，为核心 API（登录、客户 CRUD、画像 CRUD）写集成测试；
- [ ] 接入 Sentry 或类似错误监控；
- [ ] 评估是否回退自定义 body parser。

### 4.4.3 重构触发条件

当以下情况出现时，必须启动重构，而不是继续打补丁：

1. **单一文件超过 500 行**
   - 例如 `customers.ts` 超过 500 行时，应拆分为 `customers/queries.ts`、`customers/validators.ts`、`customers/mapper.ts`。

2. **同一个手动映射逻辑出现 3 次以上**
   - 说明应该抽象成通用 mapper。

3. **新增一个字段需要改 5 个以上文件**
   - 说明类型/映射/校验没有统一入口。

4. **本地正常但线上反复出问题**
   - 说明架构依赖了环境细节，需要重新设计（如 body parser、环境变量读取）。

5. **修复一个 bug 引入了两个新 bug**
   - 说明代码耦合过高，需要重构而非继续修。

### 4.4.4 如何评估一次重构是否值得做

| 问题 | 如果答案是“是”，则值得重构 |
|------|------------------------|
| 这个临时方案是否阻碍了下一个功能？ | 是 |
| 是否每周都要为同一段代码打补丁？ | 是 |
| 新人能否在 10 分钟内看懂这段代码？ | 否 |
| 这段代码是否只在特定环境（如 Vercel）才能工作？ | 是 |
| 是否因为这段代码导致测试无法写？ | 是 |

**重构原则**：
- 小步重构，每次只改一个模块；
- 重构前必须有测试或至少能手动验证的路径；
- 重构后不改变外部行为（只改内部结构）；
- 如果重构风险大，先备份分支或打 tag。

## 4.5 版本与发布

> 版本号不仅是标签，更是团队对当前系统状态的共识。本章规定 MBS 项目的版本号规则、发布前检查清单和发布后验证事项。

### 4.5.1 版本号规则（语义化版本）

采用 `MAJOR.MINOR.PATCH` 格式：

| 位数 | 递增条件 | MBS 示例 |
|------|---------|----------|
| MAJOR | 不兼容的 API 或数据变更 | v2.0：接入 Supabase 后数据持久化方案变更 |
| MINOR | 向后兼容的功能新增 | v2.1：客户画像字段扩展 |
| PATCH | 向后兼容的问题修复 | v2.1.1：修复 body parser 边缘情况 |

**标签约定**：
- 稳定版本打 tag：`git tag v2.1.0`
- 预发布版本加后缀：`v2.2.0-beta.1`
- 紧急修复单独打 tag：`v2.1.1-hotfix.1`

### 4.5.2 发布前检查清单

- [ ] 当前分支已通过 `npm run build`；
- [ ] 本地后端 `npm run server:api` 能正常启动；
- [ ] 浏览器实测核心流程（登录、添加客户、查看客户列表）；
- [ ] 数据库迁移脚本（如有）已在本地/测试环境执行并验证；
- [ ] Vercel 环境变量已配置且与本次发布所需一致；
- [ ] `vercel.json` 已检查，未超过免费版 Function 数量限制；
- [ ] 已知技术债务已更新到 4.4.1；
- [ ] 已打 tag：`git tag vX.Y.Z`。

### 4.5.3 发布后验证

1. **部署状态**：确认 Vercel Deployment 为 Ready；
2. **强制刷新**：`Ctrl+Shift+R` 清除浏览器缓存；
3. **核心流程验证**：
   - 登录是否正常；
   - 添加客户后数据库是否有值；
   - 编辑/删除客户是否生效；
4. **日志检查**：Vercel Functions Logs 无 500 或异常堆栈；
5. **通知相关方**：在团队频道同步版本号和变更摘要；
6. **异常回滚**：如发现核心功能不可用，立即执行 4.3 回滚决策流程。

## 4.6 给 AI 的协作提示词集（面向非技术项目主人）

> 本章供项目主人复制使用。通过标准化指令，让 AI 快速理解你的角色、工作流和期望，减少沟通成本和重复踩坑。

### 4.6.1 开场白/身份设定

每次开启新的复杂任务，或 AI 似乎忘记上下文时，先粘贴下面这段：

```
我是 MBS 项目的主人，编程小白。我的工作流是（这是铁律，不许忘）：
1. 你在 Trae 里生成/修改代码；
2. 我下载到本地 Windows 电脑的 E:\MBS；
3. 我本地运行 npm run dev 测试；
4. 测试通过后我从本地推送到 GitHub；
5. Vercel 自动从 GitHub 部署。

绝对不要做的事：
- 不要让我在 Trae 里 push；
- 不要说“Vercel 自动部署了你刷新一下”，除非代码已经到 GitHub；
- 不要假设 Trae /workspace 的改动会自动同步到我本地或线上。

请把我当非技术人员对待：
- 每一步给出明确命令；
- 告诉我命令在哪里运行（Trae 终端 / PowerShell / Supabase SQL Editor）；
- 遇到报错先解释原因，再给可执行的解决方案；
- 涉及部署/推送时，先复述我的工作流确认。
```

### 4.6.2 通用任务模板

```
任务：[一句话说清楚要做什么]

背景：[当前是什么现象？已经尝试过什么？有没有报错？]

限制：[不要改哪些文件/功能？范围边界是什么？]

验收标准：[怎么算完成？需要看到什么结果？]
```

**示例**：

```
任务：修复客户管理页面添加客户后姓名丢失的问题

背景：点击添加客户，填了姓名和电话，提交后列表显示"未命名客户"，电话为空。
已确认 Payload 里 name 和 phone 是正确的。

限制：不要改数据库 Schema，不要改前端表单结构。

验收标准：
1. 添加客户后列表显示正确姓名和电话；
2. 刷新页面后数据还在；
3. Network 中 /api/customers POST 返回 success: true。
```

### 4.6.3 调试类提示词

```
我本地运行 [命令] 时报错，报错信息如下：
[粘贴完整报错]

请帮我：
1. 用一句话解释这个错误是什么意思；
2. 告诉我在哪个文件修复；
3. 给出具体修复步骤；
4. 修复后我需要执行什么命令验证。
```

### 4.6.4 数据库/字段变更类提示词

```
我需要[新增/修改]一个字段/表，叫 [字段名]。

请告诉我：
1. 需要改哪些文件；
2. 数据库要执行什么 SQL；
3. seed 数据是否需要更新；
4. 前端哪里会受影响；
5. 完整测试步骤。
```

### 4.6.5 拒绝范围蔓延

```
当前只修复 [具体问题]，不要顺手优化其他功能或重构无关代码。
如果发现问题但不在本次任务范围，请单独列出，由我决定是否另开任务。
```

### 4.6.6 验收确认

```
改完后请告诉我：
1. 具体改了哪些文件；
2. 本地需要执行什么命令验证（按顺序）；
3. 浏览器里需要检查哪些点；
4. 是否需要更新数据库或重新运行 npm run seed-db。
```

### 4.6.7 高效报错格式

当 AI 解释报错时，要求它按下面格式回复：

```
- 错误位置：哪个文件 / 哪一行 / 哪个接口
- 错误原因：一句话解释
- 解决方案：分步骤说明
- 我需要执行的命令：直接可复制
```

### 4.6.8 使用建议

- **复杂任务**先用「开场白」让 AI 了解上下文；
- **调试时**优先用「调试类提示词」并粘贴完整报错；
- **想控制范围**时一定加上「拒绝范围蔓延」；
- **每次改完后**用「验收确认」要求 AI 给出测试清单；
- **不要只发截图**：截图+文字描述一起给，AI 更容易定位。

---

## 4.7 微信生态接入决策与规范

> 本章记录 MBS 项目接入微信公众号、微信小程序、H5 网页三端的**决策背景、核心约束、与现有系统的关联规范**。
> 
> **与《微信渠道接入规划与指南.md》的分工**：
> - **本宪章（4.7）**：记"为什么做、必须遵守什么、关键风险是什么、当前状态是什么"；
> - **指南文档**：记"怎么做、具体步骤、接口说明、推进清单"。
> 两文档方向必须一致：宪章定原则，指南给路径。

### 4.7.1 总体策略

1. **小程序优先支付**：交易闭环优先在小程序内跑通，H5/网页端暂时不做支付。
2. **公众号做宣传与预约入口**：公众号作为内容传播、预约引导、消息触达的渠道，不强制接入 H5 支付。
3. **H5/网页端保留非支付功能**：预约、排队、查看套餐、会员信息、评价等功能保持可用；需要付费时引导用户"去小程序完成支付"。
4. **三端数据必须打通**：所有端共用同一套后端 API 和 Supabase 数据库，顾客身份以手机号和 unionid 为主键关联。

### 4.7.2 接入前提与关键约束

| 约束项 | 说明 | 责任方 |
|--------|------|--------|
| 微信开放平台账号 | 必须完成开发者资质认证，公众号和小程序绑定到同一账号才能获得 unionid | 店铺端申请 |
| 微信支付商户号 | 小程序支付必须绑定商户号，以理发店营业执照为主体 | 店铺端申请 |
| 微信小程序 | 必须完成微信认证 | 店铺端申请 |
| 域名与 ICP 备案 | H5 挂公众号菜单时必须已备案；若只做小程序支付可延后 | 店铺端 |
| 后端 API HTTPS | 小程序 request 合法域名必须 HTTPS 且已备案 | 开发端/部署平台 |
| 顾客身份打通 | H5 必须强制/引导绑定手机号，小程序授权后也要绑定手机号 | 开发端 |

### 4.7.3 与当前 MBS 系统的关联

- **后端 API**：三端共用 `/api` 路由，新增小程序专用接口（如 `POST /api/auth/mini-login`、`POST /api/payments/mini-prepay`）。
- **数据库**：
  - `customers` 表已扩展 `openid_oa`、`openid_mini`、`unionid`、`wechat_avatar`、`wechat_nickname`；
  - 新增 `payments` 表统一记录 H5/小程序支付流水。
- **前端架构**：H5 继续用 React + Vite；小程序独立开发（方案 A），不引入 Taro/Uni-app 跨端框架。
- **鉴权**：当前顾客端仍用 `customerId` 明文传参，属于已知技术债务；生产环境必须改造为顾客 token 鉴权，但用户决定待小程序资质到位后再启动。

### 4.7.4 数据打通原则

1. **手机号优先匹配**：H5 用户和小程序用户都需绑定手机号，系统用手机号关联同一顾客。
2. **unionid 辅助关联**：当公众号/小程序都授权成功时，用 unionid 强化身份一致性。
3. **一份顾客数据**：积分、余额、等级、预约、订单在所有端完全一致。
4. **登录态隔离**：不同端用不同 token 存储方式（H5 用 localStorage，小程序用 `wx.setStorageSync`），但识别的是同一个顾客。

### 4.7.5 数据同步的三层保证（最高优先级）

> 小程序与 H5 前端独立开发，但**数据同源、逻辑同步**是铁律，任何改动都必须优先保证这一点。

**第一层：数据天然同源**

- 网页端与 H5 是同一套 React + Vite 代码，天然同步；
- 小程序单独开发前端，但调用同一组 `/api` 接口和同一个 Supabase 数据库；
- 顾客、预约、订单、积分、余额等核心数据只有一份，不存在多份副本需要同步。

**第二层：类型与业务逻辑复用**

- 所有实体类型必须定义在 `shared/types.ts`，H5 和小程序共同 import；
- 通用 API 请求封装必须抽到 `shared/api.ts`，避免两端各自写一套；
- 会员折扣、积分计算、排队等待时间等纯计算逻辑必须抽到 `shared/lib/`，禁止在两端分别实现。

**第三层：流程与命名一致**

- 两端核心操作流程必须一致：预约 → 确认 → 结算 → 支付 → 评价；
- 同一功能、同一状态在两端的命名必须一致；
- 允许 UI 细节按平台特性微调，但业务规则和数据结果必须完全一致。

### 4.7.6 关键风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 商户号审核不通过 | 无法接入支付 | 提前确认营业执照经营范围包含美发/生活服务类 |
| 小程序审核不通过 | 无法上线 | 避免敏感功能，按微信规范提交 |
| unionid 获取失败 | 数据无法打通 | 必须绑定同一开放平台，且小程序和 H5 在同一主体下 |
| H5 用户未绑定手机号 | 小程序用户无法关联 | H5 端增加引导绑定手机号的流程 |
| 后端域名不是 HTTPS | 小程序无法请求 | 提前配置 SSL 证书和备案域名 |

### 4.7.7 当前状态（2026-07-17）

- [x] 微信渠道接入策略已确定：小程序优先支付，公众号做宣传/预约入口。
- [x] 数据层已准备：`customers` 表扩展微信字段，`payments` 表已设计，`shared/types.ts` 已同步。
- [x] 数据同步三层保证已写入宪章：数据天然同源、类型与业务逻辑复用、流程与命名一致。
- [ ] 顾客端鉴权改造暂时不做，待店铺端拿到小程序 AppID、商户号等资质后再启动。
- [x] 抽象可复用 API 层和业务工具函数到 `shared/` 目录：
  - `shared/api-base.ts`：通用 `http`、API 基础地址、真实 API 开关；
  - `shared/lib/membership.ts`：会员折扣、积分、VIP 有效期等纯计算逻辑；
  - `shared/lib/avatar.ts`：头像 URL 生成；
  - `src/api.ts`、`src/lib/membership.ts`、`src/lib/avatar.ts` 已改为引用共享层。
- [x] 小程序基础框架已搭建（`/mini-program`）：
  - 原生小程序（JavaScript，测试阶段用 `.js` 直接运行，避免 TypeScript 编译配置问题）；
  - 首页、预约、排队、个人中心、结算 5 个基础页面；
  - tabBar 配置；
  - 小程序专用请求封装 `mini-program/utils/api.js`，API 基础地址来自 `shared/api-base.ts`；
  - 小程序本地存储封装 `mini-program/utils/storage.js`。
- [x] 小程序首页和预约页已接入真实数据：
  - `mini-program/api/shop.js`、`booking.js`、`customer.js` 调用后端 `/api` 接口；
  - 预约页随机发型师匹配算法与 H5 `Booking.tsx` 保持一致，确保两端数据同步。
- [x] 修复构建错误：`src/pages/customer/Booking.tsx` 中组件名 `Booking` 与 `shared/types` 中 `Booking` 类型重名，导致 vite build 报 `Duplicate declaration`。将组件重命名为 `BookingPage` 解决。
- [x] 小程序 UI 与 H5 统一改造完成（2026-07-21）：
  - 建立 `mini-program/app.scss` 设计 Token，颜色、字体、圆角、阴影、按钮、卡片与 H5 顾客端对齐；
  - 重构首页、预约页、排队页、个人中心、结算页，统一使用渐变头部、卡片式布局、底部固定操作栏、状态徽章、空状态、登录弹窗；
  - 新增通用图标组件 `mini-program/components/icon/icon`，图标名与 H5 lucide-react 图标保持一致；
  - 新增 `mini-program/utils/membership.js` 统一会员折扣、有效期、权益计算，供个人中心和结算页复用；
  - 登录体验统一：未登录场景自动唤起 `login-modal`，登录成功后刷新当前页面数据；
  - 完成 3 轮自测并修复问题：补齐 `app.scss` 通用工具类、修复 `queue.js` 参数名不一致、修复 `queue.wxml` `<span>`/`gap-1.5` 不兼容写法、修复 `booking.js`/`booking.wxml` 时间格渲染与 serviceId 传递 bug、`npm run build` 通过；
  - 根据真机调试反馈继续对齐 H5：修复 icon 组件 wxss 标签选择器警告、首页标题改为店铺名、服务项目改为带自定义橙色滑块的 `scroll-view` 以复刻 H5 `VerticalScrollSlider`、修复 `loadShop`/`loadCustomer` 竞态导致会员价可能未生效的问题、修复登录成功后仍停留在登录界面的问题、删除 tabBar 改为页面内导航、首页底部操作栏与 H5 ShopDetail 对齐。
- [ ] 小程序登录（`wx.login`）和支付（`wx.requestPayment`） pending 资质到位。

### 4.7.8 指向详细指南

具体操作步骤、推进清单、接口说明见 [`微信渠道接入规划与指南.md`](file:///workspace/微信渠道接入规划与指南.md)。

---

# 第五卷：附录

## A. 新项目避坑 Checklist（每次项目开始前过一遍）

### 项目初始化
- [ ] .gitignore 写好了吗？（node_modules, .env, dist）
- [ ] .gitattributes 加了吗？（解决 CRLF 问题）
- [ ] package-lock.json 提交了吗？
- [ ] tsconfig.json 的 paths alias 配好了吗？

### 前端状态管理
- [ ] 状态管理方案选好了吗？（Zustand + persist）
- [ ] 数据源统一了吗？（只有 mock 还是接 DB？）
- [ ] localStorage 和状态管理同步了吗？

### API 设计
- [ ] 统一了 API 响应格式了吗？(`{ success, data, error }`)
- [ ] 所有 API 调用都有错误处理吗？
- [ ] 敏感信息不在前端代码里吗？

### 部署
- [ ] .env 文件在部署平台上配置了吗？
- [ ] 部署平台的免费额度限制了解了吗？
- [ ] 部署后验证过吗？（不只是 npm run build）
- [ ] POST/PUT 接口在 Vercel 上实测过吗？（确认 req.body 不为空，字段正确入库）

### 安全
- [ ] API 有 rate limiting 吗？
- [ ] 敏感数据存在 localStorage 了吗？
- [ ] 第三方 API 链接在国内能访问吗？

### 数据库与数据迁移
- [ ] 有 migrations 目录吗？（每次改表写迁移文件）
- [ ] 种子数据脚本能跑通吗？（建表 → 导数据流程清晰）
- [ ] RLS 策略配置了吗？（防静默阻止写入）

### 错误监控与测试
- [ ] 接入 Sentry 或类似错误监控了吗？
- [ ] 至少有一个核心 API 的测试吗？
- [ ] 前端有全局 error boundary 吗？

### 项目文档
- [ ] README 写了吗？（环境要求、启动步骤、部署步骤、FAQ）
- [ ] 踩坑记录文档维护了吗？（新问题及时更新）

### 时间与成本
- [ ] 开发计划预留了 30% 运维调试时间吗？
- [ ] 部署不安排在凌晨吗？（出问题没人帮）

## B. 第二阶段修复文件清单（原十九节文件清单）

| 文件 | 改动原因 |
|------|---------|
| `api/app.ts` | 用自定义 JSON body parser 替代 `express.json()`，兼容 Vercel Runtime |
| `src/api.ts` | 修复 fetch headers 合并顺序，确保 `Content-Type` 不被覆盖 |
| `api/routes/customers.ts` | 改用手动字段映射，避免 `toSnakeCase` 展开数组；补全错误日志 |
| `api/routes/auth.ts` | 接入 Supabase 员工认证 |
| `api/db/index.ts` | 新增 Supabase 连接文件 |
| `api/middleware/index.ts` | 接入 Supabase 的 JWT 认证中间件 |
| `api/utils/case.ts` | 新增 snake_case ↔ camelCase 转换工具（仅用于查询结果转换，不用于写入） |
| `vercel.json` | 配置单一函数入口，解决 12 Function 限制 |
| `src/pages/shop/CustomerManagement.tsx` | 接入真实 API，删除纯 mock 逻辑 |
| `src/pages/shop/CustomerTableManagement.tsx` | 新增 24 字段客户表格管理页面 |
| `scripts/seed-db.ts` | 调整种子数据导入逻辑 |
| `shared/types.ts` | 同步客户相关类型定义 |

## C. 第二阶段核心教训（10 条，原十九节）

1. **Supabase 接入前先把 Vercel Function 数量算清楚**：超过 12 个就要合并入口，不要等到部署报错再改。
2. **RLS 策略是第一大坑**：每新建表必须配策略，否则写入会静默失败。
3. **环境变量要两边配**：本地 `.env` + Vercel Environment Variables，缺一不可。
4. **不要直接 toSnakeCase 整个对象入库**：数组会变成数字 key，Supabase 直接报错。
5. **fetch headers 合并顺序决定生死**：默认 headers 必须确保不被 `...opts` 覆盖。
6. **本地正常不等于线上正常**：`express.json()` 在 Vercel 可能失效，必须实测 POST/PUT。
7. **请求体解析要加日志**：`[body-parser] raw body:` 和 `[customers] 收到请求体:` 是定位问题的金标准。
8. **兜底值会掩盖真相**：`name || '未命名客户'` 让 bug 看起来像“数据没显示”。
9. **Payload 和 Response 要逐字段对比**：这是判断“前端传了后端没收到”的最快方法。
10. **前端字段和数据库列必须同步**：否则就是假性保存，用户以为存了，实际没存。

## D. 常用命令速查

### 项目启动与构建
```bash
npm install           # 安装依赖
npm run dev           # 启动开发服务器
npm run build         # 本地构建
npm run server:api    # 启动本地后端 API
npm run seed-db       # 导入种子数据到 Supabase
npm test              # 运行测试（接入后）
```

### Git 工作流
```bash
git status                        # 查看当前改动
git add <file>                    # 添加特定文件
git commit -m "type: 描述"        # 提交（type 见 3.9 坑 29）
git log --oneline -10             # 查看最近 10 次提交
git tag vX.Y.Z                    # 打版本标签
git push origin main --tags       # 推送代码和标签
```

### 部署与运维
```bash
# Vercel CLI（如已安装）
vercel --prod                     # 手动触发生产部署
vercel logs <deployment-url>      # 查看部署日志
```

### 后端调试
```bash
# 本地测试 API
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{"name":"测试","phone":"13800000001"}'

# 健康检查
curl http://localhost:3000/api/health
```

### 浏览器端快捷操作
```bash
Ctrl+Shift+R        # Windows / Linux：强制刷新，清除缓存
Cmd+Shift+R         # Mac：强制刷新，清除缓存
```

### 数据库
```bash
# 种子数据（需先配置 .env）
npm run seed-db

# 手动连接 Supabase 查询建议使用 Supabase SQL Editor 或 psql
```

## E. 版本历史（记录宪章本身版本变更）

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0 | — | 初始版本：线性叙事结构（坑 1 → 坑 2 → ...），涵盖工作流、踩坑记录、协作规范。 |
| v2.0 | 2026-06-26 | 重构为五层金字塔结构：第一卷宪章总纲、第二卷工作流规范、第三卷踩坑百科（按技术领域分类）、第四卷治理机制、第五卷附录；统一坑格式；新增快速索引、常规/紧急工作流、版本与发布、常用命令速查、版本历史；拆分原第十九节为 3.14 第二阶段专项踩坑并建立交叉链接。 |
| v2.1 | 2026-06-26 | 新增 3.5 坑 17.6「未登录直接访问后台路由导致白屏」；在 1.4 快速索引和坑号定位表中同步更新；补充 USE_REAL_API 硬编码、customers.ts GET 路由字段转换不对称两项技术债务并标记为已偿还。 |
| v2.2 | 2026-07-03 | 新增 3.14.10「会员体系与客户管理实战踩坑」；补充 9 条会员/客户管理相关踩坑记录；更新技术债务清单中超时、字段映射、兜底值等已偿还项。 |
| v2.3 | 2026-07-03 | 在 3.14.10 中继续补充 seed-db 导入失败、Node.js WebSocket、API 超时 fallback 等踩坑记录；细化会员管理阶段收尾经验。 |
| v2.4 | 2026-07-14 | 版本升级到 v2.4；新增 3.14.11「开发环境约定」和 3.15「近期修复与功能新增专项记录」；新增坑 47-51；更新技术债务清单（财务报表假数据已偿还、头像 base64 和手机号唯一性为新债务）；更新 4.4.2 债务偿还计划，新增 v2.4 阶段。 |
| v2.5 | 2026-07-15 | 版本升级到 v2.5；在宪章总纲（1.1 节和文首）增加「AI 智能体协作开发白皮书」远期愿景定位；新增 3.15.5「预约权限控制与发型师调配」专项记录；新增坑 52-54（权限判断散落、stylist/barber 命名混用、顾客取消预约 403）；更新快速索引和坑号定位表；更新技术债务清单，新增 stylist/barber 命名混用、顾客端认证不统一、预约状态无操作日志三项债务；更新 4.4.2 债务偿还计划，新增 v2.5 阶段。 |
| v2.6 | 2026-07-16 | 版本升级到 v2.6；新增 3.15.6「定位失败兜底距离 1km、网页提醒限制、顾客取消预约接口 401」专项记录；重写 3.14.11「开发环境约定」并明确「Trae → 下载到本地 → 本地 push GitHub」工作流；更新 3.15.5 坑 54 的顾客取消预约方案；更新快速索引和坑号定位表；补充 AI 协作金鱼脑教训。 |
