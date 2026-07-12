import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  UserCircle, Check, X, Save, Plus,
  Scissors, Palette, Heart, MessageSquare, Clock,
  Star, Wallet, Tag, AlertTriangle, Package, Loader2,
} from 'lucide-react';
import {
  Customer, UserRole,
  HaircutStylePreference, HairColorPreference, PermColorPreference, TreatmentPreference,
  HairType, HairLength, VisitFrequency, BudgetRange, CommunicationStyle,
  ExtraServicePreference, VisitTimePreference
} from '../../../shared/types';
import { useAppStore } from '../../store';
import { customerApi } from '../../api';
import ShopLayout from './ShopLayout';

const CustomerProfileForm: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { currentEmployee, userRole } = useAppStore();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // 多选字段
  const [haircutStyles, setHaircutStyles] = useState<HaircutStylePreference[]>([]);
  const [hairColors, setHairColors] = useState<HairColorPreference[]>([]);
  const [permColors, setPermColors] = useState<PermColorPreference[]>([]);
  const [treatments, setTreatments] = useState<TreatmentPreference[]>([]);
  const [extraServices, setExtraServices] = useState<ExtraServicePreference[]>([]);
  const [visitTimes, setVisitTimes] = useState<VisitTimePreference[]>([]);

  // 单选字段
  const [hairType, setHairType] = useState<HairType | ''>('');
  const [hairLength, setHairLength] = useState<HairLength | ''>('');
  const [visitFrequency, setVisitFrequency] = useState<VisitFrequency | ''>('');
  const [budgetRange, setBudgetRange] = useState<BudgetRange | ''>('');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle | ''>('');

  // 文本字段
  const [notes, setNotes] = useState('');
  const [hasAllergies, setHasAllergies] = useState(false);
  const [allergies, setAllergies] = useState('');
  const [productsUsed, setProductsUsed] = useState<string[]>([]);
  const [newProduct, setNewProduct] = useState('');

  const fetchCustomerData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const fetchedCustomer = await customerApi.getById(customerId);
      if (!fetchedCustomer) {
        setCustomer(null);
        return;
      }

      setCustomer(fetchedCustomer);

      // 如果已有画像，回填表单字段
      if (fetchedCustomer.profile) {
        const p = fetchedCustomer.profile;
        setHaircutStyles(p.haircutStyles || []);
        setHairColors(p.hairColors || []);
        setPermColors(p.permColors || []);
        setTreatments(p.treatments || []);
        setExtraServices(p.extraServices || []);
        setVisitTimes(p.visitTimes || []);
        setHairType(p.hairType || '');
        setHairLength(p.hairLength || '');
        setVisitFrequency(p.visitFrequency || '');
        setBudgetRange(p.budgetRange || '');
        setCommunicationStyle(p.communicationStyle || '');
        setNotes(p.notes || '');
        const has = !!p.allergies && p.allergies !== '' && p.allergies !== '无';
        setHasAllergies(has);
        setAllergies(has ? p.allergies || '' : '');
        setProductsUsed(p.productsUsed || []);
      }
    } catch (err) {
      console.error('Failed to fetch customer data:', err);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  const canEditProfile =
    !userRole ||
    userRole === UserRole.CEO ||
    userRole === UserRole.CUSTOMER_SERVICE ||
    userRole === UserRole.SHOP_OWNER ||
    userRole === UserRole.STYLIST ||
    userRole === UserRole.SHOP_MANAGER;

  // 枚举标签映射
  const haircutStyleLabels: Record<HaircutStylePreference, string> = {
    [HaircutStylePreference.SHORT]: '短发',
    [HaircutStylePreference.MEDIUM]: '中发',
    [HaircutStylePreference.LONG]: '长发',
    [HaircutStylePreference.BOB]: '波波头',
    [HaircutStylePreference.PIXIE]: '精灵短发',
    [HaircutStylePreference.UNDERCUT]: '两侧剃短',
    [HaircutStylePreference.LAYERED]: '层次发',
    [HaircutStylePreference.BANGS]: '有刘海',
  };

  const hairColorLabels: Record<HairColorPreference, string> = {
    [HairColorPreference.NATURAL_BLACK]: '自然黑',
    [HairColorPreference.BROWN]: '棕色系',
    [HairColorPreference.RED]: '红色系',
    [HairColorPreference.GOLD]: '金色系',
    [HairColorPreference.FASHION_COLOR]: '潮色',
    [HairColorPreference.GRAY]: '奶奶灰',
    [HairColorPreference.TWO_TONE]: '双色',
  };

  const permColorLabels: Record<PermColorPreference, string> = {
    [PermColorPreference.STRAIGHT]: '拉直',
    [PermColorPreference.BIG_CURL]: '大卷',
    [PermColorPreference.SMALL_CURL]: '小卷',
    [PermColorPreference.PERM_ROOTS]: '根烫',
    [PermColorPreference.DIGITAL_PERM]: '数码烫',
    [PermColorPreference.NO_PERM]: '不烫发',
  };

  const treatmentLabels: Record<TreatmentPreference, string> = {
    [TreatmentPreference.DEEP_TREATMENT]: '深层护理',
    [TreatmentPreference.KERATIN]: '角蛋白',
    [TreatmentPreference.SCALP_CARE]: '头皮护理',
    [TreatmentPreference.OIL_TREATMENT]: '精油护理',
    [TreatmentPreference.MOISTURE]: '补水护理',
    [TreatmentPreference.NO_TREATMENT]: '不做护理',
  };

  const hairTypeLabels: Record<HairType, string> = {
    [HairType.DRY]: '干性',
    [HairType.OILY]: '油性',
    [HairType.NORMAL]: '中性',
    [HairType.MIXED]: '混合性',
    [HairType.DAMAGED]: '受损',
    [HairType.COLOR_TREATED]: '染后',
  };

  const hairLengthLabels: Record<HairLength, string> = {
    [HairLength.SUPER_SHORT]: '超短发',
    [HairLength.SHORT]: '短发',
    [HairLength.MEDIUM]: '中发',
    [HairLength.LONG]: '长发',
    [HairLength.SUPER_LONG]: '超长发',
  };

  const visitFrequencyLabels: Record<VisitFrequency, string> = {
    [VisitFrequency.EVERY_2_WEEKS]: '每2周1次',
    [VisitFrequency.EVERY_MONTH]: '每月1次',
    [VisitFrequency.EVERY_2_MONTHS]: '每2个月1次',
    [VisitFrequency.EVERY_3_MONTHS]: '每季度1次',
    [VisitFrequency.IRREGULAR]: '不固定',
  };

  const budgetRangeLabels: Record<BudgetRange, string> = {
    [BudgetRange.UNDER_100]: '100以下',
    [BudgetRange.R100_300]: '100-300',
    [BudgetRange.R300_500]: '300-500',
    [BudgetRange.R500_1000]: '500-1000',
    [BudgetRange.OVER_1000]: '1000以上',
  };

  const communicationStyleLabels: Record<CommunicationStyle, string> = {
    [CommunicationStyle.QUIET]: '安静型',
    [CommunicationStyle.CHATTY]: '聊天型',
    [CommunicationStyle.PROFESSIONAL]: '专业型',
    [CommunicationStyle.NO_PREFERENCE]: '无所谓',
  };

  const extraServiceLabels: Record<ExtraServicePreference, string> = {
    [ExtraServicePreference.HEAD_MASSAGE]: '头部按摩',
    [ExtraServicePreference.FACE_WASH]: '洗脸',
    [ExtraServicePreference.BEARD_TRIM]: '修胡须',
    [ExtraServicePreference.HAIR_WASH]: '特色洗头',
    [ExtraServicePreference.HOT_TOWEL]: '热毛巾',
    [ExtraServicePreference.NO_EXTRA]: '不需要附加服务',
  };

  const visitTimeLabels: Record<VisitTimePreference, string> = {
    [VisitTimePreference.MORNING]: '上午',
    [VisitTimePreference.AFTERNOON]: '下午',
    [VisitTimePreference.EVENING]: '晚上',
    [VisitTimePreference.WEEKEND]: '周末',
    [VisitTimePreference.WEEKDAY]: '工作日',
  };

  // 多选切换
  const toggleMulti = <T extends string>(
    arr: T[],
    setArr: React.Dispatch<React.SetStateAction<T[]>>,
    value: T
  ) => {
    if (arr.includes(value)) {
      setArr(arr.filter(v => v !== value));
    } else {
      setArr([...arr, value]);
    }
  };

  // 多选按钮组组件
  const MultiSelectGroup: React.FC<{
    options: { value: string; label: string }[];
    selected: string[];
    onToggle: (value: string) => void;
    color?: string;
  }> = ({ options, selected, onToggle, color = 'orange' }) => {
    const baseColor =
      color === 'orange'
        ? 'bg-orange-500 text-white border-orange-500'
        : color === 'blue'
        ? 'bg-blue-500 text-white border-blue-500'
        : color === 'pink'
        ? 'bg-pink-500 text-white border-pink-500'
        : color === 'purple'
        ? 'bg-purple-500 text-white border-purple-500'
        : color === 'green'
        ? 'bg-green-500 text-white border-green-500'
        : color === 'indigo'
        ? 'bg-indigo-500 text-white border-indigo-500'
        : color === 'yellow'
        ? 'bg-yellow-500 text-white border-yellow-500'
        : 'bg-orange-500 text-white border-orange-500';

    return (
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                isSelected
                  ? `${baseColor} shadow-sm`
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {isSelected && <Check size={14} className="inline mr-1" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  // 单选按钮组组件
  const SingleSelectGroup: React.FC<{
    options: { value: string; label: string }[];
    selected: string;
    onSelect: (value: string) => void;
    color?: string;
  }> = ({ options, selected, onSelect, color = 'orange' }) => {
    const baseColor =
      color === 'orange'
        ? 'bg-orange-500 text-white border-orange-500'
        : color === 'blue'
        ? 'bg-blue-500 text-white border-blue-500'
        : color === 'green'
        ? 'bg-green-500 text-white border-green-500'
        : color === 'red'
        ? 'bg-red-500 text-white border-red-500'
        : color === 'purple'
        ? 'bg-purple-500 text-white border-purple-500'
        : 'bg-orange-500 text-white border-orange-500';

    return (
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                isSelected
                  ? `${baseColor} shadow-sm`
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; color?: string }> = ({
    icon,
    title,
    subtitle,
    color = 'text-orange-500',
  }) => (
    <div className="flex items-start gap-3 mb-4">
      <div className={`w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-800 text-base">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  const handleAddProduct = () => {
    const val = newProduct.trim();
    if (val && !productsUsed.includes(val)) {
      setProductsUsed([...productsUsed, val]);
      setNewProduct('');
    }
  };

  const handleRemoveProduct = (idx: number) => {
    setProductsUsed(productsUsed.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!customer || !customerId) return;

    setSaving(true);

    const profileData = {
      updatedBy: currentEmployee?.id || '',
      updatedByName: currentEmployee?.name || '技师',
      haircutStyles,
      hairColors,
      permColors,
      treatments,
      hairType,
      hairLength,
      visitFrequency,
      budgetRange,
      communicationStyle,
      extraServices,
      visitTimes,
      notes: notes.trim(),
      allergies: hasAllergies ? allergies.trim() : '无',
      productsUsed,
    };

    try {
      const profilePayload: Partial<Customer['profile']> = {
        updatedBy: currentEmployee?.id || '',
        updatedByName: currentEmployee?.name || '技师',
        haircutStyles,
        hairColors,
        permColors,
        treatments,
        ...(hairType ? { hairType } : {}),
        ...(hairLength ? { hairLength } : {}),
        ...(visitFrequency ? { visitFrequency } : {}),
        ...(budgetRange ? { budgetRange } : {}),
        ...(communicationStyle ? { communicationStyle } : {}),
        extraServices,
        visitTimes,
        notes: notes.trim(),
        allergies: hasAllergies ? allergies.trim() : '无',
        productsUsed,
      };
      const updated = await customerApi.updateProfile(customerId!, profilePayload);
      if (updated) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          navigate(-1);
        }, 1500);
      } else {
        console.error('保存失败: 未返回客户数据');
        alert('保存失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('保存失败:', err);
      alert('保存失败: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="animate-spin text-orange-500" />
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <div className="text-gray-500">未找到客户信息</div>
        <button
          onClick={() => navigate('/shop/customers')}
          className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors"
        >
          返回客户列表
        </button>
      </div>
    );
  }

  const isEditMode = !!customer.profile;

  return (
    <ShopLayout title={isEditMode ? '编辑客户画像' : '新建客户画像'}>
      <div className="min-h-screen bg-gray-50 pb-32">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 客户信息卡片 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white flex-shrink-0">
              <UserCircle size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-800 text-lg">{customer.name}</span>
                {isEditMode && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                    已有画像
                  </span>
                )}
                {!isEditMode && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                    新建画像
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <span>📱 {customer.phone}</span>
                <span>
                  {customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age}岁
                </span>
                <span>消费 {customer.visitCount} 次 · ¥{customer.totalSpent}</span>
              </div>
            </div>
          </div>
        </div>

        {!canEditProfile && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              当前账号无权限编辑客户画像，仅可浏览。
            </div>
          </div>
        )}

        {/* 表单主体 */}
        <div className="space-y-5">
          {/* 发型偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Scissors size={18} />}
              title="发型偏好"
              subtitle="客户喜欢的发型（可多选）"
            />
            <MultiSelectGroup
              options={Object.entries(haircutStyleLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={haircutStyles}
              onToggle={(v) => toggleMulti(haircutStyles, setHaircutStyles, v as HaircutStylePreference)}
              color="orange"
            />
          </div>

          {/* 发色偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Palette size={18} />}
              title="发色偏好"
              subtitle="客户喜欢的发色（可多选）"
            />
            <MultiSelectGroup
              options={Object.entries(hairColorLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={hairColors}
              onToggle={(v) => toggleMulti(hairColors, setHairColors, v as HairColorPreference)}
              color="pink"
            />
          </div>

          {/* 烫染偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Heart size={18} />}
              title="烫染偏好"
              subtitle="喜欢的烫发方式（可多选）"
            />
            <MultiSelectGroup
              options={Object.entries(permColorLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={permColors}
              onToggle={(v) => toggleMulti(permColors, setPermColors, v as PermColorPreference)}
              color="purple"
            />
          </div>

          {/* 护理偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Star size={18} />}
              title="护理偏好"
              subtitle="客户倾向的护理项目（可多选）"
            />
            <MultiSelectGroup
              options={Object.entries(treatmentLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={treatments}
              onToggle={(v) => toggleMulti(treatments, setTreatments, v as TreatmentPreference)}
              color="green"
            />
          </div>

          {/* 发质 / 发长 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <SectionTitle
                icon={<Scissors size={18} />}
                title="发质类型"
                subtitle="单选"
              />
              <SingleSelectGroup
                options={Object.entries(hairTypeLabels).map(([v, l]) => ({ value: v, label: l }))}
                selected={hairType}
                onSelect={(v) => setHairType(v as HairType)}
                color="blue"
              />
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <SectionTitle
                icon={<Scissors size={18} />}
                title="头发长度"
                subtitle="单选"
              />
              <SingleSelectGroup
                options={Object.entries(hairLengthLabels).map(([v, l]) => ({ value: v, label: l }))}
                selected={hairLength}
                onSelect={(v) => setHairLength(v as HairLength)}
                color="blue"
              />
            </div>
          </div>

          {/* 频率 / 预算 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <SectionTitle
                icon={<Clock size={18} />}
                title="预计到店频率"
                subtitle="单选"
              />
              <SingleSelectGroup
                options={Object.entries(visitFrequencyLabels).map(([v, l]) => ({ value: v, label: l }))}
                selected={visitFrequency}
                onSelect={(v) => setVisitFrequency(v as VisitFrequency)}
                color="orange"
              />
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <SectionTitle
                icon={<Wallet size={18} />}
                title="消费预算"
                subtitle="单选（单次平均消费）"
              />
              <SingleSelectGroup
                options={Object.entries(budgetRangeLabels).map(([v, l]) => ({ value: v, label: l }))}
                selected={budgetRange}
                onSelect={(v) => setBudgetRange(v as BudgetRange)}
                color="green"
              />
            </div>
          </div>

          {/* 沟通风格 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<MessageSquare size={18} />}
              title="沟通风格偏好"
              subtitle="客户在服务中喜欢的沟通方式"
            />
            <SingleSelectGroup
              options={Object.entries(communicationStyleLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={communicationStyle}
              onSelect={(v) => setCommunicationStyle(v as CommunicationStyle)}
              color="purple"
            />
          </div>

          {/* 附加服务偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Tag size={18} />}
              title="附加服务偏好"
              subtitle="服务过程中客户愿意尝试的附加项目"
            />
            <MultiSelectGroup
              options={Object.entries(extraServiceLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={extraServices}
              onToggle={(v) => toggleMulti(extraServices, setExtraServices, v as ExtraServicePreference)}
              color="yellow"
            />
          </div>

          {/* 到店时间偏好 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Clock size={18} />}
              title="喜欢的到店时间"
              subtitle="客户习惯的到店时段"
            />
            <MultiSelectGroup
              options={Object.entries(visitTimeLabels).map(([v, l]) => ({ value: v, label: l }))}
              selected={visitTimes}
              onToggle={(v) => toggleMulti(visitTimes, setVisitTimes, v as VisitTimePreference)}
              color="indigo"
            />
          </div>

          {/* 备注 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<MessageSquare size={18} />}
              title="备注"
              subtitle="简单写几句备注（选填）"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：客户对发型细节要求高，喜欢做造型；头皮敏感..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          {/* 过敏信息 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<AlertTriangle size={18} />}
              title="过敏信息"
              subtitle="非常重要！请确认客户是否有过敏史"
            />
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="allergy"
                  checked={!hasAllergies}
                  onChange={() => {
                    setHasAllergies(false);
                    setAllergies('');
                  }}
                  className="text-orange-500"
                />
                <span className="text-sm text-gray-700">无</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="allergy"
                  checked={hasAllergies}
                  onChange={() => setHasAllergies(true)}
                  className="text-orange-500"
                />
                <span className="text-sm text-gray-700">有</span>
              </label>
            </div>
            {hasAllergies && (
              <input
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="请填写具体过敏信息，如：对氨类染发剂过敏"
                className="w-full px-4 py-3 border border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-sm bg-red-50"
              />
            )}
          </div>

          {/* 推荐产品 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <SectionTitle
              icon={<Package size={18} />}
              title="推荐产品"
              subtitle="给客户推荐或使用过的产品（可添加多个）"
            />
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}
                placeholder="输入产品名称，回车或点击添加"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
              />
              <button
                type="button"
                onClick={handleAddProduct}
                className="px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <Plus size={18} />
                添加
              </button>
            </div>
            {productsUsed.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {productsUsed.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-full text-sm"
                  >
                    {p}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(idx)}
                      className="hover:bg-orange-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {productsUsed.length === 0 && (
              <p className="text-sm text-gray-400">暂无推荐产品</p>
            )}
          </div>
        </div>
      </div>

      {/* 底部保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex-1 text-sm text-gray-500 hidden sm:block">
            由 {currentEmployee?.name || '当前技师'} 更新 · {new Date().toLocaleDateString('zh-CN')}
          </div>
          <button
            onClick={() => navigate(-1)}
            disabled={saving}
            className="px-5 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canEditProfile || saving}
            className="flex-1 sm:flex-none sm:px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save size={18} />
                保存画像
              </>
            )}
          </button>
        </div>
      </div>

      {/* 成功提示 */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center animate-pulse">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
              <Check size={36} className="text-white" />
            </div>
            <p className="text-lg font-bold text-gray-800">保存成功</p>
            <p className="text-sm text-gray-500 mt-1">客户画像已更新</p>
          </div>
        </div>
      )}
      </div>
    </ShopLayout>
  );
};

export default CustomerProfileForm;
