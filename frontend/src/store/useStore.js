import { create } from 'zustand'

// Cart item structure: { key, itemType: 'service'|'product'|'room'|'ticket', item, quantity, notes }
// key = `${itemType}_${item.id}`  (prevents service_1 and product_1 collision)
// 'room'   = тодорхой шүршүүрийн өрөө (тоо ширхэг үргэлж 1)
// 'ticket' = дарааллын тасалбар (item нь өрөөний төрөл)

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
      if (itemType === 'room') return   // Нэг өрөөг зөвхөн нэг удаа
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
    const it = get().cart.find(i => i.key === key)
    if (it?.itemType === 'room' && quantity > 1) return   // Өрөө 1-д түгжээтэй
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
  // Price helper: service → .price, product → .sale_price,
  //               room → өрөөний төрлийн үнэ, ticket → төрлийн .price
  getItemPrice: (cartItem) => {
    switch (cartItem.itemType) {
      case 'service': return cartItem.item.price
      case 'product': return cartItem.item.sale_price
      case 'room':    return cartItem.item.room_type?.price ?? 0
      case 'ticket':  return cartItem.item.price
      default:        return 0
    }
  },

  getSubtotal: () => {
    const price = get().getItemPrice
    return get().cart.reduce((sum, i) => sum + price(i) * i.quantity, 0)
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
