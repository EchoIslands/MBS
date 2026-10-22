import { loginCustomer } from '../../api/customer';
import { setCustomerId } from '../../utils/storage';

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    password: '',
    confirmPassword: '',
    setupRequired: false,
    phone: '',
    loggingIn: false,
    error: '',
  },

  methods: {
    onPasswordInput(e) { this.setData({ password: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
    onConfirmPasswordInput(e) { this.setData({ confirmPassword: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

    onPhoneInput(e) {
      this.setData({ phone: e.detail.value, error: '' });
    },

    onClose() {
      this.setData({ phone: '', password: '', confirmPassword: '', setupRequired: false, error: '' });
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.onClose();
    },

    onDialogTap() {
      // 阻止冒泡，避免点击弹窗内容关闭
    },

    async onLogin() {
      const { phone, password, confirmPassword, setupRequired } = this.data;
      if (!phone || !/^1\d{10}$/.test(phone)) {
        this.setData({ error: '请输入正确的手机号' });
        return;
      }

      this.setData({ loggingIn: true, error: '' });
      try {
        if (password && !/^\d{6}$/.test(password)) throw new Error('密码必须为六位数字');
        if (setupRequired && password !== confirmPassword) throw new Error('两次输入的密码不一致');
        const result = await loginCustomer(phone, password, setupRequired);
        if (result.setupRequired) { this.setData({ setupRequired: true, password: '', confirmPassword: '' }); return; }
        const customer = result.customer;
        if (customer && customer.id) {
          setCustomerId(customer.id);
          if (customer.mustChangePassword) {
            this.setData({ password: '', confirmPassword: '' });
            wx.reLaunch({ url: '/pages/change-password/change-password' }); return;
          }
          this.setData({ phone: '', name: '', password: '', confirmPassword: '', setupRequired: false, error: '' });
          this.triggerEvent('success', { customer });
        } else {
          this.setData({ error: '登录失败，请检查手机号' });
        }
      } catch (err) {
        this.setData({ error: err.message || '登录失败，请稍后重试' });
      } finally {
        this.setData({ loggingIn: false });
      }
    },
  },
});
