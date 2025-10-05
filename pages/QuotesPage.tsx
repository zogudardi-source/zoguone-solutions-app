import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Quote, QuoteStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, PencilIcon, TrashIcon, DocumentDuplicateIcon, ChevronUpIcon, ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { convertQuoteToInvoice } from '../lib/conversion';
import generateDocumentPDF from '../lib/pdfGenerator';
import ConfirmModal from '../components/modals/ConfirmModal';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const QuotesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [quoteToConvert, setQuoteToConvert] = useState<Quote | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'issue_date', direction: 'desc' });

  const canCreate = profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchQuotes = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('quotes')
      .select('*, customers:customers!left(name), organizations:organizations!left(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    
    if (searchTerm) {
      // Query 1: Search by quote number
      let quoteNumQuery = supabase.from('quotes').select('id');
      if (profile.role !== 'super_admin') {
        quoteNumQuery = quoteNumQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        quoteNumQuery = quoteNumQuery.eq('status', statusFilter);
      }
      const quoteNumPromise = quoteNumQuery.ilike('quote_number', `%${searchTerm}%`);

      // Query 2: Search by customer name
      let customerNameQuery = supabase.from('quotes').select('id, customers!inner(name)');
      if (profile.role !== 'super_admin') {
        customerNameQuery = customerNameQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        customerNameQuery = customerNameQuery.eq('status', statusFilter);
      }
      const customerNamePromise = customerNameQuery.ilike('customers.name', `%${searchTerm}%`);
      
      const [
          { data: idsFromQuoteNum, error: error1 },
          { data: idsFromCustomerName, error: error2 }
      ] = await Promise.all([
          quoteNumPromise,
          customerNamePromise
      ]);
      
      if (error1 || error2) {
          console.error("Search query failed:", (error1 || error2).message);
          setQuotes([]);
          setLoading(false);
          return;
      }
      
      const quoteIds = new Set([
        ...(idsFromQuoteNum || []).map(i => i.id),
        ...(idsFromCustomerName || []).map(i => i.id)
      ]);

      if (quoteIds.size > 0) {
          query = query.in('id', Array.from(quoteIds));
      } else {
          setQuotes([]);
          setLoading(false);
          return;
      }
    }

    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (error) {
        console.error('Error fetching quotes:', error.message);
        alert(`Error fetching quotes: ${error.message}`);
    } else {
        setQuotes(data as any || []);
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes, refreshKey]);
  
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const handleOpenConfirmModal = (quote: Quote) => {
    setQuoteToConvert(quote);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmConversion = async () => {
    if (!quoteToConvert || !profile) return;
    try {
      setLoading(true);
      const newInvoice = await convertQuoteToInvoice(quoteToConvert.id, profile);
      setIsConfirmModalOpen(false);
      setQuoteToConvert(null);
      alert(`Successfully converted quote to invoice #${newInvoice.invoice_number}.`);
      openTab({ path: `/invoices/edit/${newInvoice.id}`, label: newInvoice.invoice_number });
    } catch (error: any) {
      alert('Conversion failed: ' + error.message);
    } finally {
      setLoading(false);
      fetchQuotes();
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this quote?')) {
      await supabase.from('quote_items').delete().eq('quote_id', id);
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) alert('Error deleting quote: ' + error.message);
      else fetchQuotes();
    }
  };

  const handleDownloadPDF = async (quoteId: number) => {
    await generateDocumentPDF(quoteId, 'quote', language);
  };
  
  const statusColors: { [key in QuoteStatus]: string } = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-300/50',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    accepted: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    declined: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
  };
  
  const quoteStatuses: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined'];

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

  const MobileQuoteCard: React.FC<{ quote: Quote }> = ({ quote }) => (
    <div onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{quote.customers?.name || 'N/A'}</p>
                <p className="text-sm font-mono text-gray-500">{quote.quote_number}</p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[quote.status]} capitalize`}>{t(quote.status as any)}</span>
        </div>
        <div className="flex justify-between items-end text-sm">
            <span className="text-gray-500">{formatEuropeanDate(quote.issue_date)}</span>
            <span className="font-bold text-lg">€{quote.total_amount.toFixed(2)}</span>
        </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('quotes')}</h1>
          {canCreate && (
            <button onClick={() => openTab({ path: '/quotes/new', label: t('newQuote') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('newQuote')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
          <input 
            type="text"
            placeholder="Search by quote # or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | 'all')}
            className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="all">All Statuses</option>
            {quoteStatuses.map(status => (
              <option key={status} value={status} className="capitalize">{t(status as any)}</option>
            ))}
          </select>
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">Loading quotes...</div> : (
          isFieldServiceEmployee ? (
              <div className="space-y-4">
                 {quotes.length > 0 ? quotes.map(quote => (
                    <MobileQuoteCard key={quote.id} quote={quote} />
                  )) : <p className="p-6 text-center text-gray-500">No quotes found.</p>}
              </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                    <tr>
                        <SortableHeader sortKey="quote_number" label="Quote #" />
                        <SortableHeader sortKey="customers.name" label="Customer" />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label="Organization" />}
                        <SortableHeader sortKey="issue_date" label="Issue Date" />
                        <SortableHeader sortKey="total_amount" label="Total" />
                        <SortableHeader sortKey="status" label="Status" />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {quotes.length > 0 ? quotes.map(quote => (
                        <tr key={quote.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} className="font-medium text-primary-600 hover:underline">{quote.quote_number}</button></td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{(quote as any).customers?.name || 'N/A'}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{(quote as any).organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(quote.issue_date)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{quote.total_amount.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[quote.status]} capitalize`}>{t(quote.status as any)}</span></td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {quote.status !== 'accepted' && profile?.role !== 'field_service_employee' && (
                                <button onClick={() => handleOpenConfirmModal(quote)} title={t('convertToInvoice')} className="text-green-600 hover:text-green-800">
                                    <DocumentDuplicateIcon className="w-5 h-5 inline-block"/>
                                </button>
                            )}
                            <button onClick={() => handleDownloadPDF(quote.id)} title="Download PDF"><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                            <button onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} title="Edit"><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                            <button onClick={() => handleDelete(quote.id)} title="Delete"><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                        </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={profile?.role === 'super_admin' ? 7 : 6} className="p-4 text-center text-gray-500">No quotes found.</td></tr>
                    )}
                    </tbody>
                </table>
                </div>
            </div>
          )
        )}
      </div>

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmConversion}
        title={t('convertToInvoice')}
        message={`Are you sure you want to convert Quote #${quoteToConvert?.quote_number} to an invoice? This will also mark the quote as 'accepted'.`}
        confirmText="Convert"
      />
    </>
  );
};

export default QuotesPage;