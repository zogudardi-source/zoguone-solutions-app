
import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTabs } from '../../contexts/TabContext';
import {
  HomeIcon,
  UsersIcon,
  BriefcaseIcon,
  UserCircleIcon,
  PlusIcon,
  XMarkIcon,
  DocumentPlusIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

interface BottomNavBarProps {
  onOpenTaskModal: () => void;
  onOpenExpenseModal: () => void;
  onOpenAppointmentModal: () => void;
}


const BottomNavBar: React.FC<BottomNavBarProps> = ({ onOpenTaskModal, onOpenExpenseModal, onOpenAppointmentModal }) => {
  const { t } = useLanguage();
  const { openTab, activeTabKey } = useTabs();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: t('dashboard'), icon: HomeIcon },
    { path: '/quotes', label: t('quotes'), icon: DocumentPlusIcon },
    { path: '/customers', label: t('customers'), icon: UsersIcon },
    { path: '/visits', label: t('visits'), icon: BriefcaseIcon },
    { path: '/profile', label: t('profile'), icon: UserCircleIcon },
  ];
  
  const menuItems = [
    { label: t('newVisit'), icon: BriefcaseIcon, action: () => openTab({ path: '/visits/new', label: t('newVisit') }) },
    { label: t('newQuote'), icon: DocumentPlusIcon, action: () => openTab({ path: '/quotes/new', label: t('newQuote') }) },
    { label: t('addAppointment'), icon: CalendarDaysIcon, action: onOpenAppointmentModal },
    { label: t('addTask'), icon: ClipboardDocumentListIcon, action: onOpenTaskModal },
    { label: t('addExpense'), icon: CurrencyDollarIcon, action: onOpenExpenseModal },
  ];

  const handleMenuAction = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };


  return (
    <>
      {/* Overlay for menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40" 
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      {/* FAB Menu Items */}
      <div className={`fixed bottom-24 right-1/2 translate-x-1/2 z-50 flex flex-col items-center gap-4 transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
          {menuItems.map((item, index) => (
               <div key={item.label} className="flex items-center gap-3">
                   <span className="bg-white dark:bg-gray-700 text-sm px-3 py-1 rounded-full shadow-md">{item.label}</span>
                   <button 
                       onClick={() => handleMenuAction(item.action)}
                       className="w-14 h-14 bg-white dark:bg-gray-700 rounded-full text-primary-600 flex items-center justify-center shadow-lg"
                   >
                       <item.icon className="w-6 h-6"/>
                   </button>
               </div>
          ))}
      </div>

      {/* Main Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-around items-center z-50">
        {navLinks.slice(0, 2).map((link) => {
          const isActive = activeTabKey === link.path;
          return (
            <button key={link.path} onClick={() => openTab({ path: link.path, label: link.label })} className={`flex flex-col items-center justify-center w-full h-full text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`}>
                <link.icon className="w-6 h-6 mb-1" />
                <span>{link.label}</span>
            </button>
          );
        })}

        <div className="w-full flex justify-center">
             <button 
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="w-16 h-16 bg-primary-600 rounded-full text-white flex items-center justify-center shadow-lg transform -translate-y-1/3 transition-transform hover:scale-110"
             >
                {isMenuOpen ? <XMarkIcon className="w-8 h-8" /> : <PlusIcon className="w-8 h-8" />}
            </button>
        </div>

        {navLinks.slice(2, 5).map((link) => {
           const isActive = activeTabKey === link.path;
           return (
             <button key={link.path} onClick={() => openTab({ path: link.path, label: link.label })} className={`flex flex-col items-center justify-center w-full h-full text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`}>
                 <link.icon className="w-6 h-6 mb-1" />
                 <span>{link.label}</span>
             </button>
           );
        })}
      </nav>
    </>
  );
};

export default BottomNavBar;
