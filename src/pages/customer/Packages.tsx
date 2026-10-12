import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ticket, Calendar, ChevronRight } from 'lucide-react';
import { CustomerPackage, PackageStatus } from '../../../shared/types';
import { customerPackageApi } from '../../api';
import { useAppStore } from '../../store';

const statusLabel: Record<PackageStatus, string> = {
  active: '有效',
  used_up: '已用完',
  expired: '已过期',
};

const statusClass: Record<PackageStatus, string> = {
  active: 'bg-green-100 text-green-700',
  used_up: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
};

const formatDate = (d?: Date | string) => {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN');
};

const Packages: React.FC = () => {
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPackages = async () => {
    if (!currentCustomer?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await customerPackageApi.getByCustomer(currentCustomer.id);
      setPackages(
        (data || []).map((p) => ({
          ...p,
          remaining: Math.max(0, (p.totalTimes || 0) - (p.usedTimes || 0)),
        })),
      );
    } catch (err: unknown) {
      console.error('[Packages] 加载次卡失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, [currentCustomer?.id]);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="sticky top-0 bg-white shadow-sm z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/customer/profile')}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-gray-800">我的次卡</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        {loading && (
          <div className="text-center text-gray-500 py-12">加载中...</div>
        )}

        {!loading && error && (
          <div className="text-center py-10">
            <div className="text-gray-600 mb-4">{error}</div>
            <button
              onClick={loadPackages}
              className="text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && packages.length === 0 && (
          <div className="text-center py-10 sm:py-12">
            <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <Ticket size={28} className="text-gray-300" />
            </div>
            <div className="text-gray-600 mb-1">暂无次卡</div>
            <div className="text-xs text-gray-400 mb-4">到店购买套餐后即可在这里查看</div>
            <button
              onClick={() => navigate('/customer/shop/shop1')}
              className="text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg transition-colors inline-flex items-center gap-1"
            >
              去预约 <ChevronRight size={14} />
            </button>
          </div>
        )}

        {!loading && !error && packages.length > 0 && (
          <div className="space-y-3">
            {packages.map((pkg) => {
              const remaining = Math.max(0, (pkg.totalTimes || 0) - (pkg.usedTimes || 0));
              return (
                <div
                  key={pkg.id}
                  className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-gray-800 text-base">{pkg.name}</div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusClass[pkg.status]}`}>
                      {statusLabel[pkg.status]}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">剩余次数</div>
                      <div className="font-medium text-gray-800">
                        {remaining} / {pkg.totalTimes || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">有效期至</div>
                      <div className="font-medium text-gray-800 flex items-center gap-1">
                        <Calendar size={14} className="text-gray-400" />
                        {formatDate(pkg.expiresAt)}
                      </div>
                    </div>
                  </div>

                  {pkg.status === 'active' && remaining > 0 && (
                    <div className="mt-3 text-xs text-amber-700 bg-orange-50 px-3 py-2 rounded-lg">
                      预约对应服务时可直接抵扣 1 次
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Packages;
