import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTabs } from '../contexts/TabContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Customer, Product, Expense, Profile, Visit, VisitCategory, VisitStatus, VisitProduct, VisitExpense } from '../types';
import { generateNextNumber } from '../lib/numberGenerator';
import { createNotification } from '../lib/notifications';
import { PlusIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import ProductSelectionModal from '../components/modals/ProductSelectionModal';
import ExpenseSelectionModal from '../components/modals/ExpenseSelectionModal';
import DatePicker from '../components/ui/DatePicker';


const VisitEditor: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { replaceTab, closeTab } = useTabs();
  const { triggerRefresh } = useRefresh();

  const { current: instance } = useRef({ path: location.pathname, id: params.id });
  const { id, path: instancePath } = instance;

  const [visit, setVisit] = useState<Partial<Visit>>({
    status: 'planned',
    category: 'Maintenance',
  });
  const [visitDateTime, setVisitDateTime] = useState<Date | null>(null);

  const [productsUsed, setProductsUsed] = useState<Partial<VisitProduct>[]>([]);
  const [relatedExpenses, setRelatedExpenses] = useState<Partial<VisitExpense>[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [isSaving, setIsSaving] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const canManageAssignee = profile?.role !== 'field_service_employee';

  const fetchVisitData = useCallback(async () => {
    if (!id || !profile) return;
    setLoading(true);

    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
        navigate('/visits');
        return;
    }

    let query = supabase.from('visits').select('*, customers:customers!left(*), profiles:profiles!left(id, full_name, email)').eq('id', visitId);
    
    if (profile.role !== 'super_admin' && profile.org_id) {
        query = query.eq('org_id', profile.org_id);
    }
    
    const { data: visitData, error } = await query.single();

    if (error || !visitData) {
      alert('Error fetching visit data. ' + (error?.message || 'Not found'));
      navigate('/visits');
      return;
    }

    const { customers, profiles, ...baseVisitData } = visitData;
    
    setVisit({ ...baseVisitData, customers, profiles });
    setVisitDateTime(baseVisitData.visit_date ? new Date(baseVisitData.visit_date) : null);

    const { data: productsData } = await supabase.from('visit_products').select('*, products(*)').eq('visit_id', id);
    setProductsUsed(productsData || []);

    const { data: expensesData } = await supabase.from('visit_expenses').select('*, expenses(*)').eq('visit_id', id);
    setRelatedExpenses(expensesData || []);

    setLoading(false);
  }, [id, profile, navigate]);

  const fetchDataForDropdowns = useCallback(async () => {
    if (!profile) return;
    
    let customersQuery = supabase.from('customers').select('*');
    if (profile.role !== 'super_admin') {
        customersQuery = customersQuery.eq('org_id', profile.org_id);
    }
    const { data: customerData } = await customersQuery;
    setCustomers(customerData || []);

    if (canManageAssignee) {
        let employeesQuery = supabase.from('profiles').select('*');
        if (profile.role !== 'super_admin') {
            employeesQuery = employeesQuery.eq('org_id', profile.org_id);
        }
        const { data: employeeData } = await employeesQuery;
        setEmployees(employeeData || []);
    }
  }, [profile, canManageAssignee]);

  useEffect(() => {
    fetchDataForDropdowns();
    if (id && id !== 'new') {
      fetchVisitData();
    } else {
      const state = location.state as { defaultDate?: string, defaultAssigneeId?: string, customerId?: number } | null;
      
      const initialDate = state?.defaultDate ? new Date(state.defaultDate) : new Date();
      setVisitDateTime(initialDate);

      setVisit(v => ({
        ...v,
        assigned_employee_id: state?.defaultAssigneeId || user?.id,
        customer_id: state?.customerId
      }));
      
      setLoading(false);
    }
  }, [id, fetchDataForDropdowns, fetchVisitData, user, location.state]);

  const handleVisitChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setVisit({ ...visit, [e.target.name]: e.target.value });
  };
  
  const addProductsFromModal = (selectedProducts: Product[]) => {
    const newItems: Partial<VisitProduct>[] = selectedProducts.map(p => ({
        product_id: p.id, quantity: 1, unit_price: p.selling_price, products: p
    }));
    const existingProductIds = new Set(productsUsed.map(p => p.product_id));
    const uniqueNewItems = newItems.filter(item => !existingProductIds.has(item.product_id));
    setProductsUsed(prev => [...prev, ...uniqueNewItems]);
    setIsProductModalOpen(false);
  };
  
  const removeProduct = (index: number) => setProductsUsed(productsUsed.filter((_, i) => i !== index));
  
  const addExpensesFromModal = (selectedExpenses: Expense[]) => {
    const newItems: Partial<VisitExpense>[] = selectedExpenses.map(e => ({ expense_id: e.id, expenses: e }));
    const existingExpenseIds = new Set(relatedExpenses.map(e => e.expense_id));
    const uniqueNewItems = newItems.filter(item => !existingExpenseIds.has(item.expense_id));
    setRelatedExpenses(prev => [...prev, ...uniqueNewItems]);
    setIsExpenseModalOpen(false);
  };
  
  const removeExpense = (index: number) => setRelatedExpenses(relatedExpenses.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!user || !profile?.org_id || !visit.customer_id) {
      alert("Please select a customer.");
      return;
    }
    setIsSaving(true);
    
    const { customers, profiles, visit_products, visit_expenses, ...baseVisitData } = visit;
    const isNewVisit = !id || id === 'new';

    if (!visitDateTime) {
        alert('Please enter a valid visit date and time.');
        setIsSaving(false);
        return;
    }

    const dataToSave = {
        ...baseVisitData,
        visit_date: visitDateTime.toISOString()
    };
    
    try {
      let savedVisit: Visit;
      
      if (isNewVisit) {
        const visitNumber = await generateNextNumber(profile.org_id, 'visit');
        const { data, error } = await supabase.from('visits').insert({ ...dataToSave, user_id: user.id, org_id: profile.org_id, visit_number: visitNumber }).select().single();
        if (error) throw error;
        savedVisit = data;
      } else {
        const { data, error } = await supabase.from('visits').update(dataToSave).eq('id', parseInt(id)).select().single();
        if (error) throw error;
        savedVisit = data;
      }
      
      await supabase.from('visit_products').delete().eq('visit_id', savedVisit.id);
      if (productsUsed.length > 0) {
          const productsToSave = productsUsed.map(p => ({ visit_id: savedVisit.id, product_id: p.product_id, quantity: p.quantity, unit_price: p.unit_price }));
          const { error } = await supabase.from('visit_products').insert(productsToSave);
          if (error) throw new Error('Failed to save products: ' + error.message);
      }
      
      await supabase.from('visit_expenses').delete().eq('visit_id', savedVisit.id);
      if (relatedExpenses.length > 0) {
          const expensesToSave = relatedExpenses.map(e => ({ visit_id: savedVisit.id, expense_id: e.expense_id }));
          const { error } = await supabase.from('visit_expenses').insert(expensesToSave);
          if (error) throw new Error('Failed to save expenses: ' + error.message);
      }
      
      if (savedVisit.assigned_employee_id && savedVisit.assigned_employee_id !== user.id) {
        await createNotification({
            user_id: savedVisit.assigned_employee_id, org_id: profile.org_id,
            title: 'New Visit Assigned', body: `You've been assigned visit #${savedVisit.visit_number} by ${profile.full_name}.`,
            type: 'new_visit', related_entity_path: `/visits/edit/${savedVisit.id}`, related_entity_id: savedVisit.id.toString(),
        });
      }

      alert('Visit saved successfully!');
      triggerRefresh();
      
      if (isNewVisit) {
        replaceTab(instancePath, { path: `/visits/edit/${savedVisit.id}`, label: savedVisit.visit_number });
      } else {
        fetchVisitData();
      }

    } catch (error: any) {
      alert('Error saving visit: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (loading) return <div className="text-center p-8">Loading...</div>;
  
  const visitCategories: VisitCategory[] = ['Maintenance', 'Repair', 'Consulting', 'Training'];
  const visitStatuses: VisitStatus[] = ['planned', 'completed', 'cancelled'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <button onClick={() => closeTab(instancePath)} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeftIcon className="w-4 h-4 mr-2" /> Back
          </button>
          <h1 className="text-3xl font-bold">{id && id !== 'new' ? `${t('visitDetails')} ${visit.visit_number || ''}` : t('newVisit')}</h1>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
          {isSaving ? 'Saving...' : t('save')}
        </button>
      </div>

      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div>
                <label className="block text-sm font-medium">{t('customers')}</label>
                <select name="customer_id" value={visit.customer_id || ''} onChange={handleVisitChange} required className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                  <option value="">Select a customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>)}
                </select>
            </div>
             <div className="mt-1">
                <label className="block text-sm font-medium">{t('visit_date')}</label>
                <DatePicker selected={visitDateTime} onChange={setVisitDateTime} showTimeSelect />
            </div>
             <div>
                <label className="block text-sm font-medium">{t('location')}</label>
                <input type="text" name="location" value={visit.location || ''} onChange={handleVisitChange} required placeholder="e.g., Customer Address" className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"/>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('category')}</label>
                <select name="category" value={visit.category} onChange={handleVisitChange} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize">
                    {visitCategories.map(c => <option key={c} value={c}>{t(c.toLowerCase() as any)}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('assignedEmployee')}</label>
                <select name="assigned_employee_id" value={visit.assigned_employee_id || ''} onChange={handleVisitChange} disabled={!canManageAssignee} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                    <option value="">Unassigned</option>
                    {canManageAssignee ? employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>) : <option value={user?.id}>Me</option>}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('status')}</label>
                <select name="status" value={visit.status} onChange={handleVisitChange} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize">
                    {visitStatuses.map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
            </div>
             <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium">{t('purpose')}</label>
                <textarea name="purpose" value={visit.purpose || ''} onChange={handleVisitChange} rows={3} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"></textarea>
            </div>
          </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{t('productsUsed')}</h2>
                <button onClick={() => setIsProductModalOpen(true)} className="px-3 py-1.5 bg-blue-200 text-blue-800 rounded-md dark:bg-blue-900 dark:text-blue-200 text-sm">{t('addProducts')}</button>
            </div>
            <div className="space-y-2">{productsUsed.map((p, i) => (<div key={i} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-md"><p>{p.products?.name} ({p.products?.product_number})</p><button onClick={() => removeProduct(i)}><TrashIcon className="w-5 h-5 text-red-500"/></button></div>))}</div>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{t('relatedExpenses')}</h2>
                <button onClick={() => setIsExpenseModalOpen(true)} className="px-3 py-1.5 bg-yellow-200 text-yellow-800 rounded-md dark:bg-yellow-900 dark:text-yellow-200 text-sm">{t('addExpenses')}</button>
            </div>
            <div className="space-y-2">{relatedExpenses.map((e, i) => (<div key={i} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-md"><p>{e.expenses?.description} - €{e.expenses?.amount?.toFixed(2)}</p><button onClick={() => removeExpense(i)}><TrashIcon className="w-5 h-5 text-red-500"/></button></div>))}</div>
        </div>
      </div>
      
      {isProductModalOpen && <ProductSelectionModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} onAdd={addProductsFromModal} />}
      {isExpenseModalOpen && <ExpenseSelectionModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onAdd={addExpensesFromModal} />}
    </div>
  );
};

export default VisitEditor;