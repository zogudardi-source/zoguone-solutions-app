import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Appointment, Customer, Profile, Task, Visit, AppointmentStatus, VisitStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import AppointmentModal from '../components/modals/AppointmentModal';
import TaskModal from '../components/modals/TaskModal';
import CreateItemModal from '../components/modals/CreateItemModal';
import { createNotification } from '../lib/notifications';
import {
  ChevronLeftIcon, ChevronRightIcon, BriefcaseIcon, CalendarDaysIcon, ClipboardDocumentListIcon, UserCircleIcon, UserGroupIcon, ChevronDownIcon
} from '@heroicons/react/24/outline';
import { generateNextNumber } from '../lib/numberGenerator';
import { format } from 'date-fns';
import { formatEuropeanTime } from '../lib/formatting';

type ScheduledItem = {
  id: string;
  type: 'visit' | 'task' | 'appointment';
  title: string;
  start: Date;
  end: Date;
  employeeId: string;
  employeeName: string;
  link: string;
  color: string;
  icon: React.ElementType;
  status?: string;
};

const DispatcherPage: React.FC = () => {
    const { user, profile } = useAuth();
    const { t, language } = useLanguage();
    const { refreshKey, triggerRefresh } = useRefresh();
    const { openTab } = useTabs();
    const navigate = useNavigate();

    // State for Dispatcher Calendar
    const [currentDate, setCurrentDate] = useState(new Date());
    const [employees, setEmployees] = useState<Profile[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [employeeFilter, setEmployeeFilter] = useState<'all' | 'me' | string>('all');
    const [typeFilters, setTypeFilters] = useState({
        visit: true,
        task: true,
        appointment: true,
    });

    // State for raw data to find items for editing
    const [rawVisits, setRawVisits] = useState<Visit[]>([]);
    const [rawTasks, setRawTasks] = useState<Task[]>([]);
    const [rawAppointments, setRawAppointments] = useState<Appointment[]>([]);

    // State for modals
    const [modalState, setModalState] = useState<{ type: 'create' | 'task' | 'appointment'; date: Date | null, assigneeId: string | null }>({ type: 'create', date: null, assigneeId: null });
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);


    // --- Dispatcher Calendar Logic ---
    const startOfWeek = (date: Date) => { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setHours(0,0,0,0); return new Date(d.setDate(diff)); };
    const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate);
        return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    }, [currentDate]);

    const fetchInitialData = useCallback(async () => {
        if (!profile) return;
        setCalendarLoading(true);

        let employeesQuery = supabase.from('profiles').select('*').in('role', ['field_service_employee', 'key_user', 'admin']);
        if (profile.role !== 'super_admin') employeesQuery = employeesQuery.eq('org_id', profile.org_id);
        const { data: empData } = await employeesQuery.order('full_name');
        setEmployees(empData || []);
        
        let customersQuery = supabase.from('customers').select('*');
        if (profile.role !== 'super_admin') customersQuery = customersQuery.eq('org_id', profile.org_id);
        const { data: custData } = await customersQuery;
        setCustomers(custData || []);

        setCalendarLoading(false);
    }, [profile]);
    
    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData, refreshKey]);

    const fetchScheduledItems = useCallback(async () => {
        if (employees.length === 0) { setScheduledItems([]); return; }

        const employeeIds = employees.map(e => e.id);
        const start = weekDays[0];
        const end = addDays(weekDays[6], 1);
        
        setCalendarLoading(true);

        const [ {data: visitsData}, {data: appointmentsData}, {data: tasksData} ] = await Promise.all([
            supabase.from('visits').select('*').in('assigned_employee_id', employeeIds).gte('visit_date', start.toISOString()).lt('visit_date', end.toISOString()),
            supabase.from('appointments').select('*').in('user_id', employeeIds).gte('start_time', start.toISOString()).lt('start_time', end.toISOString()),
            supabase.from('tasks').select('*').in('user_id', employeeIds).gte('due_date', start.toISOString()).lt('due_date', end.toISOString())
        ]);
        
        setRawVisits(visitsData || []);
        setRawAppointments(appointmentsData || []);
        setRawTasks(tasksData || []);

        const employeeIdsToFetch = new Set<string>();
        (visitsData || []).forEach(v => v.assigned_employee_id && employeeIdsToFetch.add(v.assigned_employee_id));
        (appointmentsData || []).forEach(a => a.user_id && employeeIdsToFetch.add(a.user_id));
        (tasksData || []).forEach(t => t.user_id && employeeIdsToFetch.add(t.user_id));

        const profilesMap = new Map<string, Pick<Profile, 'full_name' | 'email'>>();
        if (employeeIdsToFetch.size > 0) {
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', Array.from(employeeIdsToFetch));
            
            (profilesData || []).forEach(p => profilesMap.set(p.id, p));
        }
        
        const combined: ScheduledItem[] = [];
        const colorMap = {
            visit: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 border-l-4 border-purple-500',
            appointment: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200 border-l-4 border-teal-500',
            task: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-l-4 border-amber-500',
        };

        (visitsData || []).forEach(v => {
            const profile = v.assigned_employee_id ? profilesMap.get(v.assigned_employee_id) : undefined;
            if (v.assigned_employee_id && profile) {
                combined.push({ id: `v-${v.id}`, type: 'visit', title: v.purpose || v.category, start: new Date(v.visit_date), end: new Date(v.visit_date), employeeId: v.assigned_employee_id, employeeName: profile.full_name || profile.email, link: `/visits/edit/${v.id}`, color: colorMap.visit, icon: BriefcaseIcon, status: v.status });
            }
        });
        
        (appointmentsData || []).forEach(a => {
            const profile = profilesMap.get(a.user_id);
            if (profile) {
                combined.push({ id: `a-${a.id}`, type: 'appointment', title: a.title, start: new Date(a.start_time), end: new Date(a.end_time), employeeId: a.user_id, employeeName: profile.full_name || profile.email, link: `/appointments`, color: colorMap.appointment, icon: CalendarDaysIcon, status: a.status });
            }
        });

        (tasksData || []).forEach(t => {
            const profile = t.user_id ? profilesMap.get(t.user_id) : undefined;
            if (t.due_date && profile) {
                combined.push({ id: `t-${t.id}`, type: 'task', title: t.title, start: new Date(t.due_date), end: new Date(t.due_date), employeeId: t.user_id, employeeName: profile.full_name || profile.email, link: `/tasks`, color: colorMap.task, icon: ClipboardDocumentListIcon, status: t.is_complete ? 'done' : 'open' });
            }
        });
        
        // Sort all items chronologically by their start time before setting state
        combined.sort((a, b) => a.start.getTime() - b.start.getTime());

        setScheduledItems(combined);
        setCalendarLoading(false);
    }, [employees, weekDays]);
    
    useEffect(() => {
        if (employees.length > 0) {
            fetchScheduledItems();
        }
    }, [employees, fetchScheduledItems, refreshKey]);

    const filteredEmployees = useMemo(() => {
        if (employeeFilter === 'all') {
            return employees;
        }
        if (employeeFilter === 'me') {
            return employees.filter(e => e.id === profile?.id);
        }
        return employees.filter(e => e.id === employeeFilter);
    }, [employees, employeeFilter, profile?.id]);

    const handleToggleTypeFilter = (type: keyof typeof typeFilters) => {
        setTypeFilters(prev => ({ ...prev, [type]: !prev[type] }));
    };

    const filteredScheduledItems = useMemo(() => {
        return scheduledItems.filter(item => typeFilters[item.type]);
    }, [scheduledItems, typeFilters]);

    const handleOpenCreateModal = (date: Date, employeeId: string | null = null) => {
        const safeDate = new Date(date);
        // Set the time to noon local time. This prevents the date from shifting to the previous day
        // when converted to UTC, which can happen for dates at midnight in some timezones.
        safeDate.setHours(12, 0, 0, 0);
        setModalState({ type: 'create', date: safeDate, assigneeId: employeeId });
    };
    
    const handleCloseModals = () => {
        setModalState({ type: 'create', date: null, assigneeId: null });
        setEditingTask(null);
        setEditingAppointment(null);
    };
    
    const handleCreateSelection = (type: 'visit' | 'task' | 'appointment') => {
        const defaultAssigneeId = modalState.assigneeId;
        if (type === 'visit') {
            const visitDate = modalState.date ? modalState.date.toISOString() : new Date().toISOString();
            navigate('/visits/new', { state: { defaultDate: visitDate, defaultAssigneeId } });
            handleCloseModals();
        } else {
            setModalState(prev => ({ ...prev, type }));
        }
    };
    
    const handleSaveDispatcherTask = async (taskData: Partial<Task>) => {
        if (!user || !profile?.org_id) return;
        const dataToUpsert = { ...taskData, org_id: profile.org_id };
        
        const { data: savedTask, error } = await supabase.from('tasks').upsert(dataToUpsert).select().single();

        if (error) {
            alert('Error saving task: ' + error.message);
        } else if (savedTask) {
            if (savedTask.user_id && savedTask.user_id !== user.id) {
                await createNotification({ user_id: savedTask.user_id, org_id: profile.org_id, title: 'New Task Assigned', body: `Task "${savedTask.title}" was assigned to you by ${profile.full_name}.`, type: 'new_task', related_entity_path: '/tasks', related_entity_id: savedTask.id });
            }
            handleCloseModals();
            triggerRefresh();
        }
    };
    
    const handleSaveDispatcherAppointment = async (appointmentData: Partial<Appointment>) => {
        if (!user || !profile?.org_id) return;
        
        let dataToUpsert: Partial<Appointment> = { ...appointmentData, org_id: profile.org_id };
        if (!dataToUpsert.id) { 
            dataToUpsert.appointment_number = await generateNextNumber(profile.org_id, 'appointment');
            dataToUpsert.status = 'open';
        }

        const { data: savedAppt, error } = await supabase.from('appointments').upsert(dataToUpsert).select().single();
        
        if (error) {
            alert('Error saving appointment: ' + error.message);
        } else if (savedAppt) {
            if (savedAppt.user_id && savedAppt.user_id !== user.id) {
                await createNotification({ user_id: savedAppt.user_id, org_id: profile.org_id, title: 'New Appointment Assigned', body: `Appointment "${savedAppt.title}" was assigned to you by ${profile.full_name}.`, type: 'new_appointment', related_entity_path: '/appointments', related_entity_id: savedAppt.id.toString() });
            }
            handleCloseModals();
            triggerRefresh();
        }
    };

    const handleItemClick = (item: ScheduledItem) => {
        if (item.type === 'visit') {
            openTab({ path: item.link, label: item.title });
        } else if (item.type === 'task') {
            const fullTask = rawTasks.find(t => `t-${t.id}` === item.id);
            if (fullTask) setEditingTask(fullTask);
        } else if (item.type === 'appointment') {
            const fullAppt = rawAppointments.find(a => `a-${a.id}` === item.id);
            if (fullAppt) setEditingAppointment(fullAppt);
        }
    };

    const handlePrevWeek = () => setCurrentDate(prev => addDays(prev, -7));
    const handleNextWeek = () => setCurrentDate(prev => addDays(prev, 7));
    
    const statusColors: { [key: string]: { [key: string]: string } } = {
        visit: { planned: 'blue', completed: 'green', cancelled: 'red' },
        appointment: { draft: 'yellow', open: 'blue', in_progress: 'purple', done: 'green' },
        task: { open: 'amber', done: 'green' },
    };
    const colorClasses: { [key: string]: string } = {
        blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
        green: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
        red: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
        yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
        purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200',
        amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
    };

    const EventItem: React.FC<{ item: ScheduledItem }> = ({ item }) => {
        const colorName = item.status ? statusColors[item.type][item.status] : null;
        const badgeClassName = colorName ? colorClasses[colorName] : '';
    
        return (
            <div
                title={`${item.title} - ${item.employeeName}`}
                onClick={(e) => {
                    e.stopPropagation();
                    handleItemClick(item);
                }}
                className={`p-2 rounded-md cursor-pointer text-xs ${item.color} ${item.status === 'done' ? 'opacity-60' : ''}`}
            >
                <div className="flex justify-between items-start gap-1">
                    <p className={`font-bold truncate flex items-center ${item.status === 'done' ? 'line-through' : ''}`}>
                        <item.icon className="w-4 h-4 mr-1.5 inline-block shrink-0"/>{item.title}
                    </p>
                    {item.status && badgeClassName && (
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${badgeClassName} capitalize shrink-0`}>
                            {t(item.status as any)}
                        </span>
                    )}
                </div>
                {(item.type === 'appointment' || item.type === 'visit') && (
                    <p className="text-xs font-medium opacity-90 whitespace-nowrap mt-1">{formatEuropeanTime(item.start)}</p>
                )}
            </div>
        );
    };

    const MobileAgendaItem: React.FC<{ item: ScheduledItem, day: Date }> = ({ item }) => {
        const colorName = item.status ? statusColors[item.type][item.status] : null;
        const badgeClassName = colorName ? colorClasses[colorName] : '';
    
        return (
          <div className={`flex items-start space-x-3 ${item.status === 'done' ? 'opacity-60' : ''}`} onClick={() => handleItemClick(item)}>
            <div className="text-center shrink-0 w-16">
              <p className="font-bold text-primary-600 dark:text-primary-400">{formatEuropeanTime(item.start)}</p>
            </div>
            <div className={`flex-1 p-3 rounded-lg ${item.color}`}>
              <div className="flex justify-between items-start gap-1">
                <p className={`font-bold ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</p>
                {item.status && badgeClassName && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${badgeClassName} capitalize shrink-0`}>
                        {t(item.status as any)}
                    </span>
                )}
              </div>
              <p className="text-sm truncate opacity-80 flex items-center"><UserCircleIcon className="w-4 h-4 mr-1 inline-block shrink-0"/>{item.employeeName}</p>
            </div>
          </div>
        );
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md flex flex-col h-full min-h-[500px] lg:h-[calc(100vh-12rem)]">
                <div className="p-4 border-b dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4">
                    <div className="flex items-center space-x-2">
                        <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-medium border rounded-md dark:border-gray-600">{t('today')}</button>
                        <button onClick={handlePrevWeek} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
                        <button onClick={handleNextWeek} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
                    </div>
                    <h2 className="text-lg font-bold flex-1">{format(currentDate, 'MMMM yyyy')}</h2>
                    <div className="relative w-full sm:w-auto">
                        <UserGroupIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                        <select
                            value={employeeFilter}
                            onChange={e => setEmployeeFilter(e.target.value)}
                            className="w-full sm:w-48 pl-10 p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600 appearance-none"
                        >
                            <option value="all">{t('allEmployees')}</option>
                            <option value="me">{t('mySchedule')}</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                    </div>
                    <div className="flex items-center space-x-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
                        {(Object.keys(typeFilters) as Array<keyof typeof typeFilters>).map(type => (
                            <button key={type} onClick={() => handleToggleTypeFilter(type)} className={`p-2 rounded-md capitalize transition-colors ${typeFilters[type] ? 'bg-white dark:bg-slate-900 shadow' : 'opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                               {type === 'visit' ? <BriefcaseIcon className="w-5 h-5"/> : type === 'task' ? <ClipboardDocumentListIcon className="w-5 h-5"/> : <CalendarDaysIcon className="w-5 h-5"/>}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="hidden md:flex flex-1 flex-col overflow-auto">
                    <div className="grid grid-cols-[200px_repeat(7,1fr)] sticky top-0 z-10 bg-white dark:bg-slate-800">
                        <div className="p-2 border-b border-r dark:border-slate-700 font-semibold text-sm">{t('team')}</div>
                        {weekDays.map(day => {
                            const isToday = new Date().toDateString() === day.toDateString();
                            return <div key={day.toISOString()} className={`p-2 border-b dark:border-slate-700 text-center ${isToday ? 'bg-blue-50 dark:bg-slate-700/50' : ''}`}>
                                <p className="font-semibold text-xs">{format(day, 'eee')}</p>
                                <p className={`font-bold text-lg ${isToday ? 'text-primary-600' : ''}`}>{day.getDate()}</p>
                            </div>
                        })}
                    </div>

                    <div className="grid grid-cols-[200px_repeat(7,1fr)] flex-1">
                        {filteredEmployees.map(emp => (
                            <React.Fragment key={emp.id}>
                                <div className="p-3 border-r dark:border-slate-700 border-b flex flex-col justify-center sticky left-0 bg-white dark:bg-slate-800 z-10">
                                    <p className="font-bold truncate">{emp.full_name || emp.email}</p>
                                    <p className="text-xs text-gray-500 truncate">{emp.email}</p>
                                </div>
                                {weekDays.map(day => {
                                    const itemsForCell = filteredScheduledItems.filter(item => item.employeeId === emp.id && new Date(item.start).toDateString() === day.toDateString());
                                    return <div key={day.toISOString()} onClick={() => handleOpenCreateModal(day, emp.id)} className="border-r border-b dark:border-slate-700 p-1 space-y-1 min-h-[100px] cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        {itemsForCell.map(item => <EventItem key={item.id} item={item}/>)}
                                    </div>
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                
                <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-6">
                    {weekDays.map(day => {
                        const itemsForDay = filteredScheduledItems.filter(item => new Date(item.start).toDateString() === day.toDateString()).sort((a,b) => a.start.getTime() - b.start.getTime());
                        if (itemsForDay.length === 0) return null;
                        const isToday = new Date().toDateString() === day.toDateString();
                        return <div key={day.toISOString()}>
                            <h3 className={`font-bold mb-2 pb-2 border-b-2 ${isToday ? 'border-primary-500' : 'dark:border-slate-700'}`}>{format(day, 'EEEE, dd. MMMM')}</h3>
                            <div className="space-y-4">
                                {itemsForDay.map(item => <MobileAgendaItem key={item.id} item={item} day={day}/>)}
                            </div>
                        </div>
                    })}
                </div>
            </div>
            
            <CreateItemModal isOpen={modalState.type === 'create' && modalState.date !== null} onClose={handleCloseModals} onSelect={handleCreateSelection} t={t} />
            {modalState.type === 'task' && modalState.date && <TaskModal task={null} onClose={handleCloseModals} onSave={handleSaveDispatcherTask} assignableEmployees={employees} defaultAssigneeId={modalState.assigneeId} defaultDate={modalState.date}/>}
            {editingTask && <TaskModal task={editingTask} onClose={handleCloseModals} onSave={handleSaveDispatcherTask} assignableEmployees={employees} />}

            {modalState.type === 'appointment' && modalState.date && <AppointmentModal appointment={null} customers={customers} onClose={handleCloseModals} onSave={handleSaveDispatcherAppointment} defaultDate={modalState.date} defaultAssigneeId={modalState.assigneeId} />}
            {editingAppointment && <AppointmentModal appointment={editingAppointment} customers={customers} onClose={handleCloseModals} onSave={handleSaveDispatcherAppointment} />}
        </div>
    );
}

export default DispatcherPage;