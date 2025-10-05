import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Expense } from '../../types';

interface ExpenseSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (expenses: Expense[]) => void;
}

const ExpenseSelectionModal: React.FC<ExpenseSelectionModalProps> = ({ isOpen, onClose, onAdd }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false });

    if (error) {
      console.error('Error fetching expenses:', error);
    } else {
      setExpenses(data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      fetchExpenses();
    }
  }, [isOpen, fetchExpenses]);

  const handleToggleSelection = (id: number) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleAddSelected = () => {
    const selectedExpenses = expenses.filter(expense => selectedIds.has(expense.id));
    onAdd(selectedExpenses);
  };

  const filteredExpenses = expenses.filter(expense =>
    expense.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="expense-selection-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 flex flex-col h-[80vh] max-h-[600px]">
        <h2 id="expense-selection-modal-title" className="text-xl font-bold mb-4">{t('selectExpenses')}</h2>
        
        <input
          type="text"
          placeholder={t('searchExpenses')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded mb-4 dark:bg-gray-700 dark:border-gray-600"
        />

        <div className="flex-1 overflow-y-auto border-t border-b dark:border-gray-700">
          {loading ? (
            <p className="text-center p-4">Loading expenses...</p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {filteredExpenses.map(expense => (
                <li key={expense.id} className="p-3 flex items-center hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(expense.id)}
                    onChange={() => handleToggleSelection(expense.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="ml-3 text-sm">
                    <p className="font-medium text-gray-900 dark:text-gray-200">{expense.description}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      €{expense.amount.toFixed(2)} on {new Date(expense.expense_date).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleAddSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300"
          >
            {t('addSelected')} ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseSelectionModal;