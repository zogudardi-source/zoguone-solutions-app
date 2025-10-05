import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Customer } from '../types';
import CustomerModal from '../components/modals/CustomerModal';
import { PlusIcon, PencilIcon, TrashIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const CustomersPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchCustomers = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    let query = supabase.from('customers').select('*, organizations:organizations!left(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,customer_number.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (error) {
      console.error('Error fetching customers:', error.message);
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  }, [user, profile, searchTerm, sortConfig]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers, refreshKey]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (customer: Customer | null = null) => {
    if (profile?.role === 'super_admin' && !customer) return;
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
  };

  const handleSaveCustomer = (savedCustomer: Customer) => {
    fetchCustomers();
    handleCloseModal();
  };

  const handleDeleteCustomer = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) {
        alert('Error deleting customer: ' + error.message);
      } else {
        setCustomers(customers.filter(c => c.id !== id));
      }
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

  const MobileCustomerCard: React.FC<{ customer: Customer }> = ({ customer }) => (
    <div onClick={() => openTab({ path: `/customers/${customer.id}`, label: customer.name })} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between cursor-pointer">
        <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">{customer.name}</p>
            <p className="text-sm font-mono text-gray-500">{customer.customer_number}</p>
        </div>
        <ChevronRightIcon className="w-6 h-6 text-gray-400" />
    </div>
  );

  const DesktopCustomerTable = () => (
    <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <SortableHeader sortKey="customer_number" label="Customer #" />
              <SortableHeader sortKey="name" label="Name" />
              {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label="Organization" />}
              <SortableHeader sortKey="email" label="Email" />
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">Phone</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800">
            {customers.map(customer => (
              <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{customer.customer_number}</td>
                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => openTab({ path: `/customers/${customer.id}`, label: customer.name })} className="text-primary-600 hover:underline">{customer.name}</button>
                </td>
                {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{customer.organizations?.name || 'N/A'}</td>}
                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{customer.email || '-'}</td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{customer.phone || '-'}</td>
                <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium space-x-2">
                  <button onClick={() => handleOpenModal(customer)} className="text-primary-600 hover:text-primary-800"><PencilIcon className="w-5 h-5"/></button>
                  <button onClick={() => handleDeleteCustomer(customer.id)} className="text-red-600 hover:text-red-800"><TrashIcon className="w-5 h-5"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('customers')}</h1>
          {!isFieldServiceEmployee && (
            <button
                onClick={() => handleOpenModal()}
                disabled={profile?.role === 'super_admin'}
                className="mt-4 sm:mt-0 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                <PlusIcon className="w-5 h-5 mr-2" />
                {t('newCustomer')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <input 
                type="text"
                placeholder="Search by name or customer number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
            />
        </div>

        {loading ? (
             <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : customers.length > 0 ? (
            isFieldServiceEmployee ? (
                <div className="space-y-4">
                    {customers.map(customer => <MobileCustomerCard key={customer.id} customer={customer} />)}
                </div>
            ) : (
                <DesktopCustomerTable />
            )
        ) : (
             <div className="p-6 text-center text-gray-500">No customers found.</div>
        )}
      </div>
      {isModalOpen && (
        <CustomerModal 
            customer={selectedCustomer} 
            closeModal={handleCloseModal} 
            onSave={handleSaveCustomer} 
        />
      )}
    </>
  );
};

export default CustomersPage;