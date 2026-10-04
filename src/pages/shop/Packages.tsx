import React, { useEffect, useMemo, useState } from 'react';
import {
  Gift,
  Plus,
  Search,
  X,
  Calendar,
  User,
  Scissors,
  Trash2,
  Edit2,
  History,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { CustomerPackage, Customer, Service, PackageStatus, UserRole, PackageUsageLog } from '../../../shared/types';
import { packageApi, customerApi, shopApi } from '../../api';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

const statusLabel: Record<PackageStatus, string> = {
  active: '有效',
  used_up: '已用完',
  expired: '已过期',
};

const statusClass: Record<PackageStatus, string> = {
  active: 'bg-green-100 text-green-800',
  used_up: 'bg-gray-100 text-gray-800',
  expired: 'bg-red-100 text-red-800',
};

const toDatetimeLocal = (d?: Date | string) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const Packages: React.FC = () => {
  const { currentShop, userRole } = useAppStore();
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CustomerPackage | null>(null);
  const [logsTarget, setLogsTarget] = useState<CustomerPackage | null>(null);
  const [logs, setLogs] = useState<PackageUsageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canManage = userRole === UserRole.CEO || userRole === UserRole.SHOP_MANAGER;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const shopId = currentShop?.id || 'shop1';
      const [pkgList, customerList, shopData] = await Promise.all([
        packageApi.getByShop(shopId),
        customerApi.getAll(),
        shopApi.getShop(shopId),
      ]);
      setPackages(pkgList || []);
      setCustomers(customerList || []);
      setServices(shopData?.services || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentShop?.id]);

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const serviceMap = useMemo(() => {
    const map = new Map<string, Service>();
    services.forEach((s) => map.set(s.id, s));
    return map;
  }, [services]);

  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return packages;
    return packages.filter((p) => {
      const c = customerMap.get(p.customerId);
      return (
        c?.name?.includes(term) ||
        c?.phone?.includes(term) ||
        p.name?.includes(term) ||
        serviceMap.get(p.serviceId)?.name?.includes(term)
      );
    });
  }, [packages, search, customerMap, serviceMap]);

  const [form, setForm] = useState({
    customerId: '',
    serviceId: '',
    name: '',
    totalTimes: 3,
    price: 99,
    expiresAt: '',
    allowHolidayUse: true,
  });

  const resetForm = () => {
    setForm({
      customerId: '',
      serviceId: '',
      name: '99元三次精剪',
      totalTimes: 3,
      price: 99,
      expiresAt: '',
      allowHolidayUse: true,
    });
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (pkg: CustomerPackage) => {
    setEditing(pkg);
    setForm({
      customerId: pkg.customerId,
      serviceId: pkg.serviceId,
      name: pkg.name,
      totalTimes: pkg.totalTimes,
      price: pkg.price,
      expiresAt: toDatetimeLocal(pkg.expiresAt),
      allowHolidayUse: pkg.allowHolidayUse,
    });
  };

  const closeModals = () => {
    setShowCreate(false);
    setEditing(null);
    setLogsTarget(null);
    setLogs([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.serviceId || !form.expiresAt) {
      setError('请填写完整信息');
      return;
    }
    setSubmitting(true);
    try {
      await packageApi.create({
        customerId: form.customerId,
        name: form.name || '次卡套餐',
        serviceId: form.serviceId,
        totalTimes: Number(form.totalTimes),
        price: Number(form.price),
        expiresAt: form.expiresAt,
        allowHolidayUse: form.allowHolidayUse,
      });
      closeModals();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '开卡失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    try {
      await packageApi.update(editing.id, {
        totalTimes: Number(form.totalTimes),
        expiresAt: form.expiresAt,
        allowHolidayUse: form.allowHolidayUse,
      });
      closeModals();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (pkg: CustomerPackage) => {
    if (!window.confirm(`确定作废 ${pkg.name} 吗？作废后不可恢复。`)) return;
    try {
      await packageApi.void(pkg.id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '作废失败');
    }
  };

  const openLogs = async (pkg: CustomerPackage) => {
    setLogsTarget(pkg);
    setLogsLoading(true);
    try {
      const data = await packageApi.getLogs(pkg.id);
      setLogs(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载记录失败');
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <ShopLayout title="次卡管理">
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle size={18} />
            {error}
            <button className="ml-auto text-sm underline" onClick={() => setError(null)}>
              关闭
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索顾客、手机号、套餐名称、服务"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {canManage && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus size={18} /> 手动开卡
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">顾客</th>
                  <th className="text-left px-4 py-3 font-medium">套餐</th>
                  <th className="text-left px-4 py-3 font-medium">服务</th>
                  <th className="text-left px-4 py-3 font-medium">次数</th>
                  <th className="text-left px-4 py-3 font-medium">价格</th>
                  <th className="text-left px-4 py-3 font-medium">有效期至</th>
                  <th className="text-left px-4 py-3 font-medium">状态</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <Loader2 className="inline-block animate-spin mr-2" size={18} /> 加载中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      暂无次卡记录
                    </td>
                  </tr>
                ) : (
                  filtered.map((pkg) => {
                    const customer = customerMap.get(pkg.customerId);
                    const service = serviceMap.get(pkg.serviceId);
                    return (
                      <tr key={pkg.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{customer?.name || '未知'}</div>
                          <div className="text-gray-500 text-xs">{customer?.phone}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{pkg.name}</td>
                        <td className="px-4 py-3 text-gray-600">{service?.name || pkg.serviceId}</td>
                        <td className="px-4 py-3">
                          {pkg.usedTimes}/{pkg.totalTimes}
                        </td>
                        <td className="px-4 py-3">¥{pkg.price}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {pkg.expiresAt ? new Date(pkg.expiresAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusClass[pkg.status]}`}>
                            {statusLabel[pkg.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openLogs(pkg)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="核销记录"
                            >
                              <History size={16} />
                            </button>
                            {canManage && pkg.status === 'active' && (
                              <>
                                <button
                                  onClick={() => openEdit(pkg)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  title="编辑"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleVoid(pkg)}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="作废"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 开卡/编辑弹窗 */}
      {(showCreate || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editing ? '编辑次卡' : '手动开卡'}</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={editing ? handleUpdate : handleCreate} className="p-6 space-y-4">
              {!editing && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">顾客</label>
                    <select
                      value={form.customerId}
                      onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">请选择顾客</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">服务项目</label>
                    <select
                      value={form.serviceId}
                      onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">请选择服务</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">套餐名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                  disabled={!!editing}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">总次数</label>
                  <input
                    type="number"
                    min={1}
                    value={form.totalTimes}
                    onChange={(e) => setForm({ ...form, totalTimes: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">价格（元）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                    disabled={!!editing}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">有效期至</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.allowHolidayUse}
                  onChange={(e) => setForm({ ...form, allowHolidayUse: e.target.checked })}
                  className="rounded border-gray-300"
                />
                允许节假日使用
              </label>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 核销记录弹窗 */}
      {logsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">核销记录 - {logsTarget.name}</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {logsLoading ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 className="inline-block animate-spin mr-2" size={18} /> 加载中...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无核销记录</div>
              ) : (
                <ul className="space-y-3">
                  {logs.map((log) => (
                    <li key={log.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>{log.usedAt ? new Date(log.usedAt).toLocaleString('zh-CN') : '-'}</span>
                        {log.bookingId && <span className="text-xs">预约 {log.bookingId.slice(-6)}</span>}
                      </div>
                      {log.note && <div className="text-gray-500 mt-1">{log.note}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default Packages;
