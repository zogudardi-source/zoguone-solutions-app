import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Visit, VisitStatus } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const VisitsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<VisitStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'visit_date', direction: 'desc' });
  
  const canCreate = profile?.role !== 'super_admin';
  const canManage = profile?.role !== 'field_service_employee';

  const fetchVisits = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('visits')
      .select('*, customers:customers!left(name), profiles:profiles!left(full_name)');

    if (profile.role === 'field_service_employee') {
      query = query.eq('assigned_employee_id', profile.id);
    } else if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (searchTerm) {
      // Query 1: Search by local visit fields (number, location)
      let visitQuery = supabase.from('visits').select('id');
      if (profile.role === 'field_service_employee') {
        visitQuery = visitQuery.eq('assigned_employee_id', profile.id);
      } else if (profile.role !== 'super_admin') {
        visitQuery = visitQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        visitQuery = visitQuery.eq('status', statusFilter);
      }
      const visitPromise = visitQuery.or(`visit_number.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);


      // Query 2: Search by customer name
      let customerQuery = supabase.from('visits').select('id, customers!inner(name)');
       if (profile.role === 'field_service_employee') {
        customerQuery = customerQuery.eq('assigned_employee_id', profile.id);
      } else if (profile.role !== 'super_admin') {
        customerQuery = customerQuery.eq('org_id', profile.org_id);
      }
      if (statusFilter !== 'all') {
        customerQuery = customerQuery.eq('status', statusFilter);
      }
      const customerPromise = customerQuery.ilike('customers.name', `%${searchTerm}%`);
      
      const [
          { data: idsFromVisit, error: error1 },
          { data: idsFromCustomer, error: error2 }
      ] = await Promise.all([
          visitPromise,
          customerPromise
      ]);
      
      if (error1 || error2) {
        console.error("Search query failed:", (error1 || error2).message);
        setVisits([]);
        setLoading(false);
        return;
      }

      const visitIds = new Set([
          ...(idsFromVisit || []).map(i => i.id),
          ...(idsFromCustomer || []).map(i => i.id)
      ]);
      
      if (visitIds.size > 0) {
          query = query.in('id', Array.from(visitIds));
      } else {
          setVisits([]);
          setLoading(false);
          return;
      }
    }


    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc', referencedTable: sortConfig.key.includes('.') ? sortConfig.key.split('.')[0] : undefined });

    if (error) console.error('Error fetching visits:', error.message);
    else setVisits(data as any || []);
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits, refreshKey]);
  
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this visit? This will also remove associated products and expenses.')) {
      await supabase.from('visit_products').delete().eq('visit_id', id);
      await supabase.from('visit_expenses').delete().eq('visit_id', id);
      const { error } = await supabase.from('visits').delete().eq('id', id);
      if (error) alert('Error deleting visit: ' + error.message);
      else fetchVisits();
    }
  };
  
  const statusColors: { [key in VisitStatus]: string } = {
    planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
  };
  
  const visitStatuses: VisitStatus[] = ['planned', 'completed', 'cancelled'];

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

  const VisitCard: React.FC<{ visit: Visit }> = ({ visit }) => (
    <div 
      onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-bold">{visit.customers?.name || 'N/A'}</p>
          <p className="text-sm font-mono text-gray-500">{visit.visit_number}</p>
        </div>
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[visit.status]} capitalize`}>{t(visit.status as any)}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{visit.location}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {formatEuropeanDate(visit.visit_date)} - {visit.profiles?.full_name || 'Unassigned'}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('visits')}</h1>
        {canCreate && (
          <button onClick={() => openTab({ path: '/visits/new', label: t('newVisit') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
            <PlusIcon className="w-5 h-5 mr-2" /> {t('newVisit')}
          </button>
        )}
      </div>

      <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
        <input 
          type="text"
          placeholder="Search by visit #, customer, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        />
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VisitStatus | 'all')}
          className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="all">All Statuses</option>
          {visitStatuses.map(status => (
            <option key={status} value={status} className="capitalize">{t(status as any)}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="p-6 text-center text-gray-500">Loading visits...</div> : (
        profile?.role === 'field_service_employee' ? (
          <div className="space-y-4">
            {visits.length > 0 ? visits.map(visit => (
              <VisitCard key={visit.id} visit={visit} />
            )) : <p className="p-6 text-center text-gray-500">No visits found.</p>}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <SortableHeader sortKey="visit_number" label="Visit #" />
                    <SortableHeader sortKey="customers.name" label="Customer" />
                    <SortableHeader sortKey="visit_date" label={t('visit_date')} />
                    <SortableHeader sortKey="profiles.full_name" label={t('assignedEmployee')} />
                    <SortableHeader sortKey="status" label={t('status')} />
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                  {visits.length > 0 ? visits.map(visit => (
                    <tr key={visit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })} className="font-medium text-primary-600 hover:underline">{visit.visit_number}</button></td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{visit.customers?.name || 'N/A'}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(visit.visit_date)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{visit.profiles?.full_name || 'Unassigned'}</td>
                      <td className="px-6 py-3 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[visit.status]} capitalize`}>{t(visit.status as any)}</span></td>
                      <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })} title="Edit"><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                        {canManage && (
                          <button onClick={() => handleDelete(visit.id)} title="Delete"><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="p-4 text-center text-gray-500">No visits found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default VisitsPage;