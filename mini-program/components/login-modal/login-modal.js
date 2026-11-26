import { loginCustomer, loginCustomerWithSms, sendCustomerSmsCode } from '../../api/customer';
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
    passwordSmsStep: false,
    smsCode: '',
    smsSending: false,
    smsSeconds: 0,
    phone: '',
    loggingIn: false,
    error: '',
  },

  lifetimes: { detached() { clearInterval(this.smsTimer); } },

  methods: {
    openSmsLogin() {
      if (this.data.loggingIn) return;
      wx.navigateTo({ url: '/pages/login/login?mode=sms' });
    },
    onPasswordInput(e) { this.setData({ password: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
    onConfirmPasswordInput(e) { this.setData({ confirmPassword: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
    onSmsCodeInput(e) { this.setData({ smsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

    async onSendSmsCode() {
      if (!this.passwordChallenge || this.data.loggingIn || this.data.smsSending || this.data.smsSeconds > 0) return;
      this.setData({ smsSending: true, error: '' });
      try {
        await sendCustomerSmsCode(this.data.phone);
        this.setData({ smsSeconds: 60 });
        clearInterval(this.smsTimer);
        this.smsTimer = setInterval(() => {
          const remaining = Math.max(0, this.data.smsSeconds - 1);
          this.setData({ smsSeconds: remaining });
          if (!remaining) clearInterval(this.smsTimer);
        }, 1000);
      } catch (err) {
        this.setData({ error: err.message || '验证码发送失败，请稍后重试' });
      } finally {
        this.setData({ smsSending: false });
      }
    },

    onPhoneInput(e) {
      this.passwordChallenge = undefined;
      this.setData({ phone: e.detail.value, passwordSmsStep: false, smsCode: '', password: '', error: '' });
    },

    onClose() {
      if (this.data.loggingIn || this.data.smsSending) return;
      this.passwordChallenge = undefined;
      clearInterval(this.smsTimer);
      this.setData({ phone: '', password: '', confirmPassword: '', setupRequired: false, passwordSmsStep: false, smsCode: '', smsSeconds: 0, error: '' });
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.onClose();
    },

    onDialogTap() {
      // 阻止冒泡，避免点击弹窗内容关闭
    },

    async onLogin() {
      if (this.data.loggingIn || this.data.smsSending) return;
      const { phone, password, confirmPassword, setupRequired } = this.data;
      if (!phone || !/^1\d{10}$/.test(phone)) {
        this.setData({ error: '请输入正确的手机号' });
        return;
      }

      this.setData({ loggingIn: true, error: '' });
      try {
        if (!this.passwordChallenge && !/^\d{6}$/.test(password)) throw new Error('密码必须为六位数字');
        if (setupRequired && password !== confirmPassword) throw new Error('两次输入的密码不一致');
        if (this.passwordChallenge && !/^\d{6}$/.test(this.data.smsCode)) throw new Error('请输入六位短信验证码');
        const result = this.passwordChallenge
          ? { customer: await loginCustomerWithSms(phone, this.data.smsCode, this.passwordChallenge) }
          : await loginCustomer(phone, password, setupRequired);
        if (result.passwordChallenge) {
          this.passwordChallenge = result.passwordChallenge;
          this.setData({ passwordSmsStep: true, password: '', confirmPassword: '', smsCode: '' });
          return;
        }
        if (result.setupRequired) { this.setData({ setupRequired: true, password: '', confirmPassword: '' }); return; }
        const customer = result.customer;
        if (customer && customer.id) {
          this.passwordChallenge = undefined;
          clearInterval(this.smsTimer);
          setCustomerId(customer.id);
          if (customer.mustChangePassword) {
            this.setData({ password: '', confirmPassword: '' });
            wx.reLaunch({ url: '/pages/change-password/change-password' }); return;
          }
          this.setData({ phone: '', name: '', password: '', confirmPassword: '', setupRequired: false, passwordSmsStep: false, smsCode: '', smsSeconds: 0, error: '' });
          this.triggerEvent('success', { customer });
        } else {
          this.setData({ error: '登录失败，请检查手机号' });
        }
      } catch (err) {
        if (err.response?.code === 'PASSWORD_CHALLENGE_EXPIRED') {
          this.passwordChallenge = undefined;
          this.setData({ passwordSmsStep: false, smsCode: '' });
        }
        this.setData({ error: err.message || '登录失败，请稍后重试' });
      } finally {
        this.setData({ loggingIn: false });
      }
    },
  },
});
