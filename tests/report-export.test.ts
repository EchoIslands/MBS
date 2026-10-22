import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as XLSX from 'xlsx';

test('财务导出依赖升级：两个工作表、中文和金额可以往返读取',()=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['营业额','金额'],['合成数据',33.64]]),'财务汇总');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['预约','状态'],['合成预约','已完成']]),'预约记录');
  const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  const read=XLSX.read(bytes,{type:'buffer'});
  assert.deepEqual(read.SheetNames,['财务汇总','预约记录']);
  assert.deepEqual(XLSX.utils.sheet_to_json(read.Sheets['财务汇总'],{header:1}),[['营业额','金额'],['合成数据',33.64]]);
  assert.equal(read.Sheets['预约记录'].B2.v,'已完成');
});
