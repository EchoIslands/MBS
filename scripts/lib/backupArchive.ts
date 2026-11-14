import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
const MAGIC=Buffer.from('MBSBACKUP1');
export function backupKey(value:string|undefined){
 if(!value||!/^[0-9a-f]{64}$/i.test(value))throw new Error('BACKUP_ENCRYPTION_KEY 须为独立保存的64位十六进制密钥');
 return Buffer.from(value,'hex');
}
export function encryptBackup(content:Buffer,key:Buffer){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(MAGIC);
 const data=Buffer.concat([cipher.update(content),cipher.final()]);
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),data]);
}
export function decryptBackup(archive:Buffer,key:Buffer){
 if(!archive.subarray(0,MAGIC.length).equals(MAGIC)||archive.length<MAGIC.length+28)throw new Error('备份格式无效');
 const start=MAGIC.length,decipher=createDecipheriv('aes-256-gcm',key,archive.subarray(start,start+12));
 decipher.setAAD(MAGIC);decipher.setAuthTag(archive.subarray(start+12,start+28));
 return Buffer.concat([decipher.update(archive.subarray(start+28)),decipher.final()]);
}
export function databaseIdentity(url:string){
 const u=new URL(url);return createHash('sha256').update(u.hostname.toLowerCase()+':'+(u.port||'5432')+decodeURIComponent(u.pathname)).digest('hex');
}
export function assertIsolatedRestore(sourceIdentity:string,targetUrl:string,tableCount:number){
 if(sourceIdentity===databaseIdentity(targetUrl))throw new Error('禁止恢复至源数据库');
 if(tableCount!==0)throw new Error('恢复目标必须为空的隔离数据库，禁止覆盖既有表');
}
/** A fresh PostgreSQL database already owns an empty public schema. Retain its ACL entries. */
export function restoreArchiveList(toc:string){
 return toc.split('\n').filter(line=>!/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s/.test(line)).join('\n');
}
