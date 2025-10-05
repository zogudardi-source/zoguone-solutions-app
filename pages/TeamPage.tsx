import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Profile, UserInvitation, UserRole } from '../types';
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, KeyIcon } from '@heroicons/react/24/outline';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const TeamPage: React.FC = () => {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  
  // State for standard admin/key_user view
  const [members, setMembers] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  
  // State for super_admin view
  const [allUsers, setAllUsers] = useState<(Profile & { organization_name?: string })[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'full_name', direction: 'asc' });

  const [loading, setLoading] = useState(true);
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('field_service_employee');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    if (!profile) return;

    if (profile.role === 'super_admin') {
      const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('*');
      const { data: orgsData, error: orgsError } = await supabase.from('organizations').select('*');

      if (profilesError || orgsError) {
        console.error("Error fetching super admin data:", profilesError || orgsError);
        setLoading(false);
        return;
      }

      const orgsMap = new Map((orgsData || []).map(org => [org.id, org.name]));
      const combinedUsers = (profilesData || []).map(p => ({
        ...p,
        organization_name: p.org_id ? orgsMap.get(p.org_id) || 'N/A' : 'No Org'
      }));
      setAllUsers(combinedUsers);

    } else if (profile.org_id) {
      const { data: membersData } = await supabase.from('profiles').select('*').eq('org_id', profile.org_id);
      const { data: invitesData } = await supabase.from('user_invitations').select('*').eq('org_id', profile.org_id).eq('status', 'pending');
      setMembers(membersData || []);
      setInvitations(invitesData || []);
    }
    
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.org_id || !user?.id) return;
    setInviteLoading(true);
    setInviteError(null);

    const { data: existingUser } = await supabase.from('profiles').select('id').eq('email', inviteEmail).eq('org_id', profile.org_id).single();
    if (existingUser) {
        setInviteError('A user with this email already exists in your organization.');
        setInviteLoading(false);
        return;
    }
    
    const { data: existingInvite } = await supabase.from('user_invitations').select('id').eq('invited_user_email', inviteEmail).eq('org_id', profile.org_id).eq('status', 'pending').single();
    if (existingInvite) {
        setInviteError('An invitation for this email address is already pending.');
        setInviteLoading(false);
        return;
    }

    const { error } = await supabase.from('user_invitations').insert({
        org_id: profile.org_id,
        invited_by_user_id: user.id,
        invited_user_email: inviteEmail,
        role: inviteRole,
    });

    if (error) {
        setInviteError(error.message);
    } else {
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteRole('field_service_employee');
        fetchData();
    }
    setInviteLoading(false);
  };
  
  const handleRemoveMember = async (memberId: string) => {
      if (window.confirm('Are you sure you want to remove this member from your team? Their data will be preserved but they will lose access.')) {
        const { error } = await supabase.from('profiles').update({ org_id: null }).eq('id', memberId);
        if (error) alert('Error removing member: ' + error.message);
        else fetchData();
      }
  };
  
  const handleCancelInvite = async (inviteId: string) => {
      if (window.confirm('Are you sure you want to cancel this invitation?')) {
          const { error } = await supabase.from('user_invitations').delete().eq('id', inviteId);
          if (error) alert('Error cancelling invitation: ' + error.message);
          else fetchData();
      }
  };
  
  const handleResetPassword = async (userIdToReset: string) => {
      if(window.confirm('Are you sure you want to send a password reset email to this user?')) {
        try {
            const { data, error } = await supabase.functions.invoke('admin-reset-password', {
                body: { user_id_to_reset: userIdToReset },
            });
            if (error) throw error;
            alert(data.message || 'Password reset email sent successfully.');
        } catch (error: any) {
            alert('Failed to send password reset: ' + (error.message || 'Please check the logs. This feature requires a Supabase Edge Function to be deployed.'));
        }
      }
  };

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
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

  const sortedUsers = useMemo(() => {
    return [...allUsers].sort((a, b) => {
        const key = sortConfig.key as keyof (typeof allUsers)[0];
        const aValue = (a[key] as any) || '';
        const bValue = (b[key] as any) || '';
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [allUsers, sortConfig]);

  const InviteModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">{t('add_member')}</h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('email_address')}</label>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('role')}</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as UserRole)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
              <option value="key_user">{t('key_user')}</option>
              <option value="field_service_employee">{t('field_service_employee')}</option>
            </select>
          </div>
          {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={() => setIsInviteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">{t('cancel')}</button>
            <button type="submit" disabled={inviteLoading} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">{inviteLoading ? 'Sending...' : 'Send Invite'}</button>
          </div>
        </form>
      </div>
    </div>
  );
  
  const renderSuperAdminView = () => (
    <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="min-w-full">
                <thead>
                <tr>
                    <SortableHeader sortKey="full_name" label="User" />
                    <SortableHeader sortKey="organization_name" label="Organization" />
                    <SortableHeader sortKey="role" label="Role" />
                    <SortableHeader sortKey="current_plan" label="Plan" />
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                {sortedUsers.map(member => (
                    <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap text-sm">
                            <div className="font-medium text-gray-900 dark:text-white">{member.full_name || 'N/A'}</div>
                            <div className="text-gray-500 dark:text-gray-400">{member.email}</div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.organization_name}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">{t(member.role as any) || member.role}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">{member.current_plan}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button onClick={() => handleResetPassword(member.id)} title="Reset Password (Requires 'admin-reset-password' Supabase Edge Function to be deployed)" className="text-gray-500 hover:text-primary-600">
                                <KeyIcon className="w-5 h-5"/>
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderStandardView = () => (
     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">{t('current_members')}</h2>
          <ul className="space-y-3">
            {members.map(member => (
              <li key={member.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div>
                  <p className="font-medium">{member.full_name || member.email}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{t(member.role as any) || member.role}</p>
                </div>
                {profile?.id !== member.id && member.role !== 'admin' && (
                  <div className="flex items-center space-x-2">
                    {profile?.role === 'admin' && (
                        <button onClick={() => handleResetPassword(member.id)} title="Reset Password (Requires 'admin-reset-password' Supabase Edge Function to be deployed)" className="text-gray-400 hover:text-primary-600"><KeyIcon className="w-5 h-5"/></button>
                    )}
                    <button onClick={() => handleRemoveMember(member.id)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">{t('pending_members')}</h2>
          {invitations.length > 0 ? (
            <ul className="space-y-3">
                {invitations.map(invite => (
                <li key={invite.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div>
                    <p className="font-medium">{invite.invited_user_email}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{t(invite.role as any)}</p>
                    </div>
                    <button onClick={() => handleCancelInvite(invite.id)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No pending invitations.</p>
          )}
        </div>
      </div>
  );

  return (
    <>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('team_management')}</h1>
          {profile?.role !== 'super_admin' && (
            <button onClick={() => setIsInviteModalOpen(true)} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
                <PlusIcon className="w-5 h-5 mr-2" /> {t('add_member')}
            </button>
          )}
        </div>

        {loading ? <div className="text-center p-8">Loading team...</div> : (
          profile?.role === 'super_admin' ? renderSuperAdminView() : renderStandardView()
        )}
      </div>
      {isInviteModalOpen && <InviteModal />}
    </>
  );
};

export default TeamPage;