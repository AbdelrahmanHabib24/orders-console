import React from 'react';
import { PaginationMeta } from '../types/order';

interface OrdersPaginationProps {
  pagination: PaginationMeta;
  pageSize: number;
  loading: boolean;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
}

export const OrdersPagination: React.FC<OrdersPaginationProps> = ({
  pagination,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}) => {
  if (pagination.totalCount <= 0) {
    return null;
  }

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.totalCount);
  const totalPages = pagination.totalPages || 1;

  return (
    <nav
      aria-label="Pagination"
      className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500"
    >
      {/* Left: Range text */}
      <div>
        Showing <span className="font-semibold text-slate-700">{startRecord.toLocaleString()}</span> to{' '}
        <span className="font-semibold text-slate-700">{endRecord.toLocaleString()}</span> of{' '}
        <span className="font-semibold text-slate-700">
          {pagination.totalCount.toLocaleString()}
        </span>{' '}
        orders
      </div>

      {/* Right: Compact, aligned pagination controls */}
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-2.5">
        {/* Page Size Select */}
        <div className="flex items-center space-x-1.5 text-slate-400">
          <span>Show</span>
          <div className="relative">
            <select
              id="pagination-page-size"
              value={pageSize}
              aria-label="Items per page"
              disabled={loading}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="appearance-none border border-slate-200 rounded-lg pl-2.5 pr-6 py-1 text-xs text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#3b52f6] cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </div>

        {/* Previous Button */}
        <button
          type="button"
          disabled={pagination.page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          className="px-3 py-1 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          Previous
        </button>

        {/* Single Page Count Info: Page 1 of 2,500 */}
        <span className="text-xs text-slate-500 font-medium px-1">
          Page <span className="font-semibold text-slate-700">{pagination.page.toLocaleString()}</span> of{' '}
          <span className="font-semibold text-slate-700">{totalPages.toLocaleString()}</span>
        </span>

        {/* Next Button */}
        <button
          type="button"
          disabled={pagination.page >= totalPages || loading}
          onClick={() => onPageChange(pagination.page + 1)}
          className="px-3.5 py-1 rounded-lg bg-[#3b52f6] hover:bg-[#2563eb] text-white text-xs font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Next
        </button>
      </div>
    </nav>
  );
};
