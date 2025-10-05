
import React from 'react';
import { NavLink } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTabs } from '../../contexts/TabContext';
import { useAuth } from '../../contexts/AuthContext';

const TabBar: React.FC = () => {
  const { tabs, activeTabKey, closeTab } = useTabs();
  const { profile } = useAuth();

  // The tabbing UI is hidden if there's only the dashboard tab.
  if (tabs.length <= 1) {
    return null;
  }

  const handleCloseTab = (e: React.MouseEvent, key: string) => {
    // Prevent default browser action (e.g., focus shifting).
    e.preventDefault();
    // Stop this event from bubbling up to prevent any parent
    // listeners (like React Router) from interfering with the close action.
    e.stopPropagation();
    
    // Decouple the state update from the event. This pushes the execution
    // to the end of the browser's event queue, guaranteeing the full
    // click cycle (mousedown + mouseup) completes before the element is removed.
    setTimeout(() => {
      closeTab(key);
    }, 0);
  };

  return (
    <div className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <nav className="flex space-x-1 overflow-x-auto p-1.5 no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTabKey === tab.key;
          return (
            <div
              key={tab.key}
              className={`flex items-center shrink-0 group whitespace-nowrap rounded-md transition-colors ${
                isActive
                  ? 'bg-white text-primary-700 dark:bg-slate-900 dark:text-white'
                  : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-slate-700'
              }`}
            >
              <NavLink
                to={tab.path}
                className="pl-4 pr-3 py-2 text-sm font-medium"
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </NavLink>
              {!tab.isPermanent && (
                <button
                  onMouseDown={(e) => handleCloseTab(e, tab.key)}
                  className="pr-2"
                  aria-label={`Close tab: ${tab.label}`}
                >
                  <div className="p-0.5 rounded-full hover:bg-gray-300/50 dark:hover:bg-slate-600/50">
                     {/* The icon is made invisible to pointer events to ensure the parent button is always the reliable click target. */}
                     <XMarkIcon 
                        className={`w-4 h-4 pointer-events-none ${
                          isActive 
                            ? 'text-primary-600 dark:text-gray-200' 
                            : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'
                        }`} 
                      />
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default TabBar;
