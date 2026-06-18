import { Router, Request, Response } from 'express';
import { mockCustomers } from '../_internal/mockData.js';
import { CustomerProfile } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 获取客户画像
router.get('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存�? });
  }

  res.json({
    success: true,
    data: customer.profile || null,
  });
});

// 创建客户画像
router.post('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存�? });
  }

  if (customer.profile) {
    return res.status(400).json({ success: false, error: '该客户已有画像，请使用更新接�? });
  }

  const {
    updatedBy,
    updatedByName,
    haircutStyles = [],
    hairColors = [],
    permColors = [],
    treatments = [],
    hairType,
    hairLength,
    visitFrequency,
    budgetRange,
    communicationStyle,
    extraServices = [],
    visitTimes = [],
    notes = '',
    allergies = '�?,
    productsUsed = [],
  } = req.body;

  const profile: CustomerProfile = {
    id: generateId(),
    customerId,
    updatedBy: updatedBy || '',
    updatedByName: updatedByName || '技�?,
    updatedAt: new Date(),
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
    notes,
    allergies,
    productsUsed,
    createdAt: new Date(),
  };

  customer.profile = profile;

  res.status(201).json({ success: true, data: profile });
});

// 更新客户画像
router.put('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存�? });
  }

  const existing = customer.profile;
  const now = new Date();

  const {
    updatedBy,
    updatedByName,
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
    notes,
    allergies,
    productsUsed,
  } = req.body;

  const updated: CustomerProfile = {
    id: existing?.id || generateId(),
    customerId,
    updatedBy: updatedBy || existing?.updatedBy || '',
    updatedByName: updatedByName || existing?.updatedByName || '技�?,
    updatedAt: now,
    haircutStyles: haircutStyles !== undefined ? haircutStyles : existing?.haircutStyles || [],
    hairColors: hairColors !== undefined ? hairColors : existing?.hairColors || [],
    permColors: permColors !== undefined ? permColors : existing?.permColors || [],
    treatments: treatments !== undefined ? treatments : existing?.treatments || [],
    hairType: hairType || existing?.hairType,
    hairLength: hairLength || existing?.hairLength,
    visitFrequency: visitFrequency || existing?.visitFrequency,
    budgetRange: budgetRange || existing?.budgetRange,
    communicationStyle: communicationStyle || existing?.communicationStyle,
    extraServices: extraServices !== undefined ? extraServices : existing?.extraServices || [],
    visitTimes: visitTimes !== undefined ? visitTimes : existing?.visitTimes || [],
    notes: notes !== undefined ? notes : existing?.notes || '',
    allergies: allergies !== undefined ? allergies : existing?.allergies || '�?,
    productsUsed: productsUsed !== undefined ? productsUsed : existing?.productsUsed || [],
    createdAt: existing?.createdAt || now,
  };

  customer.profile = updated;

  res.json({ success: true, data: updated });
});

export default router;
