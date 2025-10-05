import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Task, Customer, Profile } from '../../types';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../ui/DatePicker';
import { format } from 'date-fns';
import { parseAsLocalDate } from '../../lib/formatting';

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  assignableEmployees?: Profile[];
  defaultAssigneeId?: string | null;
  defaultDate?: Date | null;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, assignableEmployees, defaultAssigneeId, defaultDate }) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [assignedUserId, setAssignedUserId] = useState(defaultAssigneeId || user?.id || '');

  const canAssign = assignableEmployees && assignableEmployees.length > 0;

  useEffect(() => {
    const fetchCustomers = async () => {
      if (!user || !profile?.org_id) return;
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name');
      if (data) setCustomers(data);
    };
    fetchCustomers();
  }, [user, profile]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setCustomerId(task.customer_id?.toString() || '');
      setDueDate(parseAsLocalDate(task.due_date));
      setAssignedUserId(task.user_id);
    } else {
      setTitle('');
      setCustomerId('');
      setDueDate(defaultDate || null);
      setAssignedUserId(defaultAssigneeId || user?.id || '');
    }
  }, [task, defaultDate, defaultAssigneeId, user]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
        alert('Title cannot be empty.');
        return;
    }
    
    onSave({
      id: task?.id,
      title: title,
      due_date: dueDate ? dueDate.toISOString() : null,
      is_complete: task?.is_complete || false,
      customer_id: customerId ? parseInt(customerId) : null,
      user_id: assignedUserId,
    });
  };
  
  return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 id="task-modal-title" className="text-xl font-bold mb-4">{task ? t('editTask') : t('addTask')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('title')}</label>
                    <input 
                        name="title" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        placeholder="e.g., Follow up with customer" 
                        required 
                        className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>
                {canAssign && (
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('assignTo')}</label>
                        <select
                            value={assignedUserId}
                            onChange={(e) => setAssignedUserId(e.target.value)}
                            className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                        >
                           {assignableEmployees.map(e => (
                                <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
                            ))}
                        </select>
                    </div>
                )}
                 <div className="mt-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('dueDate')} (Optional)</label>
                    <DatePicker selected={dueDate} onChange={setDueDate} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer (Optional)</label>
                    <select
                        name="customer_id"
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                        <option value="">No Customer</option>
                        {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium dark:bg-gray-600">{t('cancel')}</button>
                    <button type="submit" className="px-4 py-2 text-white bg-primary-600 rounded text-sm font-medium hover:bg-primary-700">{t('save')}</button>
                </div>
            </form>
        </div>
    </div>
  )
}

export default TaskModal;