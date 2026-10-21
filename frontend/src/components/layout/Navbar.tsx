import React, { useState, useRef } from 'react';
import { User } from '../../features/auth/types/auth';

export interface NavbarProps {
  user: User;
  onLogout: () => Promise<void>;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);



  const handleSignOut = async () => {
    setIsLoggingOut(true);
    setIsOpen(false);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const userInitial = user.email.charAt(0).toUpperCase() || 'U';
 

  return (
    <header className="bg-transparent py-3 px-3.5 sm:px-8 border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Left Brand Identity */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
              SARH Orders Console
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Order Management System</p>
          </div>
        </div>

        {/* Right User Account Dropdown (Inlined inside Navbar) */}
        <div className="relative" ref={menuRef}>
          {/* Trigger: Avatar with Dropdown Arrow */}
          <button
            ref={triggerRef}
            type="button"
            id="user-menu-trigger"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${user.email} (${user.role})`}
            className="flex items-center gap-1.5 p-1 pr-2  transition-all cursor-pointer select-none group"
          >
            {/* Circular Avatar */}
            <div className="w-8 h-8 rounded-full bg-[#3b52f6] group-hover:bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold transition-colors shrink-0">
              {userInitial}
            </div>

            {/* Dropdown Chevron Arrow */}
            <svg
              className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-150 shrink-0 ${
                isOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div
              role="menu"
              aria-labelledby="user-menu-trigger"
              aria-orientation="vertical"
              className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-slate-200/90 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95"
            >
              {/* User Identity Details inside dropdown */}
              <div className="p-2.5 flex items-center gap-3 bg-slate-50/70 rounded-xl border border-slate-100">
                <div className="w-8 h-8 rounded-full bg-[#3b52f6] text-white flex items-center justify-center text-xs font-bold shadow-xs shrink-0">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-800 truncate" title={user.email}>
                    {user.email}
                  </div>
                  <div className="mt-1 flex items-center">
                    <span
                      className={
                         'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-[#e0f2fe]/60 text-[#0284c7] border border-[#bae6fd]/80'
                      }
                    >
                      {user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Subtle Divider */}
              <div className="my-1.5 border-t border-slate-100" />

              {/* Sign Out Action Button */}
              <button
                type="button"
                role="menuitem"
                disabled={isLoggingOut}
                onClick={handleSignOut}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:bg-rose-50 focus:text-rose-700 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4 text-rose-500 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
