import React from 'react';
import { User } from './types/auth';
import { LoginForm } from './components/LoginForm';

export interface AuthPageProps {
  onLoginSuccess: (user: User) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eff6ff] via-[#f8fafc] to-[#e0e7ff] p-3.5 sm:p-6">
      <LoginForm onLoginSuccess={onLoginSuccess} />
    </div>
  );
};

export default AuthPage;
