import { ArrowLeft } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import './customer-page.css';

export function CustomerPageFrame() {
  return <div className="customer-page"><Outlet /></div>;
}

export function CustomerHeader({ title, backTo }: { title: string; backTo?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return <header className="customer-header">
    {backTo && <button type="button" className="customer-back" aria-label="返回" onClick={() => {
      if (location.state?.customerBack === true) navigate(-1);
      else navigate(backTo, { replace: true });
    }}><ArrowLeft size={20} /></button>}
    <h1>{title}</h1>
  </header>;
}
