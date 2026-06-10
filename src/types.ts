export interface InvoiceItem {
  itemName: string;
  price: number;
  quantity: number;
  total: number;
}

export interface Invoice {
  id: string;
  customerName: string;
  address: string;
  phone: string;
  items: InvoiceItem[];
  notes: string;
  totalAmount: number;
  shippingCost?: number;
  isSynced?: boolean;
  createdAt: string;
}

export interface ExcelFile {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  status: "synced" | "pending" | "failed";
  recordsCount: number;
}

export type ActiveTab = 
  | "dashboard" 
  | "data_entry" 
  | "invoices" 
  | "excel_management" 
  | "analytics" 
  | "settings";
