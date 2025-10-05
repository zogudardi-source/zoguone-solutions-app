
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNavBar from './BottomNavBar';
import Chatbot from '../Chatbot';
import TraceMonitor from '../TraceMonitor';
import ToastContainer from '../notifications/ToastContainer';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';
import { useTabs } from '../../contexts/TabContext';
import TabBar from './TabBar';


const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const { tabs, activeTabKey } = useTabs();
  const { openTaskModal, openExpenseModal, openAppointmentModal } = useModal();

  // Page caching logic to preserve state when switching tabs
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>({});

  useEffect(() => {
    // `children` is the component for the current route. If it's not cached, add it.
    if (children && !cachedPages[location.pathname]) {
      setCachedPages(prev => ({ ...prev, [location.pathname]: children }));
    }
  }, [location.pathname, children, cachedPages]);
  
  useEffect(() => {
    // Clean up the cache when a tab is closed.
    const openTabPaths = new Set(tabs.map(t => t.path));
    setCachedPages(prevCache => {
      const newCache: Record<string, React.ReactNode> = {};
      for (const path in prevCache) {
        if (openTabPaths.has(path)) {
          newCache[path] = prevCache[path];
        }
      }
      return newCache;
    });
  }, [tabs]);


  return (
    <>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-800">
        <ToastContainer />
        <Header sidebarOpen={false} setSidebarOpen={() => {}} />
        <TabBar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-32">
          {tabs.map(tab => (
            <div
              key={tab.key}
              style={{ display: activeTabKey === tab.key ? 'block' : 'none' }}
              className="h-full w-full"
            >
              {cachedPages[tab.path]}
            </div>
          ))}
        </main>
        <BottomNavBar 
          onOpenTaskModal={openTaskModal}
          onOpenExpenseModal={openExpenseModal}
          onOpenAppointmentModal={openAppointmentModal}
        />
        {profile?.role === 'super_admin' && <Chatbot />}
        {user?.email === 'dardan.zogu@hotmail.com' && <TraceMonitor />}
      </div>
    </>
  );
};

export default MobileLayout;
