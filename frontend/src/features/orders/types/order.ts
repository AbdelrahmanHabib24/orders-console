export type OrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  orderNumber: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  amount: string | number;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export type OrderSortBy = 'createdAt' | 'amount';
export type OrderSortOrder = 'asc' | 'desc';

export interface OrderFilters {
  page: number;
  pageSize: number;
  searchTerm: string;
  statusFilter: string;
  sortBy: OrderSortBy;
  sortOrder: OrderSortOrder;
}
