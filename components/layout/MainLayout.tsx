import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import Chatbot from '../Chatbot';
import TraceMonitor from '../TraceMonitor';
import TabBar from './TabBar';
import ToastContainer from '../notifications/ToastContainer';
import { useAuth } from '../../contexts/AuthContext';
import { useTabs } from '../../contexts/TabContext';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const { tabs, activeTabKey } = useTabs();

  // This state will cache the rendered component for each path.
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>({});

  // Effect to add the currently rendered page to our cache if it's not already there.
  // This is the core of the state preservation logic.
  useEffect(() => {
    if (children && !cachedPages[location.pathname]) {
      setCachedPages(prev => ({ ...prev, [location.pathname]: children }));
    }
  }, [location.pathname, children, cachedPages]);
  
  // Effect to clean up the cache when a tab is closed.
  useEffect(() => {
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


  const [sidebarOpen, setSidebarOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  return (
    <div className="relative flex h-screen bg-gray-50 dark:bg-slate-900">
      <ToastContainer />
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      ></div>

      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <TabBar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-slate-900 p-4 sm:p-6 lg:p-8">
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
      </div>
      
      {profile?.role === 'super_admin' && <Chatbot />}
      {user?.email === 'dardan.zogu@hotmail.com' && <TraceMonitor />}
    </div>
  );
};

export default MainLayout;
