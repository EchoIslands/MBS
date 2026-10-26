import { Navigate } from 'react-router-dom';

/** Compatibility URL; customer management owns both views and all writes. */
export default function CustomerTableManagement() {
  return <Navigate to="/shop/customers?view=table" replace />;
}
