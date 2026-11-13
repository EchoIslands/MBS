/** Synthetic HTTP/SQL fixture fields; unlisted columns remain unknown. */
export interface FixtureRow extends Record<string, unknown> {
  id?: string;
  shop_id?: string;
  customer_id?: string;
  name?: string;
  status?: string;
  payment_status?: string;
  created_at?: string;
  password_hash?: string;
  stored_value_balance?: number;
  total?: number;
  items?: FixtureRow[];
  services?: FixtureRow[];
  opening_hours?: Record<string, unknown>;
}

export interface FixtureRpcArgs extends Record<string, unknown> {
  p_action?: string;
  p_after_id?: string;
  p_customer_id?: string;
  p_data?: FixtureRow;
  p_expected_balance?: number;
  p_new_balance?: number;
  p_order_id?: string;
  p_order_no?: string;
  p_outcome?: string;
  p_paid_at?: string;
  p_payment_id?: string;
  p_settlement?: FixtureRow;
  p_settlement_id?: string;
  p_shop_id?: string;
  p_token?: string;
}
