
import React, { createContext, useContext, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { TraceProvider } from './contexts/TraceContext';
import { RefreshProvider, useRefresh } from './contexts/RefreshContext';
import { TabProvider } from './contexts/TabContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ModalContext, useModal } from './contexts/ModalContext';
import { isSupabaseConfigured, supabase } from './services/supabase';
import ConfigurationNotice from './components/ConfigurationNotice';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import InvoicesPage from './pages/InvoicesPage';
import ExpensesPage from './pages/ExpensesPage';
import CustomersPage from './pages/CustomersPage';
import ProfilePage from './pages/ProfilePage';
import MainLayout from './components/layout/MainLayout';
import MobileLayout from './components/layout/MobileLayout';
import InvoiceEditor from './pages/InvoiceEditor';
import ReportsPage from './pages/ReportsPage';
import TasksPage from './pages/TasksPage'; 
import QuotesPage from './pages/QuotesPage';
import QuoteEditor from './pages/QuoteEditor';
import AppointmentsPage from './pages/AppointmentsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TeamPage from './pages/TeamPage';
import VisitsPage from './pages/VisitsPage';
import VisitEditor from './pages/VisitEditor';
import CustomerDetailPage from './pages/CustomerDetailPage';
import DispatcherPage from './pages/DispatcherPage';
import SettingsPage from './pages/SettingsPage';
import { UserRole, Product, Task, Expense, Appointment, Customer } from './types';
import { defaultPermissions } from './constants';
import { createNotification } from './lib/notifications';
import { generateNextNumber } from './lib/numberGenerator';

// Modal Components
import ProductModal from './components/modals/ProductModal';
import TaskModal from './components/modals/TaskModal';
import ExpenseModal from './components/modals/ExpenseModal';
import AppointmentModal from './components/modals/AppointmentModal';
import CustomerModal from './components/modals/CustomerModal';


// A wrapper for routes that require authentication and permission
const PrivateRoute: React.FC<{ children: React.ReactElement; permission?: string }> = ({ children, permission }) => {
  const { session, loading, profile, permissions, permissionsLoaded } = useAuth();

  if (loading || !permissionsLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  
  // Permission Check
  if (permission && profile && profile.role !== 'super_admin') {
      const userPermissions = permissions || defaultPermissions[profile.role] || [];
      if (!userPermissions.includes(permission)) {
          // User does not have permission, redirect to dashboard
          return <Navigate to="/" replace />;
      }
  }


  // Choose the layout based on the user's role
  const Layout = profile?.role === 'field_service_employee' ? MobileLayout : MainLayout;

  return <Layout>{children}</Layout>;
};

const AppRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route 
        path="/" 
        element={<PrivateRoute permission="dashboard"><DashboardPage /></PrivateRoute>} 
      />
       <Route 
        path="/inventory" 
        element={<PrivateRoute permission="inventory"><InventoryPage /></PrivateRoute>} 
      />
      <Route 
        path="/invoices" 
        element={<PrivateRoute permission="invoices"><InvoicesPage /></PrivateRoute>} 
      />
       <Route 
        path="/invoices/new" 
        element={<PrivateRoute permission="invoices"><InvoiceEditor key={location.pathname} /></PrivateRoute>} 
      />
      <Route 
        path="/invoices/edit/:id" 
        element={<PrivateRoute permission="invoices"><InvoiceEditor key={location.pathname} /></PrivateRoute>} 
      />
        <Route 
        path="/quotes" 
        element={<PrivateRoute permission="quotes"><QuotesPage /></PrivateRoute>} 
      />
      <Route 
        path="/quotes/new" 
        element={<PrivateRoute permission="quotes"><QuoteEditor key={location.pathname} /></PrivateRoute>} 
      />
      <Route 
        path="/quotes/edit/:id" 
        element={<PrivateRoute permission="quotes"><QuoteEditor key={location.pathname} /></PrivateRoute>} 
      />
      <Route 
        path="/customers" 
        element={<PrivateRoute permission="customers"><CustomersPage /></PrivateRoute>} 
      />
      <Route 
        path="/customers/:id" 
        element={<PrivateRoute permission="customers"><CustomerDetailPage key={location.pathname} /></PrivateRoute>} 
      />
       <Route 
        path="/expenses" 
        element={<PrivateRoute permission="expenses"><ExpensesPage /></PrivateRoute>} 
      />
       <Route 
        path="/reports" 
        element={<PrivateRoute permission="reports"><ReportsPage /></PrivateRoute>} 
      />
      <Route 
        path="/tasks" 
        element={<PrivateRoute permission="tasks"><TasksPage /></PrivateRoute>} 
      />
      <Route 
        path="/dispatcher" 
        element={<PrivateRoute permission="dispatcher"><DispatcherPage /></PrivateRoute>} 
      />
      <Route 
        path="/appointments" 
        element={<PrivateRoute permission="appointments"><AppointmentsPage /></PrivateRoute>} 
      />
       <Route 
        path="/visits" 
        element={<PrivateRoute permission="visits"><VisitsPage /></PrivateRoute>} 
      />
      <Route 
        path="/visits/new" 
        element={<PrivateRoute permission="visits"><VisitEditor key={location.pathname} /></PrivateRoute>} 
      />
      <Route 
        path="/visits/edit/:id" 
        element={<PrivateRoute permission="visits"><VisitEditor key={location.pathname} /></PrivateRoute>} 
      />
      <Route 
        path="/profile" 
        element={<PrivateRoute permission="profile"><ProfilePage /></PrivateRoute>} 
      />
      <Route 
        path="/team" 
        element={<PrivateRoute permission="team"><TeamPage /></PrivateRoute>} 
      />
      <Route 
        path="/settings" 
        element={<PrivateRoute permission="settings"><SettingsPage /></PrivateRoute>} 
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

// --- Global Modal Provider ---
const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile } = useAuth();
    const { triggerRefresh } = useRefresh();

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [modalDefaultDate, setModalDefaultDate] = useState<Date | null>(null);

    // Fetch customers once for modals that need them
    React.useEffect(() => {
        if (profile?.org_id) {
            supabase.from('customers').select('*').eq('org_id', profile.org_id)
                .then(({ data }) => setCustomers(data || []));
        }
    }, [profile?.org_id]);
    
    // --- Save Handlers ---
    const handleSaveProduct = async (productData: Partial<Product>) => {
        const { error } = await supabase.from('products').upsert(productData).select().single();
        if (error) alert('Error saving product: ' + error.message);
        else {
            triggerRefresh();
            setIsProductModalOpen(false);
        }
    };
    const handleSaveTask = async (taskData: Partial<Task>) => {
        if (!user || !profile?.org_id) return;
        const dataToUpsert = { ...taskData, user_id: taskData.user_id || user.id, org_id: taskData.org_id || profile.org_id };
        const { error } = await supabase.from('tasks').upsert(dataToUpsert);
        if (error) alert('Error saving task: ' + error.message);
        else {
            triggerRefresh();
            setIsTaskModalOpen(false);
        }
    };
    const handleSaveExpense = async () => {
        triggerRefresh();
        setIsExpenseModalOpen(false);
    };
    const handleSaveAppointment = async (appointmentData: Partial<Appointment>) => {
        if (!user || !profile?.org_id) return;
        let dataToUpsert = { ...appointmentData, org_id: profile.org_id };
        if (!dataToUpsert.id) {
            dataToUpsert.appointment_number = await generateNextNumber(profile.org_id, 'appointment');
            dataToUpsert.status = 'open';
        }
        const { data: savedAppt, error } = await supabase.from('appointments').upsert(dataToUpsert).select().single();
        if (error) {
            alert('Error saving appointment: ' + error.message);
        } else {
            if (savedAppt?.user_id && savedAppt.user_id !== user.id) {
                await createNotification({ user_id: savedAppt.user_id, org_id: profile.org_id, title: 'New Appointment Created', body: `Appointment "${savedAppt.title}" was created by ${profile.full_name}.`, type: 'new_appointment', related_entity_path: '/appointments', related_entity_id: savedAppt.id.toString() });
            }
            triggerRefresh();
            setIsAppointmentModalOpen(false);
        }
    };
    const handleSaveCustomer = () => {
        triggerRefresh();
        setIsCustomerModalOpen(false);
    };

    const value = {
        openProductModal: useCallback(() => setIsProductModalOpen(true), []),
        openTaskModal: useCallback((defaultDate?: Date) => { setModalDefaultDate(defaultDate || null); setIsTaskModalOpen(true); }, []),
        openExpenseModal: useCallback(() => setIsExpenseModalOpen(true), []),
        openAppointmentModal: useCallback((defaultDate?: Date) => { setModalDefaultDate(defaultDate || new Date()); setIsAppointmentModalOpen(true); }, []),
        openCustomerModal: useCallback(() => setIsCustomerModalOpen(true), []),
    };

    return (
        <ModalContext.Provider value={value}>
            {children}
            {isProductModalOpen && <ProductModal product={null} closeModal={() => setIsProductModalOpen(false)} onSave={handleSaveProduct} />}
            {isTaskModalOpen && <TaskModal task={null} onClose={() => setIsTaskModalOpen(false)} onSave={handleSaveTask} defaultDate={modalDefaultDate} />}
            {isExpenseModalOpen && <ExpenseModal expense={null} closeModal={() => setIsExpenseModalOpen(false)} onSave={handleSaveExpense} />}
            {isAppointmentModalOpen && <AppointmentModal appointment={null} customers={customers} onClose={() => setIsAppointmentModalOpen(false)} onSave={handleSaveAppointment} defaultDate={modalDefaultDate} />}
            {isCustomerModalOpen && <CustomerModal customer={null} closeModal={() => setIsCustomerModalOpen(false)} onSave={handleSaveCustomer} />}
        </ModalContext.Provider>
    );
};


function App() {
  // Check if Supabase is configured before rendering the app
  if (!isSupabaseConfigured) {
    return <ConfigurationNotice />;
  }

  return (
    <LanguageProvider>
      <HashRouter>
        <TraceProvider>
          <RefreshProvider>
            <AuthProvider>
              <NotificationProvider>
                <TabProvider>
                  <ModalProvider>
                    <AppRoutes />
                  </ModalProvider>
                </TabProvider>
              </NotificationProvider>
            </AuthProvider>
          </RefreshProvider>
        </TraceProvider>
      </HashRouter>
    </LanguageProvider>
  );
}

export default App;
