import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Plus, Trash2, Store, Clock, User, Eye, EyeOff, Link2, Copy, Check, Package, Calendar } from 'lucide-react';
import { useAppStore } from '../../store';
import { Service, Employee, OpeningHours, UserRole } from '../../../shared/types';
import { getAvatarUrl } from '../../lib/avatar';
import { shopApi, employeeApi } from '../../api';
import ShopLayout from './ShopLayout';

const defaultOpeningHours: OpeningHours = {
  monday: { open: '09:00', close: '21:00', isOpen: true },
  tuesday: { open: '09:00', close: '21:00', isOpen: true },
  wednesday: { open: '09:00', close: '21:00', isOpen: true },
  thursday: { open: '09:00', close: '21:00', isOpen: true },
  friday: { open: '09:00', close: '22:00', isOpen: true },
  saturday: { open: '10:00', close: '22:00', isOpen: true },
  sunday: { open: '10:00', close: '20:00', isOpen: true },
};

const weekDayLabels: { key: keyof OpeningHours; label: string }[] = [
  { key: 'monday', label: '周一' },
  { key: 'tuesday', label: '周二' },
  { key: 'wednesday', label: '周三' },
  { key: 'thursday', label: '周四' },
  { key: 'friday', label: '周五' },
  { key: 'saturday', label: '周六' },
  { key: 'sunday', label: '周日' },
];

const roleLabels: Partial<Record<UserRole, string>> = {
  [UserRole.CEO]: 'CEO/老板',
  [UserRole.SHOP_MANAGER]: '店长',
  [UserRole.CUSTOMER_SERVICE]: '客服',
  [UserRole.CASHIER]: '收银',
  [UserRole.STYLIST]: '技师/发型师',
};

