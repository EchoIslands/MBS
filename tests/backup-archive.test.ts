import test from 'node:test';
import assert from 'node:assert/strict';
import { backupKey, encryptBackup, decryptBackup, databaseIdentity, assertIsolatedRestore, restoreArchiveList } from '../scripts/lib/backupArchive.js';
test('encrypted backup authenticates contents and key; corruption cannot pass as a usable backup',()=>{
 const key=backupKey('12'.repeat(32)),data=Buffer.from('synthetic balances, orders and receipts');
 const archive=encryptBackup(data,key);assert.deepEqual(decryptBackup(archive,key),data);
 assert.ok(!archive.includes(data));const corrupt=Buffer.from(archive);corrupt[corrupt.length-1]^=1;
 assert.throws(()=>decryptBackup(corrupt,key));assert.throws(()=>decryptBackup(archive,backupKey('34'.repeat(32))));assert.throws(()=>backupKey('weak'));
});
test('restore refuses original database despite different credentials, or any nonempty target',()=>{
 const source=databaseIdentity('postgres://alice:secret@db.example:5432/prod');
 assert.throws(()=>assertIsolatedRestore(source,'postgres://bob:other@db.example/prod',0));
 assert.throws(()=>assertIsolatedRestore(source,'postgres://bob:other@other.example/drill',1));
 assert.doesNotThrow(()=>assertIsolatedRestore(source,'postgres://bob:other@other.example/drill',0));
});

test('restore omits only the existing public schema creation and preserves grants, tables and data',()=>{
 const toc='1; 2615 2200 SCHEMA - public postgres\n2; 0 0 ACL - SCHEMA public postgres\n3; 1259 42 TABLE public customers postgres\n4; 0 42 TABLE DATA public customers postgres';
 const list=restoreArchiveList(toc);assert.equal(list.includes('SCHEMA - public'),false);assert.ok(list.includes('ACL - SCHEMA public'));assert.ok(list.includes('TABLE DATA public customers'));
});
