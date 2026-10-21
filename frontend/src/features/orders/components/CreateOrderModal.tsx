import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/orderFormatters';
import { validateCreateOrderForm, FieldValidationErrors } from '../schemas/orderValidation';

interface LineItemInput {
  id: string;
  productName: string;
  quantity: number | string;
  unitPrice: number | string;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  onOrderCreated,
}) => {
  const [customerName, setCustomerName] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [items, setItems] = useState<LineItemInput[]>([
    { id: 'item-1', productName: '', quantity: 1, unitPrice: '' },
  ]);
  const [fieldErrors, setFieldErrors] = useState<FieldValidationErrors>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const customerNameInputRef = useRef<HTMLInputElement>(null);

  // Client-side idempotency key management
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastPayloadHashRef = useRef<string | null>(null);

  // Set initial focus on customer name input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        customerNameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);



  if (!isOpen) return null;

  // Calculate total amount in cents to prevent floating point inaccuracies
  const totalCents = items.reduce((sum, item) => {
    const priceNum =
      typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(String(item.unitPrice));
    const qtyNum =
      typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10);
    if (isNaN(priceNum) || priceNum <= 0 || isNaN(qtyNum) || qtyNum < 1) {
      return sum;
    }
    return sum + Math.round(priceNum * 100) * qtyNum;
  }, 0);
  const totalAmount = totalCents / 100;

  const handleAddItem = () => {
    if (items.length >= 10) return;
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}-${prev.length + 1}`, productName: '', quantity: 1, unitPrice: '' },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
    setFieldErrors({});
  };

  const handleItemChange = (
    id: string,
    field: 'productName' | 'quantity' | 'unitPrice',
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (field === 'quantity') {
            if (value === '') return { ...item, quantity: '' };
            const parsed = parseInt(value, 10);
            return {
              ...item,
              quantity: isNaN(parsed) ? '' : Math.max(1, Math.min(1000, parsed)),
            };
          }
          if (field === 'unitPrice') {
            return { ...item, unitPrice: value };
          }
          return { ...item, [field]: value };
        }
        return item;
      })
    );
    // Clear item errors when editing
    setFieldErrors((prev) => ({ ...prev, general: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Zod Schema Validation
    const validation = validateCreateOrderForm({
      customerName,
      customerEmail,
      items,
      amount: totalAmount,
    });

    if (!validation.isValid) {
      setError(validation.errors.general || 'Please check the highlighted form errors');
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    const validatedData = validation.validatedData!;

    // Build payload from strictly validated data
    const payload = {
      customerName: validatedData.customerName,
      customerEmail: validatedData.customerEmail,
      amount: validatedData.amount,
      items: validatedData.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice.toFixed(2)),
      })),
    };

    // Idempotency key reuse logic for retries
    const payloadSignature = JSON.stringify(payload);
    if (!idempotencyKeyRef.current || lastPayloadHashRef.current !== payloadSignature) {
      // New logical submission or payload changed: generate fresh UUID
      idempotencyKeyRef.current = crypto.randomUUID();
      lastPayloadHashRef.current = payloadSignature;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}: Failed to create order`);
      }

      // Success: reset idempotency key so next order uses a fresh key
      idempotencyKeyRef.current = null;
      lastPayloadHashRef.current = null;

      const isReplay = res.status === 200;
      setSuccessMessage(
        isReplay
          ? `Order #${data.order?.orderNumber} already processed (idempotent replay)`
          : `Order #${data.order?.orderNumber} created successfully!`
      );

      onOrderCreated();

      setTimeout(() => {
        onClose();
        // Reset form
        setCustomerName('');
        setCustomerEmail('');
        setItems([{ id: 'item-1', productName: '', quantity: 1, unitPrice: '' }]);
        setFieldErrors({});
        setSuccessMessage(null);
        setError(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Order creation failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-order-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full p-4 sm:p-7 space-y-4 sm:space-y-5 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3 sm:pb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 id="create-order-heading" className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Create New Order
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Enter customer and order details
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto space-y-4 pr-0.5 flex-1">
          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Success Alert */}
          {successMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {/* Customer Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            <div>
              <label htmlFor="customer-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Name
              </label>
              <input
                ref={customerNameInputRef}
                id="customer-name"
                type="text"
                required
                disabled={loading}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, customerName: undefined, general: undefined }));
                }}
                placeholder="e.g. Sara Al-Hassan"
                className={`w-full px-3 py-2 rounded-xl border text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50 transition-all ${
                  fieldErrors.customerName
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                    : 'border-slate-200 focus:border-[#3b52f6] focus:ring-blue-500/20'
                }`}
              />
              {fieldErrors.customerName && (
                <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.customerName}</p>
              )}
            </div>

            <div>
              <label htmlFor="customer-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Email
              </label>
              <input
                id="customer-email"
                type="email"
                required
                disabled={loading}
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, customerEmail: undefined, general: undefined }));
                }}
                placeholder="sara.alhassan@sarh.com"
                className={`w-full px-3 py-2 rounded-xl border text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50 transition-all ${
                  fieldErrors.customerEmail
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                    : 'border-slate-200 focus:border-[#3b52f6] focus:ring-blue-500/20'
                }`}
              />
              {fieldErrors.customerEmail && (
                <p className="text-[11px] text-rose-600 mt-1">{fieldErrors.customerEmail}</p>
              )}
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-2.5 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Order Items
                </span>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {items.length}/10
                </span>
              </div>
              {items.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={loading}
                  className="text-xs font-semibold text-[#3b52f6] hover:text-[#2563eb] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add item</span>
                </button>
              )}
            </div>

            {/* Desktop Table Header (hidden on mobile) */}
            <div className="hidden sm:flex items-center gap-2.5 px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <div className="flex-1">Product name</div>
              <div className="w-20 text-center">Quantity</div>
              <div className="w-28 text-right pr-2">Unit price</div>
              {items.length > 1 && <div className="w-7 text-center"><span className="sr-only">Actions</span></div>}
            </div>

            {/* Responsive Items Rows */}
            <div className="space-y-2.5 max-h-56 sm:max-h-60 overflow-y-auto pr-0.5">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 p-2.5 sm:p-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs transition-colors hover:border-slate-300"
                >
                  {/* Product name: full width on mobile, flex-1 on desktop */}
                  <div className="flex-1 w-full min-w-0">
                    <label htmlFor={`item-name-${item.id}`} className="sm:sr-only block text-[11px] font-semibold text-slate-600 mb-1 sm:mb-0">
                      Product name
                    </label>
                    <input
                      id={`item-name-${item.id}`}
                      type="text"
                      required
                      disabled={loading}
                      placeholder="e.g. Wireless Mouse"
                      value={item.productName}
                      onChange={(e) => handleItemChange(item.id, 'productName', e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                        fieldErrors.items?.[idx]?.productName
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                          : 'border-slate-200 focus:border-[#3b52f6] focus:ring-blue-500/20'
                      }`}
                    />
                  </div>

                  {/* Quantity, Price, and Delete controls grouped */}
                  <div className="flex items-end sm:items-center gap-2 w-full sm:w-auto">
                    {/* Quantity */}
                    <div className="w-20 sm:w-20 shrink-0">
                      <label htmlFor={`item-qty-${item.id}`} className="sm:sr-only block text-[11px] font-semibold text-slate-600 mb-1 sm:mb-0">
                        Quantity
                      </label>
                      <input
                        id={`item-qty-${item.id}`}
                        type="number"
                        min={1}
                        max={1000}
                        required
                        disabled={loading}
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-lg border bg-white text-xs text-slate-800 text-center focus:outline-none focus:ring-2 disabled:opacity-50 ${
                          fieldErrors.items?.[idx]?.quantity
                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                            : 'border-slate-200 focus:border-[#3b52f6] focus:ring-blue-500/20'
                        }`}
                      />
                    </div>

                    {/* Unit price: empty initially, placeholder 20.00 */}
                    <div className="flex-1 sm:w-28 relative">
                      <label htmlFor={`item-price-${item.id}`} className="sm:sr-only block text-[11px] font-semibold text-slate-600 mb-1 sm:mb-0">
                        Unit price
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">$</span>
                        <input
                          id={`item-price-${item.id}`}
                          type="number"
                          step="0.01"
                          min={0.01}
                          required
                          disabled={loading}
                          placeholder="20.00"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                          className={`w-full pl-6 pr-2.5 py-1.5 rounded-lg border bg-white text-xs text-slate-800 text-right focus:outline-none focus:ring-2 disabled:opacity-50 ${
                            fieldErrors.items?.[idx]?.unitPrice
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                              : 'border-slate-200 focus:border-[#3b52f6] focus:ring-blue-500/20'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Delete Action: only rendered when items.length > 1 */}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={loading}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                        title={`Remove item ${idx + 1}`}
                        aria-label={`Remove item ${idx + 1}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total Bar */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs shrink-0">
            <span className="font-semibold text-slate-700">Total</span>
            <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between gap-2.5 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl  border border-slate-200 text-xs bg-slate-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || totalAmount <= 0}
              className="px-5 py-2 rounded-xl bg-[#3b52f6] hover:bg-[#2563eb] text-white text-xs font-semibold shadow-xs shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Create Order</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
