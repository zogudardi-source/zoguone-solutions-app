import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Expense } from '../types';
import ExpenseModal from '../components/modals/ExpenseModal';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const ExpensesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'expense_date', direction: 'desc' });

  const canCreate = profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchExpenses = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase.from('expenses').select('*, organizations:organizations!left(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,expense_number.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (error) console.error('Error fetching expenses:', error.message);
    else setExpenses(data || []);
    
    setLoading(false);
  }, [user, profile, searchTerm, sortConfig]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, refreshKey]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (expense: Expense | null = null) => {
    setSelectedExpense(expense);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedExpense(null);
  };

  const handleSaveExpense = () => {
    fetchExpenses();
    handleCloseModal();
  };

  const handleDeleteExpense = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) alert('Error deleting expense: ' + error.message);
      else setExpenses(expenses.filter(e => e.id !== id));
    }
  };

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
  
  const MobileExpenseCard: React.FC<{ expense: Expense }> = ({ expense }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{expense.description}</p>
                <p className="text-sm font-mono text-gray-500">{expense.expense_number}</p>
            </div>
            <span className="font-bold text-lg">€{expense.amount.toFixed(2)}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatEuropeanDate(expense.expense_date)}
        </p>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('expenses')}</h1>
          {canCreate && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('addExpense')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <input 
            type="text"
            placeholder="Search by description or number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">Loading...</div> : (
          isFieldServiceEmployee ? (
             <div className="space-y-4">
                 {expenses.length > 0 ? expenses.map(expense => (
                    <MobileExpenseCard key={expense.id} expense={expense} />
                  )) : <p className="p-6 text-center text-gray-500">No expenses found.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                    <tr>
                        <SortableHeader sortKey="expense_date" label="Date" />
                        <SortableHeader sortKey="description" label="Description" />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label="Organization" />}
                        <SortableHeader sortKey="category" label="Category" />
                        <SortableHeader sortKey="amount" label="Amount" />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {expenses.map(expense => (
                        <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(expense.expense_date)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{expense.description}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{expense.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{expense.category || '-'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{expense.amount.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button onClick={() => handleOpenModal(expense)} className="text-primary-600 hover:text-primary-800"><PencilIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDeleteExpense(expense.id)} className="text-red-600 hover:text-red-800"><TrashIcon className="w-5 h-5"/></button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
          )
        )}
      </div>
      {isModalOpen && <ExpenseModal expense={selectedExpense} closeModal={handleCloseModal} onSave={handleSaveExpense} />}
    </>
  );
};

export default ExpensesPage;