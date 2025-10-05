import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Appointment, Customer, Profile, AppointmentStatus } from '../../types';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../ui/DatePicker';

interface AppointmentModalProps {
  appointment: Appointment | null;
  customers: Customer[];
  onClose: () => void;
  onSave: (appointment: Partial<Appointment>) => void;
  defaultDate?: Date | null;
  defaultAssigneeId?: string | null;
  defaultCustomerId?: number | null;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({ appointment, customers, onClose, onSave, defaultDate, defaultAssigneeId, defaultCustomerId }) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  
  const [formData, setFormData] = useState({
    title: '',
    customer_id: '',
    notes: '',
    status: 'open' as AppointmentStatus,
  });
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [assignedUserId, setAssignedUserId] = useState(defaultAssigneeId || user?.id || '');

  const canManageAssignee = profile?.role === 'admin' || profile?.role === 'key_user';

  useEffect(() => {
    if (canManageAssignee && profile?.org_id) {
        const fetchEmployees = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('org_id', profile.org_id);
            setEmployees(data || []);
        };
        fetchEmployees();
    }
  }, [canManageAssignee, profile?.org_id]);

  useEffect(() => {
    if (appointment) {
      setFormData({
        title: appointment.title,
        customer_id: appointment.customer_id.toString(),
        notes: appointment.notes || '',
        status: appointment.status,
      });
      setStartTime(new Date(appointment.start_time));
      setEndTime(new Date(appointment.end_time));
      setAssignedUserId(appointment.user_id);
    } else {
      const startDate = defaultDate ? new Date(defaultDate) : new Date();
      if (!defaultDate) {
        startDate.setHours(startDate.getHours() + 1, 0, 0, 0);
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later

      setFormData({ title: '', customer_id: defaultCustomerId?.toString() || '', notes: '', status: 'open' });
      setStartTime(startDate);
      setEndTime(endDate);
      setAssignedUserId(defaultAssigneeId || user?.id || '');
    }
  }, [appointment, defaultDate, defaultAssigneeId, user, defaultCustomerId]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStartTimeChange = (date: Date | null) => {
    setStartTime(date);
    if (date) {
      const newEndTime = new Date(date.getTime() + 60 * 60 * 1000);
      setEndTime(newEndTime);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim() || !formData.customer_id) {
        alert('Title and customer are required.');
        return;
    }
    
    if (!profile?.org_id && !appointment?.id) {
        alert("Cannot create appointment: Your profile is not associated with an organization.");
        return;
    }

    if (!startTime || !endTime) {
        alert('Please enter valid start and end times.');
        return;
    }
    
    let appointmentData: Partial<Appointment> = {
      id: appointment?.id,
      appointment_number: appointment?.appointment_number,
      user_id: assignedUserId,
      org_id: appointment?.org_id || profile?.org_id,
      title: formData.title,
      customer_id: parseInt(formData.customer_id),
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: formData.notes,
      status: formData.status,
    };
    
    onSave(appointmentData);
  };

  const modalTitle = appointment ? `${t('editAppointment')} (${appointment.appointment_number})` : t('addAppointment');
  
  return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 id="appointment-modal-title" className="text-xl font-bold mb-4">{modalTitle}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('title')}</label>
                    <input name="title" value={formData.title} onChange={handleChange} placeholder="e.g., Project meeting" required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('customers')}</label>
                        <select name="customer_id" value={formData.customer_id} onChange={handleChange} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                            <option value="">Select a customer</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('status')}</label>
                        <select name="status" value={formData.status} onChange={handleChange} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 capitalize">
                            {(['draft', 'open', 'in_progress', 'done'] as AppointmentStatus[]).map(s => <option key={s} value={s}>{t(s as any)}</option>)}
                        </select>
                    </div>
                </div>
                {canManageAssignee && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assign to</label>
                        <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                           {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.full_name || e.email} {e.id === user?.id && '(Me)'}</option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="mt-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('startTime')}</label>
                        <DatePicker selected={startTime} onChange={handleStartTimeChange} showTimeSelect />
                    </div>
                    <div className="mt-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('endTime')}</label>
                        <DatePicker selected={endTime} onChange={setEndTime} showTimeSelect />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('notes')}</label>
                    <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium dark:bg-gray-600">{t('cancel')}</button>
                    <button type="submit" className="px-4 py-2 text-white bg-primary-600 rounded text-sm font-medium hover:bg-primary-700">{t('save')}</button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default AppointmentModal;