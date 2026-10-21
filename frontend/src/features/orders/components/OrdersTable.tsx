import React, { useState, useEffect, useRef } from 'react';
import { OrderItem } from '../types/order';
import { UserRole } from '../../auth/types/auth';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/orderFormatters';
import { OrderDetailsModal } from './OrderDetailsModal';

interface OrdersTableProps {
  orders: OrderItem[];
  loading: boolean;
  hasActiveFilters: boolean;
  userRole?: UserRole;
  onClearFilters: () => void;
  onOrderDeleted?: () => void;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  loading,
  hasActiveFilters,
  userRole,
  onClearFilters,
  onOrderDeleted,
}) => {
  const [activeMenuOrderId, setActiveMenuOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Close open action menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setActiveMenuOrderId(null);
      }
    };
    if (activeMenuOrderId) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeMenuOrderId]);

  // Handle order deletion (Admin only)
  const handleDeleteOrder = async (order: OrderItem) => {
    setActiveMenuOrderId(null);
    const confirmed = window.confirm(
      `Are you sure you want to delete Order #${order.orderNumber} for ${order.customerName}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}: Failed to delete order`);
      }

      onOrderDeleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete order';
      alert(`Deletion failed: ${msg}`);
    } finally {
      setDeletingOrderId(null);
    }
  };

  if (orders.length === 0) {
    if (loading) {
      // Stable height placeholder during initial load so the loading overlay remains visually balanced
      return <div className="h-64" />;
    }
    return (
      <div className="p-16 text-center text-slate-500 space-y-3">
        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
          ∅
        </div>
        <p className="text-sm font-semibold text-slate-800">No matching orders found</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          No orders match your current search criteria. Try modifying your search term or status filter.
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 inline-flex items-center px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
          >
            Clear All Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[680px] w-full divide-y divide-slate-100 text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
               # Order 
            </th>
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Customer
            </th>
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Email
            </th>
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Status
            </th>
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Amount
            </th>
            <th scope="col" className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Date
            </th>
            <th scope="col" className="px-4 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50/80 bg-white">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
              <td className="px-4 py-3.5 font-mono font-medium text-[#3b82f6] whitespace-nowrap">
                #{order.orderNumber}
              </td>
              <td className="px-4 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                {order.customerName}
              </td>
              <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                {order.customerEmail}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <StatusBadge status={order.status} />
              </td>
              <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                {formatCurrency(order.amount)}
              </td>
              <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                {formatDate(order.createdAt)}
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap relative">
                <div
                  className="inline-block text-left"
                  ref={activeMenuOrderId === order.id ? menuContainerRef : null}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuOrderId(activeMenuOrderId === order.id ? null : order.id)
                    }
                    aria-expanded={activeMenuOrderId === order.id}
                    aria-haspopup="true"
                    aria-label={`Actions for order #${order.orderNumber}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200/60 transition-all shadow-xs"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                  </button>

                  {/* Compact accessible Action Menu */}
                  {activeMenuOrderId === order.id && (
                    <div
                      role="menu"
                      aria-orientation="vertical"
                      className="absolute right-4 mt-1 w-36 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30 animate-in fade-in zoom-in-95"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSelectedOrder(order);
                          setActiveMenuOrderId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        <span>View details</span>
                      </button>

                      {userRole === 'ADMIN' && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={deletingOrderId === order.id}
                          onClick={() => handleDeleteOrder(order)}
                          className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium transition-colors border-t border-slate-100 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          <span>{deletingOrderId === order.id ? 'Deleting...' : 'Delete order'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Accessible View Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
};
