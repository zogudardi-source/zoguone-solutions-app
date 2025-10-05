import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTabs } from '../contexts/TabContext';
import { Customer, Product, Quote, QuoteItem, QuoteStatus, UserRole } from '../types';
import { GERMAN_VAT_RATES } from '../constants';
import { generateNextNumber } from '../lib/numberGenerator';
import generateDocumentPDF from '../lib/pdfGenerator';
import { PlusIcon, TrashIcon, ArrowDownTrayIcon, EllipsisVerticalIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import CustomerModal from '../components/modals/CustomerModal';
import ProductSelectionModal from '../components/modals/ProductSelectionModal';
import DatePicker from '../components/ui/DatePicker';
import { format } from 'date-fns';
import { parseAsLocalDate } from '../lib/formatting';

const QuoteEditor: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { closeTab, updateTabLabel, replaceTab } = useTabs();

  const { current: instance } = useRef({ path: location.pathname, id: params.id });
  const { id, path: instancePath } = instance;

  const [quote, setQuote] = useState<Partial<Quote>>({
    issue_date: new Date().toISOString(),
    valid_until_date: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString(),
    status: 'draft',
    customer_id: undefined,
  });
  const [items, setItems] = useState<Partial<QuoteItem>[]>([{ description: '', quantity: 1, unit_price: 0, vat_rate: 19 }]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canSave = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return false;
    const isAccepted = quote?.status === 'accepted';
    if (isAccepted) return profile.role === 'admin';
    const allowedRoles: UserRole[] = ['admin', 'key_user', 'field_service_employee'];
    return allowedRoles.includes(profile.role);
  }, [profile, quote?.status]);

  const isReadOnly = !canSave;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  const fetchData = useCallback(async () => {
    if (!id || !profile) return;
    setLoading(true);

    const quoteId = parseInt(id, 10);
    if (isNaN(quoteId)) {
      console.error("Invalid quote ID from URL:", id);
      navigate('/quotes');
      return;
    }

    let query = supabase
      .from('quotes')
      .select('*, quote_items:quote_items!left(*), customers:customers!left(*)')
      .eq('id', quoteId);

    if (profile.role !== 'super_admin' && profile.org_id) {
        query = query.eq('org_id', profile.org_id);
    }
    
    const { data, error } = await query.single();

    if (error || !data) {
      const errorMessage = error?.message || 'Quote not found or access denied.';
      console.error('Error fetching quote:', errorMessage);
      navigate('/quotes');
      return;
    }

    const { quote_items, customers, ...quoteData } = data;
    setQuote({ ...quoteData, customers });
    setItems(quote_items || []);
    updateTabLabel(instancePath, quoteData.quote_number);
    setLoading(false);
  }, [id, profile, navigate, instancePath, updateTabLabel]);

  const fetchCustomersAndProducts = useCallback(async () => {
    if (!profile) return;
    
    let query = supabase.from('customers').select('*');
    if (profile.role !== 'super_admin') {
        query = query.eq('org_id', profile.org_id);
    }
    const { data: customerData } = await query;
    setCustomers(customerData || []);
  }, [profile]);

  useEffect(() => {
    fetchCustomersAndProducts();
    if (id && id !== 'new') {
      fetchData();
    } else {
      const state = location.state as { customerId?: number } | null;
      if (state?.customerId) {
          setQuote(q => ({ ...q, customer_id: state.customerId }));
      }
      setLoading(false);
    }
  }, [id, fetchCustomersAndProducts, fetchData, location.state]);

  useEffect(() => {
    if (!isReadOnly) {
        const newTotal = items.reduce((acc, item) => {
            const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
            const vatAmount = itemTotal * ((item.vat_rate || 0) / 100);
            return acc + itemTotal + vatAmount;
        }, 0);
        setQuote(q => ({...q, total_amount: newTotal }));
    }
  }, [items, isReadOnly]);

  const handleQuoteChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setQuote({ ...quote, [e.target.name]: e.target.value });
  };
  
  const handleDateChange = (name: 'issue_date' | 'valid_until_date', date: Date | null) => {
    if (date) {
        setQuote({ ...quote, [name]: date.toISOString() });
    }
  };

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    (item as any)[field] = value;
    
    if (profile?.role === 'field_service_employee' && field === 'unit_price' && item.product_id) {
        return;
    }

    newItems[index] = item;
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0, vat_rate: 19 }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  
  const addProductsFromModal = (selectedProducts: Product[]) => {
    const newItems = selectedProducts.map(p => ({
      product_id: p.id, description: p.name, quantity: 1, unit_price: p.selling_price, vat_rate: 19,
    }));
    setItems(prev => [...prev.filter(i => i.description), ...newItems]);
    setIsProductModalOpen(false);
  };
  
  const handleCloseEditor = () => {
    closeTab(instancePath);
  };

  const handleSave = async () => {
    if (!canSave || !user || !profile?.org_id || !quote.customer_id) {
      alert("Please select a customer.");
      return;
    }
    setIsSaving(true);
    
    const { customers, quote_items, organizations, ...quoteDataToSave } = quote;
    const isNewQuote = !id || id === 'new';

    const issueDate = parseAsLocalDate(quoteDataToSave.issue_date);
    const validUntilDate = parseAsLocalDate(quoteDataToSave.valid_until_date);

    if (!issueDate || !validUntilDate) {
        alert('Issue date and valid until date are required.');
        setIsSaving(false);
        return;
    }
    
    const issueDateISO = format(issueDate, 'yyyy-MM-dd');
    const validUntilDateISO = format(validUntilDate, 'yyyy-MM-dd');

    try {
      let savedQuote: Quote;

      if (isNewQuote) {
        const quoteNumber = await generateNextNumber(profile.org_id, 'quote');
        const { data, error } = await supabase.from('quotes').insert({
          ...quoteDataToSave,
          issue_date: issueDateISO,
          valid_until_date: validUntilDateISO,
          user_id: user.id, 
          org_id: profile.org_id, 
          quote_number: quoteNumber,
        }).select().single();
        if (error) throw error;
        savedQuote = data;
      } else {
        const { data, error } = await supabase.from('quotes').update({
          ...quoteDataToSave,
          issue_date: issueDateISO,
          valid_until_date: validUntilDateISO,
        }).eq('id', parseInt(id)).select().single();
        if (error) throw error;
        savedQuote = data;
      }
      
      const itemsToSave = items.map(item => ({ ...item, quote_id: savedQuote.id }));
      await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id);
      if (itemsToSave.length > 0) {
        const { error: itemsError } = await supabase.from('quote_items').insert(itemsToSave.map(({ id, ...rest }) => rest));
        if (itemsError) throw itemsError;
      }
      
      alert('Quote saved successfully!');

      if (isNewQuote) {
        replaceTab(instancePath, {
          path: `/quotes/edit/${savedQuote.id}`,
          label: savedQuote.quote_number,
        });
      } else {
        fetchData();
      }
    } catch (error: any) {
      alert('Error saving quote: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    const vatTotals: { [key: number]: number } = {};
    items.forEach(item => {
      const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
      subtotal += itemTotal;
      const vatRate = item.vat_rate || 0;
      const vatAmount = itemTotal * (vatRate / 100);
      vatTotals[vatRate] = (vatTotals[vatRate] || 0) + vatAmount;
    });
    const totalVat = Object.values(vatTotals).reduce((a, b) => a + b, 0);
    const grandTotal = subtotal + totalVat;
    return { subtotal, vatTotals, totalVat, grandTotal };
  }, [items]);

  const handleDownloadPdf = async () => {
    if (!id || id === 'new') return;
    await generateDocumentPDF(parseInt(id, 10), 'quote', language);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{id && id !== 'new' ? `${isReadOnly ? 'View' : 'Edit'} Quote ${quote.quote_number || ''}` : t('newQuote')}</h1>
        </div>
        <div className="flex items-center gap-x-2">
            {canSave && <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
                {isSaving ? 'Saving...' : t('save')}
            </button>}
             <button onClick={handleCloseEditor} className="px-6 py-2 bg-gray-200 rounded-md font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">
                {isReadOnly ? 'Close' : 'Cancel'}
            </button>
            {id && id !== 'new' && (
              <div className="relative" ref={menuRef}>
                  <button onClick={() => setIsMenuOpen(p => !p)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                      <EllipsisVerticalIcon className="w-6 h-6"/>
                  </button>
                  {isMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
                         <button onClick={handleDownloadPdf} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowDownTrayIcon className="w-5 h-5"/> Download PDF</button>
                      </div>
                  )}
              </div>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <div>
          <label className="block text-sm font-medium">{t('customers')}</label>
          <div className="flex items-center space-x-2">
            <select name="customer_id" value={quote.customer_id || ''} onChange={handleQuoteChange} required disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
              <option value="">Select a customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>)}
            </select>
             {!isReadOnly && <button onClick={() => setIsCustomerModalOpen(true)} className="mt-1 p-2 bg-gray-200 rounded-md dark:bg-gray-600"><PlusIcon className="w-5 h-5"/></button>}
          </div>
        </div>
        <div className="mt-1">
          <label className="block text-sm font-medium">Issue Date</label>
          <DatePicker selected={parseAsLocalDate(quote.issue_date)} onChange={(date) => handleDateChange('issue_date', date)} />
        </div>
        <div className="mt-1">
          <label className="block text-sm font-medium">{t('valid_until')}</label>
          <DatePicker selected={parseAsLocalDate(quote.valid_until_date)} onChange={(date) => handleDateChange('valid_until_date', date)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select name="status" value={quote.status} onChange={handleQuoteChange} disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
            {(['draft', 'sent', 'accepted', 'declined'] as QuoteStatus[]).map(s => <option key={s} value={s}>{t(s as any)}</option>)}
          </select>
        </div>
      </div>
      
      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">Items</h2>
        <div className="overflow-x-auto -mx-6">
            <table className="min-w-full">
            <thead className="border-b dark:border-gray-700"><tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                <th className="px-6 py-2">Description</th><th className="px-6 py-2 w-24">Qty</th><th className="px-6 py-2 w-32">Unit Price</th><th className="px-6 py-2 w-28">VAT %</th><th className="px-6 py-2 w-32">Total</th><th className="w-10 px-6"></th>
            </tr></thead>
            <tbody>{items.map((item, index) => {
                const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
                const vatAmount = itemTotal * ((item.vat_rate || 0) / 100);
                const isPriceLocked = profile?.role === 'field_service_employee' && !!item.product_id;
                
                return (
                    <tr key={index} className="border-b dark:border-gray-700">
                        <td className="px-6 py-2"><input type="text" value={item.description || ''} onChange={(e) => handleItemChange(index, 'description', e.target.value)} readOnly={isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/></td>
                        <td className="px-6 py-2"><input type="number" value={item.quantity || ''} onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))} readOnly={isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/></td>
                        <td className="px-6 py-2"><input type="number" step="0.01" value={item.unit_price || ''} onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))} readOnly={isReadOnly || isPriceLocked} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/></td>
                        <td className="px-6 py-2"><select value={item.vat_rate} onChange={(e) => handleItemChange(index, 'vat_rate', parseInt(e.target.value))} disabled={isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">{GERMAN_VAT_RATES.map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select></td>
                        <td className="px-6 py-2 text-right font-medium">€{(itemTotal + vatAmount).toFixed(2)}</td>
                        <td className="px-6">{!isReadOnly && <button onClick={() => removeItem(index)}><TrashIcon className="w-5 h-5 text-red-500"/></button>}</td>
                    </tr>
                );
            })}</tbody>
            </table>
        </div>
        {!isReadOnly && <div className="flex space-x-2 mt-4">
            <button onClick={addItem} className="px-4 py-2 bg-gray-200 rounded-md dark:bg-gray-600 text-sm">Add Item</button>
            <button onClick={() => setIsProductModalOpen(true)} className="px-4 py-2 bg-blue-200 text-blue-800 rounded-md dark:bg-blue-900 dark:text-blue-200 text-sm">Add Product</button>
        </div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800"><h3 className="font-bold mb-2">Notes</h3><textarea name="notes" value={quote.notes || ''} onChange={handleQuoteChange} rows={4} readOnly={isReadOnly} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"></textarea></div>
          <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-2"><div className="flex justify-between"><span>Subtotal:</span><span>€{totals.subtotal.toFixed(2)}</span></div>
              {Object.entries(totals.vatTotals).map(([rate, amount]) => (<div key={rate} className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>VAT ({rate}%):</span><span>€{(amount as number).toFixed(2)}</span></div>))}
              <hr className="dark:border-gray-600"/><div className="flex justify-between text-xl font-bold"><span >Total:</span><span>€{quote.total_amount?.toFixed(2) || '0.00'}</span></div>
          </div>
      </div>
      
      {isCustomerModalOpen && <CustomerModal customer={null} closeModal={() => setIsCustomerModalOpen(false)} onSave={() => { fetchCustomersAndProducts(); setIsCustomerModalOpen(false); }} />}
      {isProductModalOpen && <ProductSelectionModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} onAdd={addProductsFromModal} />}
    </div>
  );
};

export default QuoteEditor;