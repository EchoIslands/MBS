import { Customer, UserRole } from '../../shared/types';
import { canEditCustomer } from '../../shared/permissions';
import { customerColumns } from '../lib/customerPresentation';


export default function CustomerTableView({customers,role,onView,onEdit}: {customers: Customer[];role:UserRole|null;onView:(customer:Customer)=>void;onEdit:(customer:Customer)=>void}) {
  return <div className="overflow-auto max-h-[65vh]" aria-label="客户表格"><table className="w-full text-sm whitespace-nowrap">
    <thead className="sticky top-0 bg-gray-50 z-10"><tr><th className="p-3 text-left sticky left-0 bg-gray-50">操作</th>{customerColumns.map(c=><th key={c.label} className="p-3 text-left">{c.label}</th>)}</tr></thead>
    <tbody>{customers.map(customer=><tr key={customer.id} className="border-t hover:bg-orange-50">
      <td className="p-3 sticky left-0 bg-white"><button onClick={()=>onView(customer)} className="text-blue-700 mr-3">查看详情</button>{canEditCustomer(role) && <button onClick={()=>onEdit(customer)} className="text-orange-700">编辑</button>}</td>
      {customerColumns.map(c=><td key={c.label} className="p-3 max-w-xs truncate" title={String(c.value(customer))}>{c.value(customer)}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
