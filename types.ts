// Fix: Created missing types.ts file.

export type UserRole = 'super_admin' | 'admin' | 'key_user' | 'field_service_employee';
export type Plan = 'free' | 'pro';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';
export type VisitStatus = 'planned' | 'completed' | 'cancelled';
export type VisitCategory = 'Maintenance' | 'Repair' | 'Consulting' | 'Training';
export type NotificationType = 'new_task' | 'new_visit' | 'new_appointment' | 'generic';
export type AppointmentStatus = 'draft' | 'open' | 'in_progress' | 'done';


export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  phone: string;
  current_plan: Plan;
  role: UserRole;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  ust_idnr: string;
  iban: string;
  bic: string;
  logo_url: string;
}

export interface Customer {
  id: number;
  user_id: string;
  org_id: string;
  customer_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes?: string | null;
  organizations?: Organization;
}

export interface Product {
  id: number;
  user_id: string;
  org_id: string;
  product_number: string;
  name: string;
  description: string | null;
  selling_price: number;
  stock_level: number | null;
  organizations?: Organization;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface Invoice {
  id: number;
  user_id: string;
  org_id: string;
  customer_id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  status: InvoiceStatus;
  notes: string | null;
  customers?: Customer; // Joined data
  invoice_items?: InvoiceItem[]; // Joined data
  organizations?: Organization; // Joined data
}

export interface QuoteItem {
  id: number;
  quote_id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface Quote {
  id: number;
  user_id: string;
  org_id: string;
  customer_id: number;
  quote_number: string;
  issue_date: string;
  valid_until_date: string;
  total_amount: number;
  status: QuoteStatus;
  notes: string | null;
  customers?: Customer; // Joined data
  quote_items?: QuoteItem[]; // Joined data
  organizations?: Organization; // Joined data
}

export interface Expense {
  id: number;
  user_id: string;
  org_id: string;
  expense_number: string;
  expense_date: string;
  description: string;
  amount: number;
  category: string | null;
  organizations?: Organization;
}

export interface Task {
  id: string;
  user_id: string;
  org_id: string;
  customer_id: number | null;
  title: string;
  due_date: string | null;
  is_complete: boolean;
  customers?: Customer; // Joined data
}

export interface Appointment {
  id: number;
  user_id: string;
  org_id: string;
  customer_id: number;
  appointment_number: string;
  title: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  status: AppointmentStatus;
  customers?: Customer; // Joined data
  organizations?: Organization; // Joined data
}

export interface VisitProduct {
    visit_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    products?: Product; // Joined data
}

export interface VisitExpense {
    visit_id: number;
    expense_id: number;
    expenses?: Expense; // Joined data
}

export interface Visit {
    id: number;
    user_id: string;
    org_id: string;
    customer_id: number;
    assigned_employee_id: string | null;
    visit_number: string;
    visit_date: string;
    location: string;
    category: VisitCategory;
    purpose: string | null;
    status: VisitStatus;
    customers?: Customer; // Joined data
    profiles?: Profile; // Joined data (for assigned employee)
    visit_products?: VisitProduct[]; // Joined data
    visit_expenses?: VisitExpense[]; // Joined data
}

export interface UserInvitation {
    id: string;
    org_id: string;
    invited_by_user_id: string;
    invited_user_email: string;
    role: UserRole;
    status: 'pending' | 'accepted';
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface RolePermissions {
  id?: number;
  org_id: string;
  role: UserRole;
  permissions: {
    modules: string[];
  };
}

export interface Notification {
  id: string;
  user_id: string; // Recipient
  org_id: string;
  created_at: string;
  title: string;
  body: string;
  type: NotificationType;
  related_entity_id: string | null;
  related_entity_path: string | null;
  is_read: boolean;
}