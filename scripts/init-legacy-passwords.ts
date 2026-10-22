/** 本地运行：npx tsx scripts/init-legacy-passwords.ts [--dry-run]
 * 复用 setup-db.ts 的 PostgreSQL 配置；不调用 REST，不自动迁移。
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { databaseConfig } from './setup-db.js';

const BATCH_SIZE = 50;
const REQUIRED_FIELDS = ['id', 'password_hash', 'is_weak_password', 'password_reset_at', 'identity_verified', 'identity_verified_at', 'identity_verified_by'];
const EMPTY_PASSWORD = "(password_hash IS NULL OR password_hash = '')";

export type PasswordConnection = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null; command?: string }>;
};
type Options = {
  dryRun?: boolean;
  log?: (message: string) => void;
  shouldStop?: () => boolean;
  diagnosticSecrets?: string[];
  // 仅隔离测试注入；CLI 固定使用真实 bcrypt cost12。
  hash?: () => Promise<string>;
};

export function redactDiagnostic(value: unknown, secrets: string[] = []): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  text = text ?? String(value);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/(postgres(?:ql)?:\/\/)[^\s"<>]+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[API KEY REDACTED]')
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[HASH REDACTED]')
    .replace(/\b1[3-9][0-9]{9}\b/g, '[PHONE REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL REDACTED]');
}

export function databaseErrorDiagnostic(error: any, secrets: string[] = []): string {
  const entries: any[] = [];
  const seen = new Set();
  const visit = (item: any, depth: number) => {
    if (!item || seen.has(item) || depth > 8) return;
    seen.add(item);
    entries.push({
      name: item.name, message: item.message ?? String(item), code: item.code,
      severity: item.severity, hint: item.hint, position: item.position,
      // PostgreSQL detail/where 可能包含完整失败行、哈希或参数，不输出它们。
      detail: item.detail ? '[数据库 detail 已隐藏，避免泄露客户行/参数]' : undefined,
      syscall: item.syscall, stack: item.stack,
    });
    visit(item.cause, depth + 1);
    if (Array.isArray(item.errors)) item.errors.forEach((child: any) => visit(child, depth + 1));
  };
  visit(error, 0);
  return redactDiagnostic(entries, secrets);
}

export async function initializeLegacyPasswords(connection: PasswordConnection, options: Options = {}) {
  const log = options.log || console.log;
  const shouldStop = options.shouldStop || (() => false);
  const hash = options.hash || (() => bcrypt.hash('123456', 12));
  const secrets = options.diagnosticSecrets || [];
  let updated = 0;
  let skipped = 0;
  let batches = 0;
  const query = async (stage: string, sql: string, values?: any[]) => {
    const started = Date.now();
    if (options.dryRun) log(`[SQL 请求] ${stage}: ${sql.replace(/\s+/g, ' ').trim()}（参数值不打印）`);
    try {
      const result = await connection.query(sql, values);
      if (options.dryRun) log(`[SQL 响应] ${stage}: command=${result.command || 'SELECT'} rows=${result.rows.length} elapsed=${Date.now() - started}ms（客户行不打印）`);
      return result;
    } catch (error) {
      const diagnostic = databaseErrorDiagnostic(error, secrets);
      if (options.dryRun) log(`[SQL/网络异常] ${stage}: ${diagnostic}`);
      throw new Error(`${stage}失败；已成功的记录保留，可修复后重跑。诊断：${diagnostic}`);
    }
  };

  const schema = await query('结构预检', `SELECT column_name FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3::text[])`, ['public', 'customers', REQUIRED_FIELDS]);
  const existing = new Set(schema.rows.map(row => row.column_name));
  const missing = REQUIRED_FIELDS.filter(field => !existing.has(field));
  if (missing.length) throw new Error(`结构预检：public.customers 缺少字段或当前数据库角色不可见：${missing.join(', ')}。请核对连接项目、权限及 025–029 迁移。`);
  if (options.dryRun) {
    const result = await query('待处理数量', `SELECT COUNT(*)::text AS pending FROM public.customers WHERE ${EMPTY_PASSWORD}`);
    const pending = Number(result.rows[0]?.pending);
    if (!Number.isSafeInteger(pending) || pending < 0) throw new Error('数据库未返回有效待处理数量，未执行写入。');
    log(`[只读检查] 结构检查通过，待初始化 ${pending} 条；未生成哈希、未写入数据。`);
    return { updated, skipped, batches, interrupted: false, pending };
  }

  log('[开始] PostgreSQL 直连；每批 50 条，bcrypt cost12 独立随机盐，逐条条件更新。');
  let previousUnchangedBatch = '';
  while (!shouldStop()) {
    const result = await query('分批读取', `SELECT id FROM public.customers WHERE ${EMPTY_PASSWORD} ORDER BY id LIMIT ${BATCH_SIZE}`);
    if (!result.rows.length) {
      log(`[完成] 已无 NULL/空字符串密码；本次更新 ${updated} 条，跳过 ${skipped} 条，共 ${batches} 批。`);
      return { updated, skipped, batches, interrupted: false };
    }
    const signature = JSON.stringify(result.rows.map(row => row.id));
    if (signature === previousUnchangedBatch) throw new Error('同一批空密码记录未发生进展，已停止；请检查更新权限/触发器后重跑。');
    batches++;
    log(`[批次 ${batches}] 读取 ${result.rows.length}/${BATCH_SIZE} 条，正在本地逐条生成哈希…`);
    const prepared: { id: string; passwordHash: string }[] = [];
    for (const row of result.rows) {
      if (shouldStop()) break;
      if (typeof row.id !== 'string' || !row.id) throw new Error('客户主键格式异常，已停止；未打印客户数据。');
      prepared.push({ id: row.id, passwordHash: await hash() });
    }
    if (shouldStop()) break;
    const before = updated;
    log(`[批次 ${batches}] 哈希生成完成，正在写入…`);
    try {
      // 单个 pg.Client 顺序提交；每条原子更新全部标记，不跨本地哈希阶段持锁。
      for (const row of prepared) {
        if (shouldStop()) break;
        const saved = await query('条件更新', `UPDATE public.customers
          SET password_hash = $1, is_weak_password = $2, password_reset_at = NOW(),
              identity_verified = FALSE, identity_verified_at = NULL, identity_verified_by = NULL
          WHERE id = $3 AND ${EMPTY_PASSWORD} RETURNING id`, [row.passwordHash, true, row.id]);
        if (saved.rows.length) updated += saved.rows.length;
        else skipped++;
      }
    } finally {
      log(`[进度] 批次 ${batches}：更新 ${updated - before} 条；累计更新 ${updated} 条，跳过 ${skipped} 条。`);
    }
    previousUnchangedBatch = updated === before ? signature : '';
  }
  log(`[已中断] 本次已更新 ${updated} 条，跳过 ${skipped} 条；再次运行可继续。`);
  return { updated, skipped, batches, interrupted: true };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法：npx tsx scripts/init-legacy-passwords.ts [--dry-run]\n读取根目录 .env 的 SUPABASE_DB_URL；pg 直连，不使用 REST API。--dry-run 只读并输出 SQL/数据库/网络脱敏诊断。');
    return;
  }
  if (args.some(arg => arg !== '--dry-run')) throw new Error('未知参数；请使用 --help 查看用法。');
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const config = databaseConfig(process.env);
  config.application_name = 'mbs-init-legacy-passwords';
  const secrets = [process.env.SUPABASE_DB_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', process.env.JWT_SECRET || '', decodeURIComponent(new URL(config.connectionString!).password)];
  const client = new pg.Client(config);
  client.on('error', () => { /* 查询或关闭时统一输出脱敏诊断，不打印原始驱动对象 */ });
  let stopped = false;
  const stop = () => { stopped = true; console.log('[停止请求] 等待当前哈希/写入结束，不再开始新记录。'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    console.log('[连接] 正在建立 PostgreSQL 连接（复用 setup-db 配置，不经过 REST API）…');
    try { await client.connect(); }
    catch (error) { throw new Error('数据库连接失败：' + databaseErrorDiagnostic(error, secrets)); }
    // 限制数据库执行/锁等待时间；逐条 autocommit，不是 50 条整批事务。
    await client.query("SET statement_timeout = '30s'; SET lock_timeout = '15s';");
    const result = await initializeLegacyPasswords({ query: (sql, values) => client.query(sql, values) }, {
      dryRun: args.includes('--dry-run'), shouldStop: () => stopped, diagnosticSecrets: secrets,
    });
    if (result.interrupted) process.exitCode = 130;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await client.end().catch(() => {});
  }
}

// 导入测试不加载 .env、不创建真实数据库连接。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[失败] ${redactDiagnostic(error instanceof Error ? error.message : '脚本异常。', [process.env.SUPABASE_DB_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', process.env.JWT_SECRET || ''])}`);
    process.exitCode = 1;
  });
}
