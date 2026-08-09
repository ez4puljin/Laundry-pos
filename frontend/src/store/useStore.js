import { create } from 'zustand'

// Cart item structure: { key, itemType: 'service'|'product', item, quantity, notes }
// key = `${itemType}_${item.id}`  (prevents service_1 and product_1 collision)

const useStore = create((set, get) => ({
  // ── Cart ─────────────────────────────────────────────
  cart: [],
  customer: null,
  orderPhone: '',           // харилцагчгүй үед SMS явуулах дугаар
  discount: { type: null, value: 0 },
  couponCode: '',
  pointsToUse: 0,
  paymentMethod: 'cash',    // 'cash' | 'transfer' | 'card' | 'mixed'
  mixedAmounts: { cash: '', transfer: '', card: '' },

  addToCart: (item, itemType = 'service') => {
    const cart = get().cart
    const key  = `${itemType}_${item.id}`
    const idx  = cart.findIndex(i => i.key === key)
    if (idx >= 0) {
      const updated = [...cart]
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 }
      set({ cart: updated })
    } else {
      set({ cart: [...cart, { key, itemType, item, quantity: 1, notes: '' }] })
    }
  },

  updateQuantity: (key, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(key)
      return
    }
    set({ cart: get().cart.map(i => i.key === key ? { ...i, quantity } : i) })
  },

  updateItemNote: (key, notes) => {
    set({ cart: get().cart.map(i => i.key === key ? { ...i, notes } : i) })
  },

  removeFromCart: (key) => {
    set({ cart: get().cart.filter(i => i.key !== key) })
  },

  clearCart: () => set({
    cart: [],
    customer: null,
    orderPhone: '',
    discount: { type: null, value: 0 },
    couponCode: '',
    pointsToUse: 0,
    paymentMethod: 'cash',
    mixedAmounts: { cash: '', transfer: '', card: '' },
  }),

  setCustomer:      (c) => set({ customer: c, orderPhone: '' }),
  setOrderPhone:    (v) => set({ orderPhone: v }),
  setDiscount:      (d) => set({ discount: d }),
  setCouponCode:    (v) => set({ couponCode: v }),
  setPointsToUse:   (v) => set({ pointsToUse: v }),
  setPaymentMethod: (v) => set({ paymentMethod: v }),
  setMixedAmounts:  (v) => set({ mixedAmounts: v }),

  // ── Computed values ────────────────────────────────────
  // Price helper: service uses .price, product uses .sale_price
  getItemPrice: (cartItem) =>
    cartItem.itemType === 'service' ? cartItem.item.price : cartItem.item.sale_price,

  getSubtotal: () => {
    return get().cart.reduce((sum, i) => {
      const price = i.itemType === 'service' ? i.item.price : i.item.sale_price
      return sum + price * i.quantity
    }, 0)
  },

  getDiscountAmount: () => {
    const { discount, getSubtotal } = get()
    const sub = getSubtotal()
    if (!discount.type || !discount.value) return 0
    if (discount.type === 'percent') return Math.round(sub * discount.value / 100)
    return Math.min(discount.value, sub)
  },

  getTotal: () => {
    const sub  = get().getSubtotal()
    const disc = get().getDiscountAmount()
    const pts  = get().pointsToUse
    return Math.max(0, sub - disc - pts)
  },

  getItemCount: () => get().cart.reduce((s, i) => s + i.quantity, 0),

  // ── UI State ───────────────────────────────────────────
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  showQRModal:  false,
  qrType:       'card',   // 'card' | 'social_pay'
  setShowQRModal: (v, type = 'card') => set({ showQRModal: v, qrType: type }),

  showReceiptModal: false,
  lastOrder: null,
  setLastOrder: (o) => set({ lastOrder: o, showReceiptModal: true }),
  closeReceipt: ()  => set({ showReceiptModal: false }),
}))

export default useStore
