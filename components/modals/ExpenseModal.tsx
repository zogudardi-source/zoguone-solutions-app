import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Expense } from '../../types';
import { generateNextNumber } from '../../lib/numberGenerator';
import DatePicker from '../ui/DatePicker';
import { format } from 'date-fns';
import { parseAsLocalDate } from '../../lib/formatting';

interface ExpenseModalProps {
  expense: Expense | null;
  closeModal: () => void;
  onSave: (newExpense: Partial<Expense>) => void;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ expense, closeModal, onSave }) => {
  const { user, profile } = useAuth();
  const [expenseDate, setExpenseDate] = useState<Date | null>(new Date());
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    category: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expense) {
      setExpenseDate(parseAsLocalDate(expense.expense_date));
      setFormData({
        description: expense.description,
        amount: expense.amount,
        category: expense.category || ''
      });
    } else {
        setExpenseDate(new Date());
    }
  }, [expense]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? null : parseFloat(value)) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.org_id) {
      alert("Cannot save expense: User or Organization information is missing.");
      return;
    }
    setLoading(true);

    if (!expenseDate) {
        alert('Please select a valid date.');
        setLoading(false);
        return;
    }

    try {
      let expenseData: Partial<Expense> = {
        ...formData,
        expense_date: format(expenseDate, 'yyyy-MM-dd'),
        amount: Number(formData.amount)
      };

      if (expense?.id) { // Editing
        expenseData.id = expense.id;
      } else { // Creating
        const newNumber = await generateNextNumber(profile.org_id, 'expense');
        expenseData = {
          ...expenseData,
          user_id: user.id,
          org_id: profile.org_id,
          expense_number: newNumber,
        };
      }
      
      const { data, error } = await supabase
        .from('expenses')
        .upsert(expenseData)
        .select()
        .single();

      if (error) throw error;
      if (data) onSave(data);

    } catch (error: any) {
      alert('Error saving expense: ' + error.message);
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 id="expense-modal-title" className="text-xl font-bold mb-4">{expense ? `Edit Expense (${expense.expense_number})` : 'Add New Expense'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mt-1">
            <label className="block text-sm font-medium">Date</label>
            <DatePicker selected={expenseDate} onChange={setExpenseDate} />
          </div>
          <div>
            <label className="block text-sm font-medium">Description</label>
            <input name="description" value={formData.description} onChange={handleChange} placeholder="e.g., Office Supplies" required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Amount (€)</label>
                <input name="amount" type="number" step="0.01" value={formData.amount} onChange={handleChange} placeholder="0.00" required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
              </div>
              <div>
                <label className="block text-sm font-medium">Category</label>
                <input name="category" value={formData.category} onChange={handleChange} placeholder="e.g., Travel" className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
              </div>
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;