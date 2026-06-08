import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Scissors, User } from 'lucide-react';

const SelectRole: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">欢迎来到皓诗形象设计</h1>
          <p className="text-gray-600">请选择您的身份</p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => navigate('/customer/login')}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-6 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <div className="flex items-center justify-center gap-4">
              <User size={48} />
              <div className="text-left">
                <div className="text-2xl font-bold">我是上帝</div>
                <div className="text-blue-100">预约服务</div>
              </div>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/shop/login')}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-6 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <div className="flex items-center justify-center gap-4">
              <Scissors size={48} />
              <div className="text-left">
                <div className="text-2xl font-bold">皓诗形象设计</div>
                <div className="text-orange-100">管理预约、查看数据</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-orange-200">
              ⚠️ 仅店主/员工可登录
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectRole;
