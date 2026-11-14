/** Offline encrypted public-schema backup and a guarded restore drill. Never targets production for restore. */
import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { databaseConfig } from './setup-db.js';
import { backupKey, encryptBackup, decryptBackup, databaseIdentity, assertIsolatedRestore, restoreArchiveList } from './lib/backupArchive.js';
const run=promisify(execFile);
type Control={table:string;rows:string;checksum:string};
type Payload={version:1;source:string;createdAt:string;controls:Control[];dump:string};
const identifier=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function controls(client:pg.Client):Promise<Control[]>{
 await client.query("SET TIME ZONE 'UTC'");
 const tables=await client.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const result:Control[]=[];
 for(const {tablename} of tables.rows){
  const r=await client.query<{rows:string;checksum:string}>(`SELECT count(*)::text rows,coalesce(sum(('x'||substr(md5(to_jsonb(t)::text),1,15))::bit(60)::bigint),0)::text checksum FROM public.${identifier(tablename)} t`);
  result.push({table:tablename,...r.rows[0]});
 }
 return result;
}
function cliEnvironment(url:string){
 const u=new URL(url);
 return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGSSLMODE:'verify-full',PGCONNECT_TIMEOUT:'15'};
}
export async function backupDrill(mode:string,file:string,env:NodeJS.ProcessEnv=process.env){
 const key=backupKey(env.BACKUP_ENCRYPTION_KEY);
 if(mode!=='backup'&&mode!=='restore')throw new Error('使用 backup 或 restore，后跟备份文件路径');
 const target=mode==='backup'?env.SUPABASE_DB_URL:env.BACKUP_RESTORE_DB_URL;
 if(!target)throw new Error(mode==='backup'?'缺少 SUPABASE_DB_URL':'缺少隔离目标 BACKUP_RESTORE_DB_URL');
 const config=databaseConfig({...env,SUPABASE_DB_URL:target});const safeUrl=String(config.connectionString);
 const client=new pg.Client(config);let temporary:string|undefined;
 try{
  await client.connect();
  if(mode==='backup'){
   // Hold one exported snapshot open until both control totals and pg_dump finish.
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const snapshot=await client.query<{snapshot:string}>('SELECT pg_export_snapshot() snapshot');
   const totals=await controls(client);
   const dump=await run(env.PG_DUMP_PATH||'pg_dump',['--format=custom','--no-owner','--schema=public','--snapshot='+snapshot.rows[0].snapshot],{env:cliEnvironment(safeUrl),encoding:'buffer',maxBuffer:256*1024*1024,timeout:300000});
   await client.query('COMMIT');
   const payload:Payload={version:1,source:databaseIdentity(safeUrl),createdAt:new Date().toISOString(),controls:totals,dump:dump.stdout.toString('base64')};
   await writeFile(resolve(file),encryptBackup(Buffer.from(JSON.stringify(payload)),key),{flag:'wx',mode:0o600});
   return {mode,tables:totals.length,verified:false,message:'已生成加密备份；必须完成隔离恢复后才能称为可恢复'};
  }
  const payload=JSON.parse(decryptBackup(await readFile(resolve(file)),key).toString('utf8')) as Payload;
  if(payload.version!==1||!Array.isArray(payload.controls)||typeof payload.dump!=='string')throw new Error('备份内容格式不完整');
  const tables=await client.query<{count:string}>("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','S'))+(SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')) AS count");
  assertIsolatedRestore(payload.source,safeUrl,Number(tables.rows[0].count));
  if(env.SUPABASE_DB_URL&&databaseIdentity(env.SUPABASE_DB_URL)===databaseIdentity(safeUrl))throw new Error('隔离目标不能是当前生产数据库');
  temporary=await mkdtemp(join(tmpdir(),'mbs-restore-'));const dumpPath=join(temporary,'backup.dump');
  await writeFile(dumpPath,Buffer.from(payload.dump,'base64'),{flag:'wx',mode:0o600});
  const toc=await run(env.PG_RESTORE_PATH||'pg_restore',['--list',dumpPath],{encoding:'utf8',maxBuffer:1024*1024,timeout:30000});
  const listPath=join(temporary,'restore.list');await writeFile(listPath,restoreArchiveList(toc.stdout),{flag:'wx',mode:0o600});
  await run(env.PG_RESTORE_PATH||'pg_restore',['--dbname='+cliEnvironment(safeUrl).PGDATABASE,'--no-owner','--use-list='+listPath,'--exit-on-error','--single-transaction',dumpPath],{env:cliEnvironment(safeUrl),maxBuffer:1024*1024,timeout:300000});
  const actual=await controls(client);
  if(JSON.stringify(actual)!==JSON.stringify(payload.controls))throw new Error('恢复后行数/内容校验与备份快照不一致，演练未通过，隔离现场保留');
  return {mode,tables:actual.length,verified:true,message:'隔离恢复完成，所有public表行数和内容校验一致；仍需做业务查询复核'};
 }finally{await client.end().catch(()=>{});if(temporary&&resolve(temporary).startsWith(resolve(tmpdir())+sep+'mbs-restore-'))await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 dotenv.config({quiet:true});
 if(process.argv.length!==4){console.error('用法：npx tsx scripts/backup-drill.ts backup|restore <加密文件路径>');process.exitCode=1;}
 else backupDrill(process.argv[2],process.argv[3]).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('备份/恢复未完成。检查CLI安装、TLS证书、独立密钥、空隔离库及磁盘空间；未输出连接凭据。');process.exitCode=1;});
}
