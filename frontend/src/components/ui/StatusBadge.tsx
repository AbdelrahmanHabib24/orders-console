import React from 'react';
import { OrderStatus } from '../../features/orders/types/order';

interface StatusBadgeProps {
  status: OrderStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#ecfdf5] text-[#10b981] border border-[#a7f3d0]">
          Completed
        </span>
      );
    case 'PROCESSING':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#eff6ff] text-[#3b82f6] border border-[#bfdbfe]">
          Processing
        </span>
      );
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#fffbeb] text-[#f59e0b] border border-[#fde68a]">
          Pending
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]">
          Cancelled
        </span>
      );
    default:
      return <span>{status}</span>;
  }
};
