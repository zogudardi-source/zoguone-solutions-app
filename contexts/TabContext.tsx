
import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export interface Tab {
  key: string; // Unique identifier, usually the path
  path: string;
  label: string;
  isPermanent?: boolean;
}

interface TabContextType {
  tabs: Tab[];
  activeTabKey: string | null;
  openTab: (tabData: Omit<Tab, 'key' | 'isPermanent'> & { state?: any }) => void;
  closeTab: (keyToClose: string) => void;
  updateTabLabel: (path: string, newLabel: string) => void;
  replaceTab: (oldPath: string, newTab: Omit<Tab, 'key' | 'isPermanent'>) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

const DASHBOARD_TAB: Tab = {
  key: '/',
  path: '/',
  label: 'Dashboard',
  isPermanent: true,
};

// Define paths that should never be converted into a tab.
const NON_TABBABLE_PATHS = ['/auth', '/reset-password'];


export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(DASHBOARD_TAB.key);
  const { profile, session, loading: authLoading } = useAuth();
  
  const navigate = useNavigate();
  const location = useLocation();
  const prevSessionRef = useRef(session);

  // Effect #1: URL drives State & handles session changes.
  useEffect(() => {
    const justLoggedIn = !prevSessionRef.current && session;

    if (authLoading) {
      return;
    }
    
    if (justLoggedIn) {
      setTabs([DASHBOARD_TAB]);
      setActiveTabKey(DASHBOARD_TAB.key);
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      }
      return; 
    }

    if (!session) {
      setTabs([DASHBOARD_TAB]);
      setActiveTabKey(DASHBOARD_TAB.key);
      return;
    }
    
    // Only desktop roles use the tabbing UI logic that automatically opens tabs on navigation.
    // Mobile layout has its own tab bar but navigation is more explicit via openTab.
    if (profile?.role !== 'field_service_employee') {
        const currentPath = location.pathname;

        if (NON_TABBABLE_PATHS.includes(currentPath)) {
            return;
        }

        setTabs(prevTabs => {
            const existingTab = prevTabs.find(tab => tab.path === currentPath);
            if (existingTab) {
            return prevTabs;
            }
            const newTab: Tab = {
            key: currentPath,
            path: currentPath,
            label: currentPath.split('/').pop() || 'Page',
            };
            return [...prevTabs, newTab];
        });
        
        setActiveTabKey(currentPath);
    } else {
        // For mobile, we still need to sync the active key
        setActiveTabKey(location.pathname);
    }


  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, profile, session, authLoading]);
  
  useEffect(() => {
    prevSessionRef.current = session;
  }, [session]);


  // Effect #2: State drives URL (Correction Effect).
  useEffect(() => {
    const activeTabExists = tabs.some(tab => tab.key === activeTabKey);

    if (!activeTabExists && tabs.length > 0) {
      const newActiveTab = tabs[tabs.length - 1];
      if (newActiveTab && location.pathname !== newActiveTab.path) {
         navigate(newActiveTab.path, { replace: true });
      }
    }
  }, [tabs, activeTabKey, navigate, location.pathname]);


  const openTab = useCallback((tabData: Omit<Tab, 'key' | 'isPermanent'> & { state?: any }) => {
    const existingTab = tabs.find(tab => tab.path === tabData.path);
    if (!existingTab) {
        const { state, ...restOfTabData } = tabData;
        setTabs(prevTabs => [...prevTabs, { ...restOfTabData, key: restOfTabData.path }]);
    }
    navigate(tabData.path, { state: tabData.state });
  }, [navigate, tabs]);

  const closeTab = useCallback((keyToClose: string) => {
    const tabToClose = tabs.find(tab => tab.key === keyToClose);
    if (!tabToClose || tabToClose.isPermanent) return;

    setTabs(prevTabs => prevTabs.filter(tab => tab.key !== keyToClose));
  }, [tabs]);
  
  const updateTabLabel = useCallback((path: string, newLabel: string) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.path === path && tab.label !== newLabel ? { ...tab, label: newLabel } : tab
      )
    );
  }, []);

  const replaceTab = useCallback((oldPath: string, newTab: Omit<Tab, 'key' | 'isPermanent'>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.path === oldPath
          ? { ...newTab, key: newTab.path, isPermanent: false }
          : tab
      )
    );
    navigate(newTab.path, { replace: true });
  }, [navigate]);


  const value = {
    tabs,
    activeTabKey,
    openTab,
    closeTab,
    updateTabLabel,
    replaceTab,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabs = () => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};
