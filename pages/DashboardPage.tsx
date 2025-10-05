import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { useModal } from '../contexts/ModalContext';
import { Appointment, Customer, Invoice, InvoiceStatus, Task, Visit, VisitStatus, Quote, QuoteStatus, Product, Expense, Profile, AppointmentStatus } from '../types';
import { DocumentTextIcon, BanknotesIcon, PlusIcon, EnvelopeIcon, ArrowDownTrayIcon, PencilIcon, DocumentPlusIcon, DocumentDuplicateIcon, CalendarIcon, ClipboardDocumentListIcon, BriefcaseIcon, MapPinIcon, UserIcon, ArchiveBoxIcon, CurrencyDollarIcon, UserPlusIcon, CalendarDaysIcon, ExclamationTriangleIcon, ClockIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import generateDocumentPDF from '../lib/pdfGenerator';
import UpgradeBanner from '../components/ui/UpgradeBanner';
import { CubeIcon } from '@heroicons/react/24/solid';
import { formatEuropeanDate, formatEuropeanTime, parseAsLocalDate } from '../lib/formatting';
import { format } from 'date-fns';


type AgendaView = 'today' | 'week';
type AgendaFilter = 'visits' | 'appointments' | 'tasks' | 'quotes';

// Modern, custom tooltip for the sales chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600">
        <p className="font-bold text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.slice().reverse().map((pld: any) => (
          pld.value > 0 && (
            <div key={pld.dataKey} className="flex items-center justify-between space-x-4">
              <div className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: pld.fill }}></span>
                <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">{pld.name}:</span>
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">€{pld.value.toFixed(2)}</span>
            </div>
          )
        ))}
      </div>
    );
  }
  return null;
};

const yAxisTickFormatter = (value: number) => {
  if (value >= 1000) {
    return `€${(value / 1000).toFixed(1)}k`;
  }
  return `€${value}`;
};


const DashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { refreshKey, triggerRefresh } = useRefresh();
  const { openTab } = useTabs();
  const navigate = useNavigate();
  const { openProductModal, openTaskModal, openExpenseModal, openAppointmentModal, openCustomerModal } = useModal();
  
  // General Dashboard State
  const [stats, setStats] = useState({ totalRevenue: 0, unpaidInvoices: 0, pendingQuotes: 0 });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [quoteCount, setQuoteCount] = useState(0);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  
  // State for Field Service Dashboard
  const [visits, setVisits] = useState<Visit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [agendaView, setAgendaView] = useState<AgendaView>('today');
  const [activeFilters, setActiveFilters] = useState<Record<AgendaFilter, boolean>>({
    visits: true,
    appointments: true,
    tasks: true,
    quotes: false,
  });
  
  // State for New Dashboard Widgets
  const [actionableItems, setActionableItems] = useState({ overdueInvoices: 0, expiringQuotes: 0, unassignedVisits: 0 });
  const [dispatchSummary, setDispatchSummary] = useState<{ unassignedToday: number; employeeLoad: { id: string; name: string; activityCount: number }[] }>({ unassignedToday: 0, employeeLoad: [] });


  // --- Data Fetching ---
  const fetchDashboardData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    const applyOrgFilter = (query: any) => {
      if (profile?.role !== 'super_admin' && profile?.org_id) {
        return query.eq('org_id', profile.org_id);
      }
      return query;
    };
    
    // Field Service Employee has a completely different dashboard view
    if (profile.role === 'field_service_employee') {
        const startOfWeek = (date: Date) => { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)); };
        const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
        let startDate: Date;
        let endDate: Date;

        if (agendaView === 'week') {
            startDate = startOfWeek(new Date());
            startDate.setHours(0, 0, 0, 0);
            endDate = addDays(startDate, 6);
            endDate.setHours(23, 59, 59, 999);
        } else { // 'today'
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
        }

        const { data: weekVisits } = await applyOrgFilter(supabase.from('visits').select('*, customers(name, address)').eq('assigned_employee_id', profile.id).gte('visit_date', startDate.toISOString()).lte('visit_date', endDate.toISOString()));
        setVisits(weekVisits as any || []);

        const { data: weekAppointments } = await applyOrgFilter(supabase.from('appointments').select('*, customers(name, address)').eq('user_id', profile.id).gte('start_time', startDate.toISOString()).lte('start_time', endDate.toISOString()));
        setAppointments(weekAppointments as any || []);

        const { data: weekTasks } = await applyOrgFilter(supabase.from('tasks').select('*, customers(name, address)').eq('user_id', profile.id).gte('due_date', startDate.toISOString()).lte('due_date', endDate.toISOString()).order('due_date', { ascending: true }));
        setTasks(weekTasks as any || []);

        const { data: weekQuotes } = await applyOrgFilter(supabase.from('quotes').select('*, customers(name)').eq('user_id', profile.id).gte('issue_date', startDate.toISOString()).lte('issue_date', endDate.toISOString()));
        setQuotes(weekQuotes as any || []);

        setLoading(false);
        return;
    }

    // --- Data Fetching for Admin / Key User Dashboard ---
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const aWeekFromNow = new Date(today);
    aWeekFromNow.setDate(today.getDate() + 7);
    const aWeekFromNowStr = aWeekFromNow.toISOString().split('T')[0];
    const currentYear = today.getFullYear();

    const [
      { data: invoicesData }, // For sales chart & stats
      { count: overdueInvoicesCount }, // Action Center
      { count: expiringQuotesCount }, // Action Center
      { count: unassignedVisitsCount }, // Action Center
      { count: unassignedTodayCount }, // Dispatch Hub
      { data: employees }, // Dispatch Hub
      { data: visitsToday }, // Dispatch Hub
      { data: tasksToday }, // Dispatch Hub
      { data: appointmentsToday }, // Dispatch Hub
      { data: recentInvoicesData }, // Recent Invoices Table
      { data: pendingQuotesData }, // For Stat Card
    ] = await Promise.all([
      applyOrgFilter(supabase.from('invoices').select('total_amount, issue_date, status').gte('issue_date', `${currentYear}-01-01`).lte('issue_date', `${currentYear}-12-31`)),
      applyOrgFilter(supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'overdue')),
      applyOrgFilter(supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('valid_until_date', todayStr).lte('valid_until_date', aWeekFromNowStr)),
      applyOrgFilter(supabase.from('visits').select('id', { count: 'exact', head: true }).is('assigned_employee_id', null).eq('status', 'planned')),
      applyOrgFilter(supabase.from('visits').select('id', { count: 'exact', head: true }).is('assigned_employee_id', null).eq('status', 'planned').gte('visit_date', `${todayStr}T00:00:00`).lte('visit_date', `${todayStr}T23:59:59`)),
      applyOrgFilter(supabase.from('profiles').select('id, full_name, email').in('role', ['field_service_employee', 'key_user', 'admin'])),
      applyOrgFilter(supabase.from('visits').select('id, assigned_employee_id').eq('status', 'planned').gte('visit_date', `${todayStr}T00:00:00`).lte('visit_date', `${todayStr}T23:59:59`)),
      applyOrgFilter(supabase.from('tasks').select('id, user_id').eq('is_complete', false).gte('due_date', `${todayStr}T00:00:00`).lte('due_date', `${todayStr}T23:59:59`)),
      applyOrgFilter(supabase.from('appointments').select('id, user_id, status').gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)),
      applyOrgFilter(supabase.from('invoices').select('*, customers:customers!left(name, email), organizations:organizations!left(name)').order('issue_date', { ascending: false }).limit(5)),
      applyOrgFilter(supabase.from('quotes').select('id').eq('status', 'sent')),
    ]);

    // Process stats and sales chart data
    if (invoicesData) {
      const totalRevenue = invoicesData.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + inv.total_amount, 0);
      const unpaidInvoices = invoicesData.filter(inv => ['sent', 'overdue'].includes(inv.status)).length;
      setStats({ totalRevenue, unpaidInvoices, pendingQuotes: pendingQuotesData?.length || 0 });

      const monthlySales = Array(12).fill(0).map((_, i) => ({ name: new Date(0, i).toLocaleString(language, { month: 'short' }), paid: 0, sent: 0, overdue: 0, draft: 0 }));
      invoicesData.forEach(inv => {
          const issueDate = parseAsLocalDate(inv.issue_date);
          if (issueDate) {
              const month = issueDate.getMonth();
              if (['paid', 'sent', 'overdue', 'draft'].includes(inv.status)) {
                  monthlySales[month][inv.status as InvoiceStatus] += inv.total_amount;
              }
          }
      });
      setSalesData(monthlySales);
    }
    
    // Process Action Center data
    setActionableItems({ overdueInvoices: overdueInvoicesCount || 0, expiringQuotes: expiringQuotesCount || 0, unassignedVisits: unassignedVisitsCount || 0 });

    // Process Dispatch Hub data
    const employeeLoad = (employees || []).map(emp => {
      const visitCount = (visitsToday || []).filter(v => v.assigned_employee_id === emp.id).length;
      const taskCount = (tasksToday || []).filter(t => t.user_id === emp.id).length;
      const apptCount = (appointmentsToday || []).filter(a => a.user_id === emp.id && a.status !== 'done').length;
      return { id: emp.id, name: emp.full_name || emp.email, activityCount: visitCount + taskCount + apptCount };
    }).sort((a, b) => b.activityCount - a.activityCount);

    setDispatchSummary({ unassignedToday: unassignedTodayCount || 0, employeeLoad });
    
    // Set other data
    setRecentInvoices(recentInvoicesData || []);
    
    // Free plan logic
    if (profile?.current_plan === 'free') {
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('issue_date', firstDayOfMonth);
      if (invCount !== null) setInvoiceCount(invCount);
      const { count: qCount } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('issue_date', firstDayOfMonth);
      if (qCount !== null) setQuoteCount(qCount);
    }

    setLoading(false);
  }, [user, profile, language, agendaView]);


  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData, refreshKey]);

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
  
  // --- Quick Create Logic ---
  const handleNewInvoiceClick = () => {
    if (profile?.current_plan === 'free' && invoiceCount >= 3) {
      setBannerMessage("You've reached your monthly limit of 3 invoices on the Starter plan.");
      setShowUpgradeBanner(true);
    } else {
      openTab({ path: '/invoices/new', label: t('newInvoice') });
    }
  };

  const handleNewQuoteClick = () => {
    if (profile?.current_plan === 'free' && quoteCount >= 3) {
      setBannerMessage("You've reached your monthly limit of 3 quotes on the Starter plan.");
      setShowUpgradeBanner(true);
    } else {
      openTab({ path: '/quotes/new', label: t('newQuote') });
    }
  };
    
  // --- Reusable & New Components ---
  const StatCard: React.FC<{ icon: React.ElementType, title: string, value: string | number, color: string, onClick?: () => void }> = ({ icon: Icon, title, value, color, onClick }) => (
    <div onClick={onClick} className={`p-6 bg-white rounded-xl shadow-md dark:bg-slate-800 flex items-center space-x-4 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow duration-200' : ''}`}>
      <div className={`p-3 rounded-full ${color}`}><Icon className="w-6 h-6 text-white"/></div>
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
  
  const ActionCenter = () => {
      const items = [
        { count: actionableItems.overdueInvoices, text: 'Overdue Invoices', icon: ExclamationTriangleIcon, path: '/invoices', color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-500/10' },
        { count: actionableItems.expiringQuotes, text: 'Quotes Expiring Soon', icon: ClockIcon, path: '/quotes', color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-500/10' },
        { count: actionableItems.unassignedVisits, text: 'Unassigned Visits', icon: BriefcaseIcon, path: '/dispatcher', color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-500/10' },
      ];
      
      const visibleItems = items.filter(item => item.count > 0);
      if(visibleItems.length === 0) return null;

      return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
          <h2 className="text-lg font-semibold mb-4">Action Center</h2>
          <div className="space-y-3">
            {visibleItems.map(item => (
                <button key={item.text} onClick={() => openTab({ path: item.path, label: item.text })} className={`w-full flex items-center p-3 rounded-lg text-left transition-colors ${item.bgColor} hover:opacity-80`}>
                    <item.icon className={`w-6 h-6 mr-4 ${item.color}`}/>
                    <div className="flex-1">
                        <span className="font-bold text-gray-900 dark:text-white">{item.count}</span>
                        <span className="ml-2 text-gray-700 dark:text-gray-300">{item.text}</span>
                    </div>
                    <ArrowRightIcon className="w-5 h-5 text-gray-400"/>
                </button>
            ))}
          </div>
        </div>
      );
  };

  const DispatchHub = () => (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Dispatch Hub</h2>
            <button onClick={() => openTab({ path: '/dispatcher', label: t('dispatcher')})} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">Go to Dispatcher</button>
        </div>
        
        {dispatchSummary.unassignedToday > 0 && (
          <div className="p-3 mb-4 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
            <p className="font-semibold text-amber-700 dark:text-amber-300">{dispatchSummary.unassignedToday} unassigned activit{dispatchSummary.unassignedToday > 1 ? 'ies' : 'y'} for today.</p>
          </div>
        )}
        
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Team Load Today</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto">
            {dispatchSummary.employeeLoad.length > 0 ? dispatchSummary.employeeLoad.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700/50 rounded-md">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{emp.name}</p>
                    <span className="px-2 py-0.5 text-xs font-semibold text-primary-800 bg-primary-100 dark:text-primary-200 dark:bg-primary-500/20 rounded-full">{emp.activityCount} activit{emp.activityCount !== 1 ? 'ies' : 'y'}</span>
                </div>
            )) : <p className="text-sm text-center text-gray-500 py-4">No employees with activities today.</p>}
        </div>
      </div>
  );

  // --- Field Service Dashboard ---
  const renderFieldServiceDashboard = () => {
    const appointmentStatusColors: { [key in AppointmentStatus]: string } = {
        draft: 'yellow', open: 'blue', in_progress: 'purple', done: 'green',
    };
    const toggleFilter = (filter: AgendaFilter) => {
      setActiveFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
    };

    const agendaItems = useMemo(() => {
        const visitStatusColors: { [key in VisitStatus]: string } = { planned: 'blue', completed: 'green', cancelled: 'red' };
        const quoteStatusColors: { [key in QuoteStatus]: string } = { draft: 'yellow', sent: 'blue', accepted: 'green', declined: 'red' };

        const combined = [
            ...(activeFilters.visits ? visits.map(v => ({ id: `visit-${v.id}`, type: 'visit' as const, date: new Date(v.visit_date), title: v.purpose || v.category, customerDetails: `Customer: ${v.customers?.name || 'N/A'}`, locationDetails: v.location || v.customers?.address, link: `/visits/edit/${v.id}`, label: v.visit_number, icon: BriefcaseIcon, status: v.status, statusColor: visitStatusColors[v.status] })) : []),
            ...(activeFilters.appointments ? appointments.map(a => ({ id: `appt-${a.id}`, type: 'appointment' as const, date: new Date(a.start_time), title: a.title, customerDetails: `Customer: ${a.customers?.name || 'N/A'}`, locationDetails: a.customers?.address, link: `/appointments`, label: t('appointments'), state: { openModalForId: a.id.toString() }, icon: CalendarIcon, status: a.status, statusColor: appointmentStatusColors[a.status] })) : []),
            // Fix: Renamed map variable from 't' to 'task' to avoid shadowing the translation function `t`.
            ...(activeFilters.tasks ? tasks.filter(task => task.due_date).map(task => ({ id: `task-${task.id}`, type: 'task' as const, date: new Date(task.due_date!), title: task.title, customerDetails: `Task for ${task.customers?.name || 'internal task'}`, locationDetails: task.customers?.address, link: `/tasks`, label: t('tasks'), state: { openModalForId: task.id }, icon: ClipboardDocumentListIcon, status: task.is_complete ? 'completed' : 'pending', statusColor: task.is_complete ? 'green' : 'yellow' })) : []),
            ...(activeFilters.quotes ? quotes.map(q => ({ id: `quote-${q.id}`, type: 'quote' as const, date: new Date(q.issue_date), title: `Quote #${q.quote_number}`, customerDetails: `For: ${q.customers?.name}`, locationDetails: `Total: €${q.total_amount.toFixed(2)}`, link: `/quotes/edit/${q.id}`, label: q.quote_number, icon: DocumentPlusIcon, status: q.status, statusColor: quoteStatusColors[q.status] })) : [])
        ];
        return combined.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [visits, appointments, tasks, quotes, activeFilters, t]);

    const filterOptions: { id: AgendaFilter, label: string }[] = [
        { id: 'visits', label: t('visits') },
        { id: 'appointments', label: t('appointments') },
        { id: 'tasks', label: t('tasks') },
        { id: 'quotes', label: t('quotes') },
    ];

    // Fix: Augmented item prop type to include optional 'state' property, resolving a TypeScript error.
    const AgendaItemCard: React.FC<{item: (typeof agendaItems)[0] & { state?: any }}> = ({ item }) => (
      <li key={item.id}>
        <div className="relative pb-8">
            <span className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-gray-200 dark:bg-slate-700" aria-hidden="true" />
            <div className="relative flex items-start space-x-3">
                <div><span className="h-10 w-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center ring-8 ring-gray-50 dark:ring-slate-900"><item.icon className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" /></span></div>
                <div className="min-w-0 flex-1 pt-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 -mt-1 cursor-pointer hover:shadow-md" onClick={() => openTab({ path: item.link, label: item.label, state: item.state })}>
                    <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white flex-1 truncate pr-2">{item.title}</p>
                        <time dateTime={item.date.toISOString()} className="whitespace-nowrap text-sm font-mono bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-200 px-2 py-1 rounded">
                            {formatEuropeanTime(item.date)}
                        </time>
                    </div>
                    <div className="mt-2 space-y-2">
                        <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center"><UserIcon className="w-4 h-4 mr-2 text-gray-400 shrink-0"/><span>{item.customerDetails}</span></p>
                        {item.locationDetails && <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center"><MapPinIcon className="w-4 h-4 mr-2 text-gray-400 shrink-0"/><span>{item.locationDetails}</span></p>}
                        {item.status && <div className="pt-1"><span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-${item.statusColor}-50 text-${item.statusColor}-700 ring-${item.statusColor}-600/20 capitalize`}>{t(item.status as any)}</span></div>}
                    </div>
                </div>
            </div>
        </div>
      </li>
    );

    const groupedByDay = agendaItems.reduce((acc, item) => {
        const day = item.date.toISOString().split('T')[0];
        if (!acc[day]) acc[day] = [];
        acc[day].push(item);
        return acc;
    }, {} as Record<string, typeof agendaItems>);
    
    const sortedDays = Object.keys(groupedByDay).sort();

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda</h1><div className="flex items-center space-x-1 bg-gray-200 dark:bg-slate-700 rounded-lg p-1"><button onClick={() => setAgendaView('today')} className={`px-3 py-1 text-sm font-medium rounded-md ${agendaView === 'today' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('today')}</button><button onClick={() => setAgendaView('week')} className={`px-3 py-1 text-sm font-medium rounded-md ${agendaView === 'week' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('week')}</button></div></div>
                <div className="flex items-center space-x-2 overflow-x-auto pb-2">{filterOptions.map(option => (<button key={option.id} onClick={() => toggleFilter(option.id)} className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${activeFilters[option.id] ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-600'}`}>{option.label}</button>))}</div>
            </div>
            
            {loading ? <div className="text-center p-8 text-gray-500">Loading agenda...</div> : agendaItems.length > 0 ? (agendaView === 'today' ? (<div className="flow-root"><ul role="list" className="-mb-8">{agendaItems.map(item => <AgendaItemCard key={item.id} item={item}/>)}</ul></div>) : (<div className="space-y-6">{sortedDays.map(day => (<div key={day}><h2 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">{format(new Date(day), 'EEEE, dd. MMMM')}</h2><div className="flow-root"><ul role="list" className="-mb-8">{groupedByDay[day].map(item => <AgendaItemCard key={item.id} item={item}/>)}</ul></div></div>))}</div>)) : (<div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg shadow-sm"><CalendarIcon className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No activities found</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your agenda for this period is clear.</p></div>)}
        </div>
      );
  }

  // --- Main Render ---
  if (profile?.role === 'field_service_employee') return renderFieldServiceDashboard();
  if (loading) return <div className="text-center p-8 text-gray-500">Loading dashboard...</div>;

  const hasChartData = salesData.some(month => month.paid > 0 || month.sent > 0 || month.overdue > 0 || month.draft > 0);
  const statusColors: { [key in InvoiceStatus]: string } = { draft: 'bg-yellow-100 text-yellow-800', sent: 'bg-blue-100 text-blue-800', paid: 'bg-green-100 text-green-800', overdue: 'bg-red-100 text-red-800' };

  return (
    <div className="space-y-8">
      <UpgradeBanner isOpen={showUpgradeBanner} onClose={() => setShowUpgradeBanner(false)} message={bannerMessage} />
      {profile?.role === 'super_admin' && <div className="p-4 mb-6 bg-yellow-100 border-l-4 border-yellow-500 rounded-r-lg dark:bg-yellow-900/50"><div className="flex"><div className="flex-shrink-0"><CubeIcon className="w-5 h-5 text-yellow-600" /></div><div className="ml-3"><p className="text-sm text-yellow-700 dark:text-yellow-200">You are in Super Admin mode.</p></div></div></div>}
      
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('dashboard')}</h1>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h2 className="text-lg font-semibold mb-4">{t('quickCreate')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            <button onClick={handleNewInvoiceClick} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><PlusIcon className="w-6 h-6 mb-1" />{t('newInvoice')}</button>
            <button onClick={handleNewQuoteClick} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-sky-50 text-sky-700 font-semibold rounded-lg hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><DocumentDuplicateIcon className="w-6 h-6 mb-1" />{t('newQuote')}</button>
            <button onClick={openCustomerModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-indigo-50 text-indigo-700 font-semibold rounded-lg hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><UserPlusIcon className="w-6 h-6 mb-1" />{t('newCustomer')}</button>
            <button onClick={() => openTab({ path: '/visits/new', label: t('newVisit') })} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-purple-50 text-purple-700 font-semibold rounded-lg hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><BriefcaseIcon className="w-6 h-6 mb-1" />{t('newVisit')}</button>
            <button onClick={openProductModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-pink-50 text-pink-700 font-semibold rounded-lg hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:bg-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><ArchiveBoxIcon className="w-6 h-6 mb-1" />{t('newProduct')}</button>
            <button onClick={() => openTaskModal()} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-amber-50 text-amber-700 font-semibold rounded-lg hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><ClipboardDocumentListIcon className="w-6 h-6 mb-1" />{t('addTask')}</button>
            <button onClick={openExpenseModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-red-50 text-red-700 font-semibold rounded-lg hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><CurrencyDollarIcon className="w-6 h-6 mb-1" />{t('addExpense')}</button>
            <button onClick={() => openAppointmentModal()} className="flex flex-col items-center justify-center p-3 bg-teal-50 text-teal-700 font-semibold rounded-lg hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-400 dark:hover:bg-teal-500/20"><CalendarDaysIcon className="w-6 h-6 mb-1" />{t('addAppointment')}</button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={BanknotesIcon} title="Total Revenue (This Year)" value={`€${stats.totalRevenue.toFixed(2)}`} color="bg-green-500" />
        <StatCard icon={DocumentTextIcon} title="Unpaid Invoices" value={stats.unpaidInvoices} color="bg-yellow-500" onClick={() => openTab({ path: '/invoices', label: t('invoices')})} />
        <StatCard icon={DocumentPlusIcon} title={t('pending_quotes')} value={stats.pendingQuotes} color="bg-blue-500" onClick={() => openTab({ path: '/quotes', label: t('quotes')})} />
      </div>

      <ActionCenter />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md"><h2 className="text-lg font-semibold mb-4">{t('sales_overview')}</h2>{hasChartData ? <ResponsiveContainer width="100%" height={300}><BarChart data={salesData} margin={{ top: 5, right: 20, left: -5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(200, 200, 200, 0.2)"/><XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} /><YAxis tickFormatter={yAxisTickFormatter} tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} /><Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }} /><Legend iconType="circle" iconSize={10} wrapperStyle={{ paddingTop: '20px' }} /><Bar dataKey="paid" stackId="sales" name={t('paid')} fill="#22c55e" radius={[4, 4, 0, 0]} /><Bar dataKey="draft" stackId="sales" name={t('draft')} fill="#eab308" radius={[4, 4, 0, 0]} /><Bar dataKey="sent" stackId="sales" name={t('sent')} fill="#3b82f6" radius={[4, 4, 0, 0]} /><Bar dataKey="overdue" stackId="sales" name={t('overdue')} fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">No sales data for this year.</div>}</div>
        <div className="lg:col-span-2"><DispatchHub /></div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden"><h2 className="p-6 text-lg font-semibold border-b dark:border-slate-700">{t('recent_invoices')}</h2><div className="overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-50/50 dark:bg-slate-800/50"><tr className="text-left"><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invoice #</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>{profile?.role === 'super_admin' && <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Organization</th>}<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th><th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('actions')}</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-slate-700">{recentInvoices.length > 0 ? recentInvoices.map(invoice => (<tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50"><td className="px-6 py-4"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="font-medium text-primary-600 hover:underline">{invoice.invoice_number}</button></td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{invoice.customers?.name || 'N/A'}</td>{profile?.role === 'super_admin' && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{((invoice as any).organizations as any)?.name || 'N/A'}</td>}<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(invoice.issue_date)}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">€{invoice.total_amount.toFixed(2)}</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span></td><td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} title="Edit / View"><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button><button onClick={() => handleSendEmail(invoice)} title="Send Email"><EnvelopeIcon className="w-5 h-5 inline-block text-gray-500 dark:text-gray-400 hover:text-primary-600"/></button><button onClick={() => handleDownloadPDF(invoice.id)} title="Download PDF"><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 dark:text-gray-400 hover:text-primary-600"/></button></td></tr>)) : (<tr><td colSpan={profile?.role === 'super_admin' ? 7 : 6} className="p-4 text-center text-gray-500">No recent invoices.</td></tr>)}</tbody></table></div></div>
    </div>
  );
};

export default DashboardPage;