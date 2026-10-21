import { useState, useCallback, useRef } from 'react';
import { OrderItem, PaginationMeta, OrderSortBy, OrderSortOrder } from '../types/order';

export interface UseOrdersReturn {
  orders: OrderItem[];
  pagination: PaginationMeta;
  loading: boolean;
  error: string | null;
  fetchOrders: (
    targetPage: number,
    targetLimit: number,
    search: string,
    status: string,
    sort: OrderSortBy,
    order: OrderSortOrder
  ) => Promise<void>;
  resetOrders: () => void;
}

export function useOrders(): UseOrdersReturn {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Rapid-filter race condition protection sequence counter
  const requestSeq = useRef<number>(0);

  const fetchOrders = useCallback(
    async (
      targetPage: number,
      targetLimit: number,
      search: string,
      status: string,
      sort: OrderSortBy,
      order: OrderSortOrder
    ) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(targetLimit));
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (status) {
        params.set('status', status);
      }
      params.set('sortBy', sort);
      params.set('sortOrder', order);

      try {
        const res = await fetch(`/api/orders?${params.toString()}`, {
          credentials: 'include',
        });

        if (seq !== requestSeq.current) {
          // Stale response from earlier query: discard silently
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `HTTP ${res.status}: Failed to load orders`);
        }

        const data = await res.json();

        if (seq === requestSeq.current) {
          setOrders(data.orders || []);
          setPagination(
            data.pagination || {
              page: targetPage,
              limit: targetLimit,
              totalCount: 0,
              totalPages: 0,
            }
          );
          setLoading(false);
        }
      } catch (err: unknown) {
        if (seq === requestSeq.current) {
          setOrders([]);
          const msg =
            err instanceof Error ? err.message : 'An error occurred while loading orders';
          setError(msg);
          setLoading(false);
        }
      }
    },
    []
  );

  const resetOrders = useCallback(() => {
    // Invalidate any in-flight requests
    requestSeq.current++;
    setOrders([]);
    setPagination({ page: 1, limit: 20, totalCount: 0, totalPages: 0 });
    setLoading(false);
    setError(null);
  }, []);

  return {
    orders,
    pagination,
    loading,
    error,
    fetchOrders,
    resetOrders,
  };
}
