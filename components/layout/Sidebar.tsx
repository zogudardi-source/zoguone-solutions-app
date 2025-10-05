import React, { useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  HomeIcon,
  ArchiveBoxIcon,
  DocumentTextIcon,
  UsersIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon, // Import new icon for Tasks
  DocumentPlusIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  BriefcaseIcon,
  MapIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { CubeIcon } from '@heroicons/react/24/solid';


interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const allNavLinks = [
    { to: '/', label: 'dashboard', icon: HomeIcon, permissionKey: 'dashboard', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/dispatcher', label: 'dispatcher', icon: MapIcon, permissionKey: 'dispatcher', defaultRoles: ['super_admin', 'admin', 'key_user'] },
    { to: '/customers', label: 'customers', icon: UsersIcon, permissionKey: 'customers', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/appointments', label: 'appointments', icon: CalendarDaysIcon, permissionKey: 'appointments', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/visits', label: 'visits', icon: BriefcaseIcon, permissionKey: 'visits', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/quotes', label: 'quotes', icon: DocumentPlusIcon, permissionKey: 'quotes', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/invoices', label: 'invoices', icon: DocumentTextIcon, permissionKey: 'invoices', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/inventory', label: 'inventory', icon: ArchiveBoxIcon, permissionKey: 'inventory', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/expenses', label: 'expenses', icon: CurrencyDollarIcon, permissionKey: 'expenses', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/tasks', label: 'tasks', icon: ClipboardDocumentListIcon, permissionKey: 'tasks', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
    { to: '/reports', label: 'reports', icon: ChartBarIcon, permissionKey: 'reports', defaultRoles: ['super_admin', 'admin', 'key_user'] },
    { to: '/team', label: 'team', icon: UserGroupIcon, permissionKey: 'team', defaultRoles: ['super_admin', 'admin', 'key_user'] },
    { to: '/settings', label: 'settings', icon: Cog6ToothIcon, permissionKey: 'settings', defaultRoles: ['super_admin', 'admin'] },
    { to: '/profile', label: 'profile', icon: UserCircleIcon, permissionKey: 'profile', defaultRoles: ['super_admin', 'admin', 'key_user', 'field_service_employee'] },
];

const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { t } = useLanguage();
  const { profile, permissions, permissionsLoaded } = useAuth();
  const sidebar = useRef<HTMLDivElement>(null);

  // Effect to handle closing the sidebar on click outside on mobile.
  useEffect(() => {
    if (!sidebarOpen) return;

    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !target || sidebar.current.contains(target as Node)) return;
      if (window.innerWidth < 1024) { // Only on mobile where it's an overlay
        setSidebarOpen(false);
      }
    };

    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (keyCode === 27 && window.innerWidth < 1024) { // ESC key on mobile
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [sidebarOpen, setSidebarOpen]);
  
  const visibleNavLinks = allNavLinks.filter(link => {
      if (!profile) return false;
      if (profile.role === 'super_admin') return true; // Super admin sees everything
      if (!permissionsLoaded) return false; // Wait until permissions are loaded to prevent flicker

      // Use database permissions if available, otherwise fallback to default roles
      if (permissions) {
          return permissions.includes(link.permissionKey);
      } else {
          return link.defaultRoles.includes(profile.role);
      }
  });


  return (
      <div
        ref={sidebar}
        className={`flex flex-col z-40 left-0 top-0 h-screen bg-slate-900 shrink-0 transition-all duration-300 ease-in-out
          absolute lg:static overflow-y-auto no-scrollbar
          ${ sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-0 lg:translate-x-0' }
        `}
      >
        <div className={`px-4 mb-2 transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:invisible'}`}>
            <NavLink to="/" className="flex items-center space-x-2 h-16">
                <CubeIcon className="w-8 h-8 text-white" />
                <span className="text-2xl font-bold text-white">ZOGU</span>
            </NavLink>
        </div>
        {/* Links */}
        <div className={`space-y-2 px-4 transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:invisible'}`}>
          {visibleNavLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                }`
              }
              end={link.to === '/'} // to match only the dashboard route exactly
            >
              <link.icon className="w-5 h-5 mr-3" />
              <span>{t(link.label as any)}</span>
            </NavLink>
          ))}
        </div>
      </div>
  );
};

export default Sidebar;