import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { UserRole, Organization } from '../types';
import { defaultPermissions } from '../constants';
import { saveRolePermissions } from '../lib/permissions';

const ALL_MODULES = [
    { id: 'dashboard', label: 'dashboard' },
    { id: 'dispatcher', label: 'dispatcher' },
    { id: 'customers', label: 'customers' },
    { id: 'appointments', label: 'appointments' },
    { id: 'visits', label: 'visits' },
    { id: 'quotes', label: 'quotes' },
    { id: 'invoices', label: 'invoices' },
    { id: 'inventory', label: 'inventory' },
    { id: 'expenses', label: 'expenses' },
    { id: 'tasks', label: 'tasks' },
    { id: 'reports', label: 'reports' },
    { id: 'team', label: 'team' },
    { id: 'settings', label: 'settings' },
    { id: 'profile', label: 'profile' },
];

const SettingsPage: React.FC = () => {
    const { profile, permissions: currentUserPermissions } = useAuth();
    const { t } = useLanguage();

    const [organizations, setOrganizations] = useState<Pick<Organization, 'id' | 'name'>[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const configurableRoles = useMemo<UserRole[]>(() => {
        if (profile?.role === 'super_admin') return ['admin', 'key_user', 'field_service_employee'];
        if (profile?.role === 'admin') return ['key_user', 'field_service_employee'];
        return [];
    }, [profile?.role]);

    const [permissions, setPermissions] = useState<Record<UserRole, string[]>>({
        admin: [], key_user: [], field_service_employee: [], super_admin: [],
    });

    // Effect 1: Fetch organizations if user is a super_admin
    useEffect(() => {
        if (profile?.role === 'super_admin') {
            setIsLoading(true);
            supabase.from('organizations').select('id, name').order('name').then(({ data }) => {
                setOrganizations(data || []);
                setIsLoading(false); // Stop loading, wait for user selection
            });
        }
    }, [profile]);

    // Effect 2: Main data fetching logic.
    // This runs when the profile is loaded or a super_admin selects an org.
    useEffect(() => {
        const fetchRolePermissions = async () => {
            const targetOrgId = profile?.role === 'admin' ? profile.org_id : selectedOrgId;

            if (!targetOrgId || configurableRoles.length === 0) {
                // Not ready to fetch yet, ensure we show a loading state if applicable.
                setIsLoading(!!(profile && profile.role !== 'super_admin'));
                return;
            }

            setIsLoading(true);
            try {
                const { data: dbData, error } = await supabase
                    .from('role_permissions')
                    .select('role, permissions')
                    .eq('org_id', targetOrgId)
                    .in('role', configurableRoles);

                if (error) throw error;

                const dbPermissionsMap = new Map((dbData || []).map(item => {
                    const modules = item.permissions?.modules;
                    return [item.role as UserRole, Array.isArray(modules) ? modules : []];
                }));
                
                const newPermissionsState: Partial<Record<UserRole, string[]>> = {};
                for (const role of configurableRoles) {
                    // FIX: Explicitly check if permissions from DB are an array to prevent errors with malformed data.
                    // The previous `??` operator could allow an empty object `{}`, causing a type error.
                    const dbPerms = dbPermissionsMap.get(role);
                    newPermissionsState[role] = Array.isArray(dbPerms) ? dbPerms : [...defaultPermissions[role]];
                }

                setPermissions(prevState => ({ ...prevState, ...newPermissionsState }));
            } catch (error) {
                console.error("Failed to fetch permissions:", error);
                alert("Failed to load settings. Please try again.");
            } finally {
                setIsLoading(false);
            }
        };
        
        // We trigger the fetch only when the profile is available.
        // This guarantees the user is authenticated and RLS policies will pass.
        if (profile) {
            fetchRolePermissions();
        }
    }, [profile, selectedOrgId, configurableRoles]);
    
    const handlePermissionChange = (role: UserRole, moduleId: string, isChecked: boolean) => {
        setPermissions(prev => {
            const currentModules = prev[role] || [];
            const newModules = isChecked 
                ? [...currentModules, moduleId]
                : currentModules.filter(m => m !== moduleId);
            return { ...prev, [role]: [...new Set(newModules)] };
        });
    };
    
    const handleSave = async () => {
        const targetOrgId = profile?.role === 'admin' ? profile.org_id : selectedOrgId;
        if (!targetOrgId || configurableRoles.length === 0) return;
        setIsSaving(true);
        try {
            await saveRolePermissions(targetOrgId, permissions, configurableRoles);
            alert('Permissions saved successfully!');
        } catch (error: any) {
            alert('Error saving permissions: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const modulesForRole = useMemo(() => {
        if (profile?.role === 'admin') {
            return ALL_MODULES.filter(m => (currentUserPermissions || defaultPermissions.admin).includes(m.id));
        }
        return ALL_MODULES;
    }, [profile?.role, currentUserPermissions]);
    
    const handleOrgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedOrgId(e.target.value || null);
    };

    const renderContent = () => {
        if (profile?.role === 'super_admin' && !selectedOrgId) {
            return (
                <div className="text-center text-gray-500 py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Organization Selected</h3>
                    <p className="mt-1 text-sm text-gray-500">Please select an organization to begin.</p>
                </div>
            );
        }

        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-64">
                    <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-primary-600"></div>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {configurableRoles.map(role => (
                    <div key={role} className="border rounded-lg p-4 dark:border-gray-700">
                        <h3 className="font-bold text-lg capitalize mb-4 text-gray-800 dark:text-gray-200">{t(role as any) || role}</h3>
                        <div className="space-y-3">
                            {modulesForRole.map(module => (
                                <div key={module.id} className="flex items-center justify-between">
                                    <label htmlFor={`${role}-${module.id}`} className="text-gray-700 dark:text-gray-300 capitalize cursor-pointer">{t(module.label as any)}</label>
                                    <input 
                                        id={`${role}-${module.id}`}
                                        type="checkbox" 
                                        checked={permissions[role]?.includes(module.id) || false} 
                                        onChange={(e) => handlePermissionChange(role, module.id, e.target.checked)} 
                                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('settings')}</h1>
                <button
                    onClick={handleSave}
                    disabled={isSaving || isLoading || (profile?.role === 'super_admin' && !selectedOrgId)}
                    className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : t('save')}
                </button>
            </div>
            
            {profile?.role === 'super_admin' && (
                <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
                    <label htmlFor="org-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Organization to Configure</label>
                    <select id="org-select" value={selectedOrgId || ''} onChange={handleOrgChange} disabled={isLoading} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
                        <option value="">-- Select an Organization --</option>
                        {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                    </select>
                </div>
            )}
            
            <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 min-h-[20rem]">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('access_control')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Configure which application modules are visible to each user role.</p>
                
                {renderContent()}
            </div>
        </div>
    );
};

export default SettingsPage;