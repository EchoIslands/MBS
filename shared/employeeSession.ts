// A selector for routes that accept both employees and customers. It contains no credential.
export const EMPLOYEE_SESSION_SELECTOR = 'employee-session';
export const EMPLOYEE_SESSION_COOKIE = 'mbs_employee_auth';
export const EMPLOYEE_SESSION_EXPIRED_HEADER = 'X-MBS-Employee-Session-Expired';
export const EMPLOYEE_SESSION_EXPIRED_EVENT = 'mbs:employee-session-expired';