const ShopManage: React.FC = () => {
  const navigate = useNavigate();
  const { currentShop, updateShop, userRole } = useAppStore();
  const [shopName, setShopName] = useState(currentShop?.name || '');
  const [shopDesc, setShopDesc] = useState(currentShop?.description || '');
  const [shopPhone, setShopPhone] = useState(currentShop?.phone || '');
  const [shopAddress, setShopAddress] = useState(currentShop?.address || '');
  const [services, setServices] = useState<Service[]>(currentShop?.services || []);
  const [newService, setNewService] = useState({ name: '', price: '', duration: '' });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    phone: '',
    title: '',
    specialty: '',
    avatar: '',
    role: UserRole.STYLIST,
    password: '',
  });
  const [openingHours, setOpeningHours] = useState<OpeningHours>(currentShop?.openingHours || defaultOpeningHours);
  const [bookingConfirmMode, setBookingConfirmMode] = useState<'auto' | 'manual'>(currentShop?.bookingConfirmMode || 'auto');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // currentShop 变化时同步表单状态（避免路由守卫仅恢复 employee 时 currentShop 为空导致崩溃）
  React.useEffect(() => {
    if (!currentShop) return;
    setShopName(currentShop.name || '');
    setShopDesc(currentShop.description || '');
    setShopPhone(currentShop.phone || '');
    setShopAddress(currentShop.address || '');
    setServices(currentShop.services || []);
    setOpeningHours(currentShop.openingHours || defaultOpeningHours);
    setBookingConfirmMode(currentShop.bookingConfirmMode || 'auto');
  }, [currentShop]);

  // 加载员工列表
  React.useEffect(() => {
    const loadEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const list = await employeeApi.getAll();
        setEmployees(list || []);
      } catch (err) {
        console.error('[ShopManage] 加载员工失败:', err);
      } finally {
        setLoadingEmployees(false);
      }
    };
    loadEmployees();
  }, []);

  const addService = () => {
    if (!newService.name || !newService.price || !newService.duration) return;
    const service: Service = {
      id: Date.now().toString(),
      name: newService.name,
      price: Number(newService.price),
      duration: Number(newService.duration),
    };
    setServices([...services, service]);
    setNewService({ name: '', price: '', duration: '' });
  };

  const removeService = (id: string) => {
    setServices(services.filter((s) => s.id !== id));
  };

  // 判断当前用户能否添加某角色的员工
  const canAddRole = (role: UserRole) => {
    if (userRole === UserRole.CEO) return true;
    if (userRole === UserRole.SHOP_MANAGER) return role === UserRole.STYLIST;
    return false;
  };

  // 判断当前用户能否管理某个员工
  const canManageEmployee = (emp: Employee) => {
    if (userRole === UserRole.CEO) return true;
    if (userRole === UserRole.SHOP_MANAGER) {
      // 店长不能管理 CEO、其他店长、客服、收银
      return emp.role === UserRole.STYLIST;
    }
    return false;
  };

  const availableRoles: UserRole[] = Object.values(UserRole).filter((r) => canAddRole(r));

  const addEmployee = async () => {
    if (!newEmployee.name || !newEmployee.phone || !newEmployee.password) {
      alert('请填写姓名、手机号和登录密码');
      return;
    }
    if (!canAddRole(newEmployee.role)) {
      alert('当前角色无权添加该类型员工');
      return;
    }
    try {
      const created = await employeeApi.create({
        name: newEmployee.name,
        phone: newEmployee.phone,
        title: newEmployee.title,
        specialty: newEmployee.specialty,
        avatar: newEmployee.avatar || getAvatarUrl(newEmployee.name),
        role: newEmployee.role,
        password: newEmployee.password,
      });
      if (created) {
        setEmployees([...employees, created]);
        setNewEmployee({
          name: '',
          phone: '',
          title: '',
          specialty: '',
          avatar: '',
          role: UserRole.STYLIST,
          password: '',
        });
      } else {
        alert('添加员工失败');
      }
    } catch (err) {
      console.error('[ShopManage] 添加员工失败:', err);
      alert(`添加员工失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const removeEmployee = async (id: string) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp || !canManageEmployee(emp)) {
      alert('无权删除该员工');
      return;
    }
    if (!confirm('确定要删除该员工吗？')) return;
    try {
      const ok = await employeeApi.delete(id);
      if (ok) {
        setEmployees(employees.filter((e) => e.id !== id));
      } else {
        alert('删除失败');
      }
    } catch (err) {
      console.error('[ShopManage] 删除员工失败:', err);
      alert(`删除员工失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const toggleEmployeeStatus = async (id: string) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp || !canManageEmployee(emp)) {
      alert('无权修改该员工状态');
      return;
    }
    try {
      const next = !emp.isActive;
      const updated = await employeeApi.update(id, { isActive: next });
      if (updated) {
        setEmployees(employees.map((e) => (e.id === id ? { ...e, isActive: next } : e)));
      } else {
        alert('状态更新失败');
      }
    } catch (err) {
      console.error('[ShopManage] 更新员工状态失败:', err);
      alert(`更新失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleSave = async () => {
    if (!currentShop) return;
    setSaving(true);
    try {
      const shopData = {
        name: shopName,
        description: shopDesc,
        phone: shopPhone,
        address: shopAddress,
        services,
        openingHours,
        bookingConfirmMode,
      };
      const updated = await shopApi.updateShop(currentShop.id, shopData);
      if (updated) {
        // 同时更新 store 中的店铺
        updateShop(updated);
        alert('保存成功！');
        navigate('/shop');
      } else {
        console.error('保存失败: 未返回店铺数据');
        alert('保存失败');
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert(`保存失败：${error instanceof Error ? error.message : '网络错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const updateOpeningHour = (
    day: keyof OpeningHours,
    field: 'open' | 'close',
    value: string
  ) => {
    setOpeningHours({
      ...openingHours,
      [day]: {
        ...openingHours[day],
        [field]: value,
      },
    });
  };

  const toggleOpeningHour = (day: keyof OpeningHours) => {
    setOpeningHours({
      ...openingHours,
      [day]: {
        ...openingHours[day],
        isOpen: !openingHours[day].isOpen,
      },
    });
  };

  const copyShopLink = () => {
    const shopUrl = `${window.location.origin}/customer/shop/${currentShop.id}`;
    navigator.clipboard.writeText(shopUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!currentShop) {
    return (
      <ShopLayout title="店铺设置">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
          加载店铺信息中…
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout title="店铺设置">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* 店铺专属入口 */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl shadow-sm p-6 text-white">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Link2 size={20} />
            店铺专属入口
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 链接 */}
            <div>
              <p className="text-sm opacity-90 mb-2">分享链接给顾客</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/customer/shop/${currentShop.id}`}
                  className="flex-1 px-4 py-3 bg-white/20 rounded-xl text-white placeholder-white/60 border border-white/30 outline-none"
                />
                <button
                  onClick={copyShopLink}
                  className="flex items-center gap-2 bg-white text-orange-600 px-4 py-3 rounded-xl font-medium hover:bg-orange-50 transition-colors"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </div>
            {/* 二维码 */}
            <div className="flex flex-col items-center">
              <p className="text-sm opacity-90 mb-2">扫码预约</p>
              <div className="bg-white p-4 rounded-xl">
                {/* 使用二维码API生成店铺专属二维码 */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                    `${window.location.origin}/customer/shop/${currentShop.id}`
                  )}`}
                  alt="店铺二维码"
                  className="w-36 h-36"
                />
              </div>
            </div>
          </div>
          {/* 快捷操作 */}
          <div className="mt-6 pt-6 border-t border-white/20">
            <p className="text-sm opacity-90 mb-3">快捷操作</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/shop/products')}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl font-medium transition-colors"
              >
                <Package size={16} />
                商品管理
              </button>
            </div>
          </div>
        </div>

        {/* 基本信息 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Store size={20} className="text-orange-500" />
            基本信息
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">店铺名称</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">店铺描述</label>
              <textarea
                value={shopDesc}
                onChange={(e) => setShopDesc(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">联系电话</label>
                <input
                  type="text"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">店铺地址</label>
                <input
                  type="text"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 服务管理 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-orange-500" />
            服务管理
          </h2>

          {/* 添加服务 */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <h3 className="font-medium text-gray-700 mb-3">添加服务</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <input
                type="text"
                placeholder="服务名称"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              <input
                type="number"
                placeholder="价格"
                value={newService.price}
                onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              <input
                type="number"
                placeholder="时长（分钟）"
                value={newService.duration}
                onChange={(e) => setNewService({ ...newService, duration: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              <button
                onClick={addService}
                className="flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Plus size={16} />
                添加
              </button>
            </div>
          </div>

          {/* 服务列表 */}
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-orange-300 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-800">{service.name}</div>
                  <div className="text-sm text-gray-500">
                    时长 {service.duration} 分钟
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-orange-500">¥{service.price}</span>
                  <button
                    onClick={() => removeService(service.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {services.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                暂无服务，添加您的第一个服务吧
              </div>
            )}
          </div>
        </div>

        {/* 员工管理 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User size={20} className="text-orange-500" />
            员工管理
          </h2>

          {/* 添加员工 */}
          {(userRole === UserRole.CEO || userRole === UserRole.SHOP_MANAGER) && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <h3 className="font-medium text-gray-700 mb-3">添加员工</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="员工姓名 *"
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <input
                  type="text"
                  placeholder="手机号 *（用于登录）"
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <input
                  type="password"
                  placeholder="登录密码 *"
                  value={newEmployee.password}
                  onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <select
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value as UserRole })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="职位（如：首席发型师）"
                  value={newEmployee.title}
                  onChange={(e) => setNewEmployee({ ...newEmployee, title: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <input
                  type="text"
                  placeholder="专长（如：精剪、烫染）"
                  value={newEmployee.specialty}
                  onChange={(e) => setNewEmployee({ ...newEmployee, specialty: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={addEmployee}
                  className="flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors md:col-span-2 lg:col-span-2"
                >
                  <Plus size={16} />
                  添加
                </button>
              </div>
            </div>
          )}

          {/* 员工列表 */}
          <div className="space-y-3">
            {loadingEmployees ? (
              <div className="text-center text-gray-500 py-8">加载中...</div>
            ) : (
              employees.map((employee) => (
                <div
                  key={employee.id}
                  className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
                    employee.isActive
                      ? 'border-gray-200 hover:border-orange-300'
                      : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={employee.avatar || getAvatarUrl(employee.name)}
                      alt={employee.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-800">{employee.name}</div>
                        {employee.role && (
                          <div className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                            {roleLabels[employee.role] || employee.role}
                          </div>
                        )}
                        {employee.title && (
                          <div className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                            {employee.title}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        手机号：{employee.phone || '-'}
                        <span className="mx-1">·</span>
                        评分：{employee.rating}
                        {employee.specialty && (
                          <>
                            <span className="mx-1">·</span>
                            <span>专长：{employee.specialty}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {canManageEmployee(employee) && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleEmployeeStatus(employee.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          employee.isActive
                            ? 'text-gray-500 hover:bg-gray-100'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                        title={employee.isActive ? '禁用' : '启用'}
                      >
                        {employee.isActive ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                      <button
                        onClick={() => removeEmployee(employee.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {!loadingEmployees && employees.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                暂无员工，添加您的第一位员工吧
              </div>
            )}
          </div>
        </div>

        {/* 预约设置 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-orange-500" />
            预约设置
          </h2>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">预约确认方式</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBookingConfirmMode('auto')}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                  bookingConfirmMode === 'auto'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <span className={`font-semibold ${bookingConfirmMode === 'auto' ? 'text-orange-700' : 'text-gray-800'}`}>
                  自动确认
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  用户提交预约后直接显示“预约成功”，无需店铺手动确认。
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBookingConfirmMode('manual')}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                  bookingConfirmMode === 'manual'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <span className={`font-semibold ${bookingConfirmMode === 'manual' ? 'text-orange-700' : 'text-gray-800'}`}>
                  手动确认
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  用户提交后需店铺在后台点击“确认预约”才生效。
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 营业时间设置 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-orange-500" />
            营业时间
          </h2>
          <div className="space-y-3">
            {weekDayLabels.map(({ key, label }) => (
              <div
                key={key}
                className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
                  openingHours[key].isOpen
                    ? 'border-gray-200 hover:border-orange-300'
                    : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleOpeningHour(key)}
                    className={`w-12 h-7 rounded-full relative transition-colors ${
                      openingHours[key].isOpen ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                        openingHours[key].isOpen ? 'left-6' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="font-medium text-gray-800 w-12">{label}</span>
                </div>
                {openingHours[key].isOpen ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={openingHours[key].open}
                      onChange={(e) => updateOpeningHour(key, 'open', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                    <span className="text-gray-400">~</span>
                    <input
                      type="time"
                      value={openingHours[key].close}
                      onChange={(e) => updateOpeningHour(key, 'close', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">休息</span>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* 保存按钮栏 */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg mt-6 -mx-4 mb-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
        </div>
      </div>
    </ShopLayout>
  );
};

export default ShopManage;
