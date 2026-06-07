import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Plus, Minus, Check, ShoppingBag } from 'lucide-react';
import { useAppStore } from '../../store';

const Cart: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { 
    cart, 
    updateCartItem, 
    removeFromCart, 
    toggleCartItemSelection, 
    selectAllCartItems,
    clearCart 
  } = useAppStore();

  const selectedItems = cart.filter(item => item.selected);
  
  const totalPrice = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [selectedItems]);

  const allSelected = cart.length > 0 && cart.every(item => item.selected);

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      alert('请选择要购买的商品');
      return;
    }
    alert('订单提交成功！');
    // 这里可以添加订单处理逻辑
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">购物车</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {cart.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-20 h-20 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">购物车是空的</p>
            <button
              onClick={() => navigate(`/customer/products/${shopId}`)}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              去逛逛
            </button>
          </div>
          ) : (
            <>
              {/* 全选 */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => selectAllCartItems(e.target.checked)}
                      className="w-5 h-5 text-orange-500 rounded"
                    />
                    <span className="text-gray-700">全选</span>
                  </label>
                  <button
                    onClick={clearCart}
                    className="text-sm text-gray-500 hover:text-red-500"
                  >
                    清空购物车
                  </button>
                </div>
              </div>

              {/* 商品列表 */}
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex gap-4">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleCartItemSelection(item.id)}
                        className="w-5 h-5 text-orange-500 rounded mt-1"
                      />
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      <div className="flex-1 space-y-2">
                        <h3 className="font-medium text-gray-800 line-clamp-2">
                          {item.product.name}
                        </h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-red-500">
                              ¥{item.product.price}
                            </span>
                            {item.product.originalPrice && (
                              <span className="text-xs text-gray-400 line-through">
                                ¥{item.product.originalPrice}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartItem(item.id, item.quantity - 1)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateCartItem(item.id, item.quantity + 1)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">
                            小计: <span className="text-red-500 font-medium">
                              ¥{item.product.price * item.quantity}
                            </span>
                          </span>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {/* 底部结算栏 */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm text-gray-500">合计:</span>
                <span className="text-2xl font-bold text-red-500 ml-2">
                  ¥{totalPrice.toFixed(2)}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                已选{selectedItems.length}件
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
              className={`px-8 py-3 rounded-xl font-medium transition-colors ${
                selectedItems.length > 0
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              结算({selectedItems.length})
            </button>
          </div>
        </div>
      )}
      
      {/* 底部安全区域 */}
      {cart.length > 0 && <div className="h-24" />}
    </div>
  );
};

export default Cart;
