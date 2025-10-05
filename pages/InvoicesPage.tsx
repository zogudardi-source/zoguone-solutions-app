import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Invoice, InvoiceStatus } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, EnvelopeIcon, ArrowDownTrayIcon, EyeIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import generateDocumentPDF from '../lib/pdfGenerator';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const InvoicesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'issue_date', direction: 'desc' });
  
  const canCreate = profile?.role !== 'field_service_employee' && profile?.role !== 'super_admin';
  const canManage = profile?.role !== 'field_service_employee';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchInvoices = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('invoices')
      .select('*, customers:customers!left(name, email), organizations:organizations!left(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    
    if (searchTerm) {
      // Query 1: Search by invoice number
      let invoiceNumQuery = supabase.from('invoices').select('id');
      if (profile.role !== 'super_admin') {
        invoiceNumQuery = invoiceNumQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        invoiceNumQuery = invoiceNumQuery.eq('status', statusFilter);
      }
      const invoiceNumPromise = invoiceNumQuery.ilike('invoice_number', `%${searchTerm}%`);

      // Query 2: Search by customer name
      let customerNameQuery = supabase.from('invoices').select('id, customers!inner(name)');
      if (profile.role !== 'super_admin') {
        customerNameQuery = customerNameQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        customerNameQuery = customerNameQuery.eq('status', statusFilter);
      }
      const customerNamePromise = customerNameQuery.ilike('customers.name', `%${searchTerm}%`);


      const [
          { data: idsFromInvoiceNum, error: error1 },
          { data: idsFromCustomerName, error: error2 }
      ] = await Promise.all([
          invoiceNumPromise,
          customerNamePromise
      ]);

      if (error1 || error2) {
          console.error("Search query failed:", (error1 || error2).message);
          setInvoices([]);
          setLoading(false);
          return;
      }

      const invoiceIds = new Set([
          ...(idsFromInvoiceNum || []).map(i => i.id),
          ...(idsFromCustomerName || []).map(i => i.id)
      ]);

      if (invoiceIds.size > 0) {
          query = query.in('id', Array.from(invoiceIds));
      } else {
          setInvoices([]);
          setLoading(false);
          return;
      }
    }

    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (error) {
        console.error('Error fetching invoices:', error.message);
        alert(`Error fetching invoices: ${error.message}`);
    } else {
        setInvoices(data as any || []);
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices, refreshKey]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) alert('Error deleting invoice: ' + error.message);
      else fetchInvoices();
    }
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    await generateDocumentPDF(invoiceId, 'invoice', language);
  };

  const handleSendEmail = async (invoice: Invoice) => {
    if (!invoice.customers?.email) {
      alert("This customer does not have an email address saved.");
      return;
    }
    await generateDocumentPDF(invoice.id, 'invoice', language);
    const subject = `Invoice ${invoice.invoice_number} from your company`;
    const body = `Dear ${invoice.customers?.name},\n\nPlease find attached the invoice for your recent transaction.\n\n(Remember to attach the PDF you just downloaded!)\n\nBest regards,\nYour Company`;
    window.location.href = `mailto:${invoice.customers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  
  const statusColors: { [key in InvoiceStatus]: string } = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-300/50',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
  };
  
  const invoiceStatuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];

  const SortableHeader: React.FC<{ sortKey: string; label: string; }> = ({ sortKey, label }) => (
    <th 
        className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        onClick={() => handleSort(sortKey)}
    >
        <div className="flex items-center">
            <span>{label}</span>
            {sortConfig.key === sortKey && (
                sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
            )}
        </div>
    </th>
  );

  const MobileInvoiceCard: React.FC<{ invoice: Invoice }> = ({ invoice }) => (
    <div onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{invoice.customers?.name || 'N/A'}</p>
                <p className="text-sm font-mono text-gray-500">{invoice.invoice_number}</p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span>
        </div>
        <div className="flex justify-between items-end text-sm">
            <span className="text-gray-500">{formatEuropeanDate(invoice.issue_date)}</span>
            <span className="font-bold text-lg">€{invoice.total_amount.toFixed(2)}</span>
        </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('invoices')}</h1>
        {canCreate && (
          <button onClick={() => openTab({ path: '/invoices/new', label: t('newInvoice') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
            <PlusIcon className="w-5 h-5 mr-2" /> {t('newInvoice')}
          </button>
        )}
      </div>

      <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
        <input 
          type="text"
          placeholder="Search by invoice # or customer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        />
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="all">All Statuses</option>
          {invoiceStatuses.map(status => (
            <option key={status} value={status} className="capitalize">{t(status as any)}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="p-6 text-center text-gray-500">Loading invoices...</div> : (
        isFieldServiceEmployee ? (
            <div className="space-y-4">
               {invoices.length > 0 ? invoices.map(invoice => (
                  <MobileInvoiceCard key={invoice.id} invoice={invoice} />
                )) : <p className="p-6 text-center text-gray-500">No invoices found.</p>}
            </div>
        ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full">
                <thead>
                    <tr>
                    <SortableHeader sortKey="invoice_number" label="Invoice #" />
                    <SortableHeader sortKey="customers.name" label="Customer" />
                    {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label="Organization" />}
                    <SortableHeader sortKey="issue_date" label="Issue Date" />
                    <SortableHeader sortKey="total_amount" label="Total" />
                    <SortableHeader sortKey="status" label="Status" />
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                    {invoices.length > 0 ? invoices.map(invoice => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="font-medium text-primary-600 hover:underline">{invoice.invoice_number}</button></td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{invoice.customers?.name || 'N/A'}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{invoice.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(invoice.issue_date)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{invoice.total_amount.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span></td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} title="Edit / View"><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                        {canManage && (
                            <>
                            <button onClick={() => handleSendEmail(invoice)} title="Send Email"><EnvelopeIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                            <button onClick={() => handleDownloadPDF(invoice.id)} title="Download PDF"><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                            <button onClick={() => handleDelete(invoice.id)} title="Delete"><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                            </>
                        )}
                        </td>
                    </tr>
                    )) : (
                    <tr><td colSpan={profile?.role === 'super_admin' ? 7 : 6} className="p-4 text-center text-gray-500">No invoices found.</td></tr>
                    )}
                </tbody>
                </table>
                </div>
            </div>
            )
        )}
    </div>
  );
};

export default InvoicesPage;