import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { CubeIcon } from '@heroicons/react/24/solid';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

// Define components outside the main AuthPage component to prevent re-creation on re-render.

interface AuthFormProps {
  handleAuthAction: (e: React.FormEvent) => void;
  isLoginView: boolean;
  loading: boolean;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  fullName: string;
  setFullName: (name: string) => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  t: (key: any) => string;
  setForgotPasswordView: (value: boolean) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({
  handleAuthAction, isLoginView, loading, email, setEmail, password, setPassword,
  fullName, setFullName, companyName, setCompanyName, t, setForgotPasswordView
}) => (
  <form onSubmit={handleAuthAction} className="space-y-6">
    {!isLoginView && (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('full_name')}</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('company_name')}</label>
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
        </div>
      </>
    )}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
    </div>
    <div>
      <div className="flex justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
        {isLoginView && <button type="button" onClick={() => setForgotPasswordView(true)} className="text-sm text-primary-600 hover:underline">{t('forgotPassword')}</button>}
      </div>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
    </div>
    <div>
      <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300">
        {loading ? 'Processing...' : (isLoginView ? 'Login' : 'Sign Up')}
      </button>
    </div>
  </form>
);

interface ForgotPasswordFormProps {
    handlePasswordReset: (e: React.FormEvent) => void;
    loading: boolean;
    email: string;
    setEmail: (email: string) => void;
    t: (key: any) => string;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ handlePasswordReset, loading, email, setEmail, t }) => (
  <form onSubmit={handlePasswordReset} className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('forgotPasswordInstructions')}</p>
      <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 mt-1 text-gray-900 bg-gray-100 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
      </div>
      <div>
          <button type="submit" disabled={loading} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300">
          {loading ? 'Sending...' : t('requestReset')}
          </button>
      </div>
  </form>
);


const AuthPage: React.FC = () => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [forgotPasswordView, setForgotPasswordView] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  if (session) {
    return null; // Render nothing while the navigation effect is running
  }

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isLoginView) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else navigate('/');
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
            // The trigger on auth.users will handle role and org_id for a new signup
          },
        },
      });
      if (error) setError(error.message);
      else setMessage('Registration successful! Please check your email to verify your account.');
    }
    setLoading(false);
  };
  
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/#/reset-password',
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Password reset instructions have been sent to your email.');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 mx-4 space-y-6 bg-white rounded-lg shadow-2xl dark:bg-gray-800">
        <div className="text-center">
          <CubeIcon className="w-12 h-12 mx-auto text-primary-500" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            {forgotPasswordView ? t('forgotPasswordTitle') : (isLoginView ? 'Welcome Back' : 'Create an Account')}
          </h1>
        </div>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}
        {message && <p className="text-sm text-center text-green-500">{message}</p>}

        {forgotPasswordView 
            ? <ForgotPasswordForm 
                handlePasswordReset={handlePasswordReset}
                loading={loading}
                email={email}
                setEmail={setEmail}
                t={t}
              /> 
            : <AuthForm 
                handleAuthAction={handleAuthAction}
                isLoginView={isLoginView}
                loading={loading}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                fullName={fullName}
                setFullName={setFullName}
                companyName={companyName}
                setCompanyName={setCompanyName}
                t={t}
                setForgotPasswordView={setForgotPasswordView}
              />
        }

        <div className="text-sm text-center">
          {forgotPasswordView ? (
             <button onClick={() => setForgotPasswordView(false)} className="font-medium text-primary-600 hover:underline">{t('backToLogin')}</button>
          ) : (
            <button onClick={() => { setIsLoginView(!isLoginView); setError(null); }} className="font-medium text-primary-600 hover:underline">
              {isLoginView ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;