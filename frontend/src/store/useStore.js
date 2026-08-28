import { create } from 'zustand'

// Cart item structure: { key, itemType: 'service'|'product'|'ticket', item, quantity, notes }
// key = `${itemType}_${item.id}`  (prevents service_1 and product_1 collision)
// 'ticket' = шүршүүрийн тасалбар — item нь ХҮНИЙ ТӨРЛИЙН ТАРИФ
//            (Том хүн / Сургуулийн хүүхэд / ...). Хүн бүрд нэг тасалбар,
//            тоо ширхэгээр нэмнэ. Өрөө нь дараа нь оногдоно.

// ── НӨАТ (ХОЛИМОГ загвар) ────────────────────────────────
//  * Үйлчилгээ ба шүршүүр — үнэ нь НӨАТ БАГТСАН. 5000₮ бол 5000₮ л
//    төлнө; баримт дээр 455₮ нь НӨАТ гэж задарна.
//  * Бараа — үнэ нь НӨАТ-ГҮЙ. «НӨАТ-тэй авах» сонгосон үед +10%
//    НЭМЭГДЭНЭ (500₮ → 550₮) тул НИЙТ ТӨЛӨХ ДҮН ӨСНӨ.
export const VAT_RATE = 0.10

/** Мөрийн түүхий (бүртгэсэн) үнэ */
const rawPrice = (ci) => {
  switch (ci.itemType) {
    case 'service': return ci.item.price
    case 'product': return ci.item.sale_price
    case 'ticket':  return ci.item.price
    default:        return 0
  }
}

/** Тухайн мөрөнд НӨАТ ногдох эсэх (үйлчилгээ, шүршүүр үргэлж) */
const lineHasVat = (itemType, productVat) =>
  itemType === 'service' || itemType === 'ticket' ||
  (itemType === 'product' && productVat)

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
  productVat: false,        // «Бараа НӨАТ-тэй» сонголт

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
    productVat: false,
  }),

  setProductVat:    (v) => set({ productVat: v }),
  setCustomer:      (c) => set({ customer: c, orderPhone: '' }),
  setOrderPhone:    (v) => set({ orderPhone: v }),
  setDiscount:      (d) => set({ discount: d }),
  setCouponCode:    (v) => set({ couponCode: v }),
  setPointsToUse:   (v) => set({ pointsToUse: v }),
  setPaymentMethod: (v) => set({ paymentMethod: v }),
  setMixedAmounts:  (v) => set({ mixedAmounts: v }),

  // ── Computed values ────────────────────────────────────
  /** Худалдах үнэ. Бараанд «НӨАТ-тэй авах» сонгосон бол +10% нэмэгдэнэ
   *  (баримт дээр ч нэгж үнэ өссөнөөр гарна). */
  getItemPrice: (cartItem) => {
    const raw = rawPrice(cartItem)
    return cartItem.itemType === 'product' && get().productVat
      ? Math.round(raw * (1 + VAT_RATE))
      : raw
  },

  getSubtotal: () => {
    const price = get().getItemPrice
    return get().cart.reduce((sum, i) => sum + price(i) * i.quantity, 0)
  },

  /** НӨАТ-тэй мөрүүдийн дүнд багтсан НӨАТ.
   *  (Бараа нэмэгдсэний дараа мөн «багтсан» болсон тул нэг томьёо.) */
  getVatAmount: () => {
    const { cart, getItemPrice, productVat } = get()
    const base = cart.reduce(
      (sum, i) => lineHasVat(i.itemType, productVat)
        ? sum + getItemPrice(i) * i.quantity
        : sum,
      0,
    )
    return Math.round(base * VAT_RATE / (1 + VAT_RATE))
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
    // НӨАТ дүнд багтсан тул нэмэхгүй
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
