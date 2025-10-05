import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Appointment, Customer } from '../../types';
import AppointmentModal from '../modals/AppointmentModal';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

const DashboardCalendar: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<Date | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  };
  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const visibleDateRange = useMemo(() => {
    let start = startOfWeek(currentDate);
    let end = addDays(start, 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [currentDate]);

  const fetchAppointments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, customers(name)')
      .eq('user_id', user.id)
      .gte('start_time', visibleDateRange.start.toISOString())
      .lte('start_time', visibleDateRange.end.toISOString())
      .order('start_time', { ascending: true });
    if (error) console.error('Error fetching appointments:', error);
    else setAppointments(data || []);
    setLoading(false);
  }, [user, visibleDateRange]);

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('customers').select('*').eq('user_id', user.id);
    if (error) console.error("Error fetching customers", error);
    else setCustomers(data || []);
  }, [user]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleOpenModal = (appointment: Appointment | null = null, defaultDate: Date | null = null) => {
    setSelectedAppointment(appointment);
    setModalDefaultDate(defaultDate);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAppointment(null);
    setModalDefaultDate(null);
  };

  const handleSaveAppointment = async () => {
    await fetchAppointments();
    handleCloseModal();
  };

  const handlePrevWeek = () => setCurrentDate(prev => addDays(prev, -7));
  const handleNextWeek = () => setCurrentDate(prev => addDays(prev, 7));
  const handleToday = () => setCurrentDate(new Date());

  const handleCopyAppointment = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent onClick from firing
    const apptToCopy = appointments.find(a => a.id === id);
    if (!apptToCopy) return;
  
    if (window.confirm(`Are you sure you want to duplicate "${apptToCopy.title}"?`)) {
      // Manually construct the new object to ensure only valid fields are inserted.
      const newAppointment = {
        user_id: apptToCopy.user_id,
        customer_id: apptToCopy.customer_id,
        title: `COPY OF ${apptToCopy.title}`,
        start_time: apptToCopy.start_time,
        end_time: apptToCopy.end_time,
        notes: apptToCopy.notes,
      };
  
      const { error } = await supabase.from('appointments').insert(newAppointment);
  
      if (error) {
        alert('Error duplicating appointment: ' + error.message);
      } else {
        fetchAppointments(); // Refresh the list
      }
    }
  };

  const weekDays = useMemo(() => {
    const days = [];
    let day = startOfWeek(currentDate);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(day));
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  const isToday = (d: Date) => new Date().toDateString() === d.toDateString();

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-md dark:bg-gray-800">
        <div className="flex items-center justify-between pb-4 border-b dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <button onClick={handleToday} className="px-4 py-2 text-sm font-medium border rounded-md dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">{t('today')}</button>
            <div className="flex items-center space-x-1">
              <button onClick={handlePrevWeek} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
              <button onClick={handleNextWeek} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              {currentDate.toLocaleString(t('dashboard') === 'Dashboard' ? 'en-US' : 'de-DE', { month: 'long', year: 'numeric' })}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-7">
          {weekDays.map((d) => {
            const appointmentsForDay = appointments.filter(a => new Date(a.start_time).toDateString() === d.toDateString());
            return (
              <div key={d.toISOString()} className="p-2 border-l dark:border-gray-700 min-h-[200px] flex flex-col">
                <div className="text-center mb-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{d.toLocaleDateString(t('dashboard') === 'Dashboard' ? 'en-US' : 'de-DE', { weekday: 'short' })}</p>
                  <span className={`text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto ${isToday(d) ? 'bg-primary-600 text-white' : ''}`}>{d.getDate()}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                   {loading ? (
                     <div className="text-center text-xs text-gray-400 mt-4">...</div>
                   ) : appointmentsForDay.length > 0 ? (
                     appointmentsForDay.map(appt => (
                        <div key={appt.id} className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg group relative">
                             <div onClick={() => handleOpenModal(appt)} className="cursor-pointer">
                                <p className="font-semibold text-sm text-blue-800 dark:text-blue-200 truncate">{appt.title}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(appt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-300 truncate">{appt.customers?.name}</p>
                            </div>
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => handleCopyAppointment(appt.id, e)} className="p-1 rounded-full bg-white/50 hover:bg-white/80 dark:bg-gray-800/50 dark:hover:bg-gray-800/80" title="Duplicate Appointment">
                                    <DocumentDuplicateIcon className="w-4 h-4 text-gray-600 dark:text-gray-300"/>
                                </button>
                            </div>
                        </div>
                    ))
                   ) : (
                    <div className="text-center text-xs text-gray-400 pt-2">{t('noAppointmentsFound')}</div>
                   )}
                   <div className="pt-2">
                     <button onClick={() => handleOpenModal(null, d)} className="w-full text-center text-xs text-gray-400 hover:text-primary-600 p-1 rounded-md border border-dashed hover:border-primary-600">
                         + Add
                     </button>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isModalOpen && (
        <AppointmentModal 
            appointment={selectedAppointment} 
            customers={customers}
            onClose={handleCloseModal} 
            onSave={handleSaveAppointment}
            defaultDate={modalDefaultDate}
        />
      )}
    </>
  );
};

export default DashboardCalendar;