import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Store, Clock, User, Eye, EyeOff, Link2, Copy, Check, Package } from 'lucide-react';
import { useAppStore } from '../../store';
import { Service, Employee } from '../../../shared/types';

const ShopManage: React.FC = () => {
  const navigate = useNavigate();
  const { currentShop } = useAppStore();
  const [shopName, setShopName] = useState(currentShop?.name || '');
  const [shopDesc, setShopDesc] = useState(currentShop?.description || '');
  const [shopPhone, setShopPhone] = useState(currentShop?.phone || '');
  const [shopAddress, setShopAddress] = useState(currentShop?.address || '');
  const [services, setServices] = useState<Service[]>(currentShop?.services || []);
  const [newService, setNewService] = useState({ name: '', price: '', duration: '' });
  const [employees, setEmployees] = useState<Employee[]>(currentShop?.employees || []);
  const [newEmployee, setNewEmployee] = useState({ 
    name: '', 
    title: '', 
    specialty: '', 
    avatar: '' 
  });
  const [copied, setCopied] = useState(false);

  if (!currentShop) {
    navigate('/shop/login');
    return null;
  }

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

  const addEmployee = () => {
    if (!newEmployee.name) return;
    const employee: Employee = {
      id: Date.now().toString(),
      name: newEmployee.name,
      title: newEmployee.title || undefined,
      specialty: newEmployee.specialty || undefined,
      avatar: newEmployee.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newEmployee.name)}`,
      rating: 5.0,
      isActive: true,
    };
    setEmployees([...employees, employee]);
    setNewEmployee({ name: '', title: '', specialty: '', avatar: '' });
  };

  const removeEmployee = (id: string) => {
    setEmployees(employees.filter((e) => e.id !== id));
  };

  const toggleEmployeeStatus = (id: string) => {
    setEmployees(employees.map((e) => 
      e.id === id ? { ...e, isActive: !e.isActive } : e
    ));
  };

  const handleSave = () => {
    alert('保存成功！');
    navigate('/shop');
  };

  const copyShopLink = () => {
    const shopUrl = `${window.location.origin}/customer/shop/${currentShop.id}`;
    navigator.clipboard.writeText(shopUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/shop')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1 className="font-semibold text-gray-800">店铺管理</h1>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            <Save size={18} />
            <span>保存</span>
          </button>
        </div>
      </header>

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
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <h3 className="font-medium text-gray-700 mb-3">添加员工</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <input
                type="text"
                placeholder="员工姓名"
                value={newEmployee.name}
                onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
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
                className="flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Plus size={16} />
                添加
              </button>
            </div>
          </div>

          {/* 员工列表 */}
          <div className="space-y-3">
            {employees.map((employee) => (
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
                    src={employee.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(employee.name)}`}
                    alt={employee.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-gray-800">{employee.name}</div>
                      {employee.title && (
                        <div className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                          {employee.title}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEmployeeStatus(employee.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      employee.isActive 
                        ? 'text-gray-500 hover:bg-gray-100' 
                        : 'text-green-500 hover:bg-green-50'
                    }`}
                    title={employee.isActive ? '下架' : '上架'}
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
              </div>
            ))}
            {employees.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                暂无员工，添加您的第一位员工吧
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopManage;
