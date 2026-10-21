import React from 'react';
import { OrderItem } from '../types/order';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/orderFormatters';

export interface OrderDetailsModalProps {
  order: OrderItem | null;
  onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 id="order-details-title" className="text-base font-bold text-slate-900">
              Order #{order.orderNumber} Details
            </h3>
          </div>
        </div>

        <div className="space-y-3 text-xs overflow-y-auto pr-0.5 flex-1">
          <div className="flex justify-between py-1.5 border-b border-slate-50 gap-2">
            <span className="text-slate-500 font-medium shrink-0">Customer Name</span>
            <span className="font-semibold text-slate-900 text-right truncate">{order.customerName}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-50 gap-2">
            <span className="text-slate-500 font-medium shrink-0">Customer Email</span>
            <span className="font-mono text-slate-700 text-right break-all">{order.customerEmail}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-50 items-center">
            <span className="text-slate-500 font-medium">Order Status</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Total Amount</span>
            <span className="font-bold text-slate-900 text-sm font-mono">{formatCurrency(order.amount)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500 font-medium">Creation Date</span>
            <span className="text-slate-600">{formatDate(order.createdAt)}</span>
          </div>
        </div>

        <div className="pt-2 flex justify-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl w-full bg-slate-100 hover:bg-red-500 hover:text-white text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
