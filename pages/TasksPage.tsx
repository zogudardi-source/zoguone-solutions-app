
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Task } from '../types';
import TaskModal from '../components/modals/TaskModal';
import { createNotification } from '../lib/notifications';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';
import { useLocation, useNavigate } from 'react-router-dom';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const TasksPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'due_date', direction: 'asc' });

  const canManageTasks = profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchTasks = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    setLoading(true);
    
    let query = supabase
      .from('tasks')
      .select('*, customers:customers!left(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (!showCompleted) {
      query = query.eq('is_complete', false);
    }
    
    const { data, error } = await query.order(sortConfig.key, { 
        ascending: sortConfig.direction === 'asc',
        nullsFirst: false 
    });

    if (error) console.error('Error fetching tasks:', error.message);
    else setTasks(data as any || []);
    
    setLoading(false);
  }, [user, profile, showCompleted, sortConfig]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshKey]);

  useEffect(() => {
    const state = location.state as { openModalForId?: string } | null;
    // Check if tasks are loaded and modal isn't already open
    if (state?.openModalForId && tasks.length > 0 && !isModalOpen) {
        const taskToOpen = tasks.find(t => t.id === state.openModalForId);
        if (taskToOpen) {
            setSelectedTask(taskToOpen);
            setIsModalOpen(true);
            // Clear the state so the modal doesn't reopen on every render/refresh
            navigate(location.pathname, { replace: true, state: null });
        }
    }
  }, [location.state, tasks, isModalOpen, navigate, location.pathname]);
  
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (task: Task | null = null) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    if (!user || !profile?.org_id) return;
    const dataToUpsert = { ...taskData, user_id: taskData.user_id || user.id, org_id: taskData.org_id || profile.org_id };
    
    const { data: savedTask, error } = await supabase.from('tasks').upsert(dataToUpsert).select().single();

    if (error) {
        alert('Error saving task: ' + error.message);
    } else { 
        // --- Create Notification ---
        if (savedTask && savedTask.user_id && savedTask.user_id !== user.id) {
            await createNotification({
                user_id: savedTask.user_id,
                org_id: profile.org_id,
                title: 'New Task Assigned',
                body: `Task "${savedTask.title}" was assigned to you by ${profile.full_name}.`,
                type: 'new_task',
                related_entity_path: '/tasks',
                related_entity_id: savedTask.id,
            });
        }
        fetchTasks(); 
        handleCloseModal(); 
    }
  };

  const handleToggleComplete = async (task: Task) => {
    const { error } = await supabase.from('tasks').update({ is_complete: !task.is_complete }).eq('id', task.id);
    if (error) alert('Error updating task: ' + error.message);
    else fetchTasks();
  };
  
  const handleDeleteTask = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) alert('Error deleting task: ' + error.message);
        else fetchTasks();
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

  const MobileTaskCard: React.FC<{ task: Task }> = ({ task }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-start space-x-4">
        <input 
            type="checkbox" 
            checked={task.is_complete}
            onChange={() => handleToggleComplete(task)}
            className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer mt-1"
        />
        <div className="flex-grow">
            <p className={`font-medium ${task.is_complete ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{task.title}</p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 text-xs text-gray-500 dark:text-gray-400">
                {task.customers?.name && <span>For: {task.customers.name}</span>}
                {task.due_date && <span>Due: {formatEuropeanDate(task.due_date)}</span>}
            </div>
        </div>
        {canManageTasks && (
          <div className="flex items-center space-x-2">
              <button onClick={() => handleOpenModal(task)} className="text-gray-400 hover:text-primary-600"><PencilIcon className="w-5 h-5"/></button>
              <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
          </div>
        )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('tasks')}</h1>
          {canManageTasks && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('addTask')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={showCompleted} onChange={() => setShowCompleted(!showCompleted)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span>Show completed tasks</span>
            </label>
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">Loading...</div> : (
          isFieldServiceEmployee ? (
              <div className="space-y-4">
                 {tasks.length > 0 ? tasks.map(task => (
                    <MobileTaskCard key={task.id} task={task} />
                  )) : <p className="p-6 text-center text-gray-500">{t('noTasksFound')}</p>}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr>
                                <th className="px-6 py-3 w-12 border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"></th>
                                <SortableHeader sortKey="title" label="Title" />
                                <SortableHeader sortKey="customers.name" label="Customer" />
                                <SortableHeader sortKey="due_date" label="Due Date" />
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800">
                            {tasks.length > 0 ? tasks.map(task => (
                                <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                                    <td className="px-6 py-3">
                                        <input type="checkbox" checked={task.is_complete} onChange={() => handleToggleComplete(task)} className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"/>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                                        <span className={task.is_complete ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}>{task.title}</span>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.customers?.name || '-'}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.due_date ? formatEuropeanDate(task.due_date) : '-'}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button onClick={() => handleOpenModal(task)} className="text-primary-600 hover:text-primary-800"><PencilIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeleteTask(task.id)} className="text-red-600 hover:text-red-800"><TrashIcon className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} className="p-4 text-center text-gray-500">{t('noTasksFound')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )
        )}
      </div>
      {isModalOpen && <TaskModal task={selectedTask} onClose={handleCloseModal} onSave={handleSaveTask} />}
    </>
  );
};

export default TasksPage;
