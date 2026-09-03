import { Product, CATALOG as CAPSULE_CATALOG } from './index.js';

export interface Merchant {
  id: string;
  name: string;
  catalog: Product[];
}

export const CLOUDOPS_CATALOG: Product[] = [
  {
    id: 'sku_cloud_vm_basic',
    name: 'Basic Cloud VM',
    description: '1 vCPU, 2GB RAM, 20GB SSD for light workloads.',
    priceInPaise: 50000, // ₹500
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'monthly_only',
        message: 'Billed monthly.',
      },
      {
        type: 'no_proration',
        message: 'No daily proration for partial months.',
      },
    ],
    relatedSkuId: 'sku_cloud_backup',
  },
  {
    id: 'sku_cloud_vm_pro',
    name: 'Pro Cloud VM',
    description: '4 vCPU, 16GB RAM, 100GB NVMe for production workloads.',
    priceInPaise: 200000, // ₹2000
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'monthly_only',
        message: 'Billed monthly.',
      },
      {
        type: 'no_proration',
        message: 'No daily proration for partial months.',
      },
    ],
    relatedSkuId: 'sku_cloud_backup',
  },
  {
    id: 'sku_cloud_backup',
    name: 'Automated Daily Backups',
    description: 'Add-on for automated daily snapshots retained for 30 days.',
    priceInPaise: 30000, // ₹300
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'monthly_only',
        message: 'Billed monthly alongside the primary instance.',
      },
    ],
  },
  {
    id: 'sku_data_egress_1tb',
    name: '1TB Data Egress Pack',
    description: 'Prepaid bandwidth for outbound traffic.',
    priceInPaise: 150000, // ₹1500
    currency: 'INR',
    billingType: 'one-time',
    constraints: [],
  },
];

export const MERCHANTS: Record<string, Merchant> = {
  'capsule-demo-store': {
    id: 'capsule-demo-store',
    name: 'Capsule Store',
    catalog: CAPSULE_CATALOG,
  },
  'cloudops-hosting': {
    id: 'cloudops-hosting',
    name: 'CloudOps Hosting',
    catalog: CLOUDOPS_CATALOG,
  },
};
