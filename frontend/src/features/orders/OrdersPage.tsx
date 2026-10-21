import React, { useState, useEffect } from "react";
import { UserRole } from "../auth/types/auth";
import { OrderSortBy, OrderSortOrder } from "./types/order";
import { useOrders } from "./hooks/useOrders";
import { OrdersToolbar } from "./components/OrdersToolbar";
import { OrdersTable } from "./components/OrdersTable";
import { OrdersPagination } from "./components/OrdersPagination";
import { CreateOrderModal } from "./components/CreateOrderModal";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";

export interface OrdersPageProps {
  userRole?: UserRole;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ userRole }) => {
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<OrderSortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<OrderSortOrder>("desc");
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);

  const { orders, pagination, loading, error, fetchOrders } = useOrders();

  useEffect(() => {
    fetchOrders(page, pageSize, searchTerm, statusFilter, sortBy, sortOrder);
  }, [
    page,
    pageSize,
    searchTerm,
    statusFilter,
    sortBy,
    sortOrder,
    fetchOrders,
  ]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleSortChange = (
    newSortBy: OrderSortBy,
    newSortOrder: OrderSortOrder,
  ) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleReset = () => {
    setSearchTerm("");
    setStatusFilter("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const handleRetry = () => {
    fetchOrders(page, pageSize, searchTerm, statusFilter, sortBy, sortOrder);
  };

  const handleOrderCreated = () => {
    setPage(1);
    fetchOrders(1, pageSize, searchTerm, statusFilter, sortBy, sortOrder);
  };

  const hasActiveFilters = Boolean(searchTerm.trim() || statusFilter);

  return (
    <section
      aria-labelledby="orders-heading"
      aria-busy={loading}
      className="relative bg-white rounded-2xl border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.03)] p-4 sm:p-6 md:p-7 space-y-5"
    >
      {loading && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-white/75 pointer-events-none"
          role="status"
          aria-label="Loading orders"
        >
          <LoadingSpinner />
        </div>
      )}
      {/* Card Header with Create Order button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#f0f5ff] border border-[#dbeafe] flex items-center justify-center text-[#3b82f6] shadow-sm">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="orders-heading"
                className="text-lg font-bold text-slate-900 leading-tight"
              >
                Orders
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#eff6ff] text-[#3b82f6] border border-[#dbeafe]/70">
                {pagination.totalCount.toLocaleString()} total
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-normal">
              Manage and search customer orders
            </p>
          </div>
        </div>

        {/* Create Order Button */}
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3b52f6] hover:bg-[#2563eb] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span>Create Order</span>
        </button>
      </div>

      {/* Orders List Workspace: relative container wrapping filters, table, and pagination */}
        {/* Filter and Search Toolbar */}
        <OrdersToolbar
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onSortChange={handleSortChange}
          onReset={handleReset}
        />

        {/* Error Banner with Retry Action */}
        {error && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <span className="font-bold text-rose-600">!</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors shadow-sm cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Orders Table with Real Actions and User Role */}
        <OrdersTable
          orders={orders}
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          userRole={userRole}
          onClearFilters={handleReset}
          onOrderDeleted={handleRetry}
        />

        {/* Pagination Controls */}
        <OrdersPagination
          pagination={pagination}
          pageSize={pageSize}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />

      {/* Create Order Modal */}
      <CreateOrderModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onOrderCreated={handleOrderCreated}
      />
    </section>
  );
};
