// 员工自定义密码持久化（自助修改密码）
const EMPLOYEE_PASSWORD_KEY_PREFIX = 'mbs_employee_password_';

export const getEmployeePassword = (employeeId: string): string | undefined => {
  try {
    return localStorage.getItem(`${EMPLOYEE_PASSWORD_KEY_PREFIX}${employeeId}`) || undefined;
  } catch (_e) { return undefined; }
};

export const setEmployeePassword = (employeeId: string, password: string) => {
  try {
    localStorage.setItem(`${EMPLOYEE_PASSWORD_KEY_PREFIX}${employeeId}`, password);
  } catch (_e) { /* ignore */ }
};
