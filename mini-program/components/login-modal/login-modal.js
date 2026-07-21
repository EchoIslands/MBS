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
    phone: '',
    name: '',
    loggingIn: false,
    error: '',
  },

  methods: {
    onPhoneInput(e) {
      this.setData({ phone: e.detail.value, error: '' });
    },

    onNameInput(e) {
      this.setData({ name: e.detail.value, error: '' });
    },

    onClose() {
      this.setData({ phone: '', name: '', error: '' });
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.onClose();
    },

    onDialogTap() {
      // 阻止冒泡，避免点击弹窗内容关闭
    },

    async onLogin() {
      const { phone, name } = this.data;
      if (!phone || !/^1\d{10}$/.test(phone)) {
        this.setData({ error: '请输入正确的手机号' });
        return;
      }

      this.setData({ loggingIn: true, error: '' });
      try {
        const customer = await loginCustomer(phone, name);
        if (customer && customer.id) {
          setCustomerId(customer.id);
          this.setData({ phone: '', name: '', error: '' });
          this.triggerEvent('success', { customer });
        } else {
          this.setData({ error: '登录失败，请检查手机号' });
        }
      } catch (err) {
        console.error('[login-modal] 登录失败:', err);
        this.setData({ error: err.message || '登录失败，请稍后重试' });
      } finally {
        this.setData({ loggingIn: false });
      }
    },
  },
});
