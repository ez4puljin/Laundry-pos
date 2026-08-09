import { useState, useEffect } from 'react'
import {
  Trash2, Plus, Minus, Tag, ChevronDown, ChevronUp,
  Banknote, Smartphone, ArrowLeftRight, Gift, Package, Layers
} from 'lucide-react'
import toast from 'react-hot-toast'
import useStore     from '../store/useStore'
import useAuthStore from '../store/useAuthStore'
import { ordersApi } from '../api/client'

// 3 үндсэн + хосолсон
const SINGLE_METHODS = [
  { value: 'cash',     label: 'Бэлэн мөнгө', icon: Banknote         },
  { value: 'transfer', label: 'Шилжүүлэг',   icon: ArrowLeftRight   },
  { value: 'card',     label: 'Карт',         icon: Smartphone       },
]

export default function Cart({ onOrderComplete }) {
  const {
    cart, customer, orderPhone, discount, couponCode, pointsToUse,
    paymentMethod, mixedAmounts,
    updateQuantity, removeFromCart, setDiscount, setCouponCode,
    setPointsToUse, setPaymentMethod, setMixedAmounts, clearCart,
    getSubtotal, getDiscountAmount, getTotal, setLastOrder
  } = useStore()

  const authUser = useAuthStore(s => s.user)

  const [showDiscount, setShowDiscount] = useState(false)
  const [discountInput, setDiscountInput] = useState({ type: 'percent', value: '' })
  const [couponInput, setCouponInput]     = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [hasActiveCoupons, setHasActiveCoupons] = useState(false)

  // Идэвхтэй купон байгаа эсэхийг шалгах
  useEffect(() => {
    ordersApi.listCoupons()
      .then(r => setHasActiveCoupons((r.data || []).some(c => c.is_active)))
      .catch(() => {})
  }, [])

  // ── Hotkeys ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Input/textarea дотор байвал хэрэгжүүлэхгүй
      const tag = e.target.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      switch (e.key) {
        case 'F1': e.preventDefault(); setPaymentMethod('cash');     break
        case 'F2': e.preventDefault(); setPaymentMethod('transfer'); break
        case 'F3': e.preventDefault(); setPaymentMethod('card');     break
        case 'F4': e.preventDefault(); setPaymentMethod('mixed');    break
        case 'F5': e.preventDefault(); setPaymentMethod('unpaid');   break
        case 'F9': e.preventDefault(); handleCheckout();             break
        case 'Delete':
          if (!inInput && cart.length > 0) {
            e.preventDefault()
            const last = cart[cart.length - 1]
            removeFromCart(last.key)
          }
          break
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, submitting, paymentMethod, mixedAmounts, customer, orderPhone, pointsToUse])

  const subtotal        = getSubtotal()
  const discountAmount  = getDiscountAmount()
  const total           = getTotal()

  const applyDiscount = () => {
    const val = parseFloat(discountInput.value)
    if (!val || val <= 0) return toast.error('Буруу хямдрал')
    if (discountInput.type === 'percent' && val > 100) return toast.error('100%-аас их байж болохгүй')
    setDiscount({ type: discountInput.type, value: val })
    toast.success('Хямдрал нэмэгдлээ')
  }

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    try {
      const res = await ordersApi.validateCoupon({ code: couponInput.trim(), amount: subtotal })
      setDiscount({ type: res.data.discount_type, value: res.data.discount_value })
      setCouponCode(couponInput.trim())
      toast.success(`Купон хэрэглэгдлээ: ${res.data.discount_amount.toLocaleString()}₮ хямдрал`)
    } catch {}
  }

  const handleCheckout = async () => {
    if (submitting) return
    if (cart.length === 0) return toast.error('Сагс хоосон байна', { id: 'co-empty' })
    // Харилцагч ЭСВЭЛ 8 оронтой SMS дугаар байвал зөвшөөрнө
    if (!customer && orderPhone.length !== 8) {
      return toast.error('Харилцагч сонгох эсвэл 8 оронтой SMS дугаар оруулна уу', { id: 'co-customer' })
    }

    // Хосолсон төлбөр шалгах
    if (paymentMethod === 'mixed') {
      const filled = Object.entries(mixedAmounts)
        .filter(([, v]) => parseFloat(v) > 0)
      if (filled.length < 2) return toast.error('2-оос дээш төлбөрийн хэлбэр оруулна уу', { id: 'co-mixed' })
      const mixedTotal = filled.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0)
      if (mixedTotal < total - 1) {
        return toast.error(`Дутуу: ${(total - mixedTotal).toLocaleString()}₮ байна`, { id: 'co-short' })
      }
    }

    setSubmitting(true)
    try {
      // Хосолсон төлбөрийн задаргаа
      let paymentDetails = null
      if (paymentMethod === 'mixed') {
        const details = {}
        Object.entries(mixedAmounts).forEach(([k, v]) => {
          const n = parseFloat(v)
          if (n > 0) details[k] = n
        })
        paymentDetails = JSON.stringify(details)
      }

      const payload = {
        customer_id:     customer?.id || null,
        phone:           !customer && orderPhone.length === 8 ? orderPhone : null,
        items:           cart.map(i => {
          if (i.itemType === 'service') {
            return { service_id: i.item.id, quantity: i.quantity, notes: i.notes || null }
          } else {
            return { product_id: i.item.id, quantity: i.quantity, notes: i.notes || null }
          }
        }),
        discount_type:   discount.type,
        discount_value:  discount.value || 0,
        payment_method:  paymentMethod,
        payment_details: paymentDetails,
        points_used:     pointsToUse,
        notes:           null,
        cashier_name:    authUser?.full_name || 'Кассчин',
      }
      const res = await ordersApi.create(payload)
      setLastOrder(res.data)
      clearCart()
      toast.success(`Захиалга #${res.data.order_number} амжилттай үүслээ!`)
      onOrderComplete?.(res.data)
    } catch {
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <div className="text-6xl mb-4">🧺</div>
        <p className="text-sm">Үйлчилгээ сонгоно уу</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cart items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.map(({ key, itemType, item, quantity, notes }) => {
          const price = itemType === 'service' ? item.price : item.sale_price
          return (
            <div key={key} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                    {itemType === 'product' && (
                      <span className="inline-flex items-center gap-0.5 text-xs bg-green-100
                                       text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                        <Package className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{price.toLocaleString()}₮ × {quantity}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => updateQuantity(key, quantity - 1)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center
                               hover:bg-gray-200 transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                  <button
                    onClick={() => updateQuantity(key, quantity + 1)}
                    className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center
                               hover:bg-blue-200 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-blue-600" />
                  </button>
                  <button
                    onClick={() => removeFromCart(key)}
                    className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center
                               hover:bg-red-100 transition-colors ml-1"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">{notes || ''}</span>
                <span className="text-sm font-bold text-blue-600">
                  {(price * quantity).toLocaleString()}₮
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Discount section — зөвхөн идэвхтэй купон байвал харуулна */}
      {hasActiveCoupons && (
      <div className="border-t bg-white">
        <button
          onClick={() => setShowDiscount(!showDiscount)}
          className="w-full flex items-center justify-between px-4 py-2.5
                     text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <span className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Хямдрал / Купон
            {discount.type && (
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                -{discountAmount.toLocaleString()}₮
              </span>
            )}
          </span>
          {showDiscount ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDiscount && (
          <div className="px-4 pb-3 space-y-2 border-t">
            <div className="flex gap-2 mt-2">
              <select
                className="border rounded-lg px-2 py-1.5 text-sm"
                value={discountInput.type}
                onChange={e => setDiscountInput(p => ({ ...p, type: e.target.value }))}
              >
                <option value="percent">%</option>
                <option value="amount">₮</option>
              </select>
              <input
                type="number"
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                placeholder={discountInput.type === 'percent' ? 'Жишээ: 10' : 'Жишээ: 5000'}
                value={discountInput.value}
                onChange={e => setDiscountInput(p => ({ ...p, value: e.target.value }))}
              />
              <button
                onClick={applyDiscount}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium
                           hover:bg-blue-700 transition-colors"
              >
                Хэрэгл
              </button>
            </div>
            {hasActiveCoupons && (
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Купон код"
                  value={couponInput}
                  onChange={e => setCouponInput(e.target.value.toUpperCase())}
                />
                <button
                  onClick={applyCoupon}
                  className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium
                             hover:bg-orange-600 transition-colors"
                >
                  Шалга
                </button>
              </div>
            )}
            {customer && customer.points > 0 && (
              <div className="flex items-center gap-2 bg-yellow-50 rounded-lg p-2">
                <Gift className="w-4 h-4 text-yellow-600" />
                <span className="text-xs text-yellow-700">
                  Оноо: <strong>{customer.points}</strong>
                </span>
                <input
                  type="number"
                  min={0}
                  max={Math.min(customer.points, total)}
                  className="w-20 border rounded px-2 py-1 text-xs ml-auto"
                  placeholder="Ашиглах"
                  value={pointsToUse || ''}
                  onChange={e => setPointsToUse(Math.min(
                    parseInt(e.target.value) || 0,
                    customer.points
                  ))}
                />
                <span className="text-xs text-yellow-700">оноо</span>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Payment method */}
      <div className="border-t bg-white px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-2">ТӨЛБӨРИЙН ХЭЛБЭР</p>

        {/* Single + Mixed + Unpaid buttons */}
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {SINGLE_METHODS.map(({ value, label, icon: Icon }, idx) => (
            <button
              key={value}
              onClick={() => setPaymentMethod(value)}
              className={`relative flex flex-col items-center justify-center py-2 rounded-xl border-2 text-xs
                          font-medium transition-all
                          ${paymentMethod === value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              <span className="absolute top-0.5 right-1 text-[9px] font-mono opacity-40">F{idx+1}</span>
              <Icon className="w-4 h-4 mb-1" />
              {label}
            </button>
          ))}
          {/* Хосолсон button */}
          <button
            onClick={() => setPaymentMethod('mixed')}
            className={`relative flex flex-col items-center justify-center py-2 rounded-xl border-2 text-xs
                        font-medium transition-all
                        ${paymentMethod === 'mixed'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            <span className="absolute top-0.5 right-1 text-[9px] font-mono opacity-40">F4</span>
            <Layers className="w-4 h-4 mb-1" />
            Хосолсон
          </button>
          {/* Дараа төлнө button */}
          <button
            onClick={() => setPaymentMethod('unpaid')}
            className={`relative flex flex-col items-center justify-center py-2 rounded-xl border-2 text-xs
                        font-medium transition-all
                        ${paymentMethod === 'unpaid'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            <span className="absolute top-0.5 right-1 text-[9px] font-mono opacity-40">F5</span>
            <span className="text-base mb-0.5">⏳</span>
            Дараа
          </button>
        </div>

        {/* Mixed payment inputs */}
        {paymentMethod === 'mixed' && (
          <div className="bg-purple-50 rounded-xl p-3 space-y-2 border border-purple-100">
            {/* Summary row */}
            {(() => {
              const entered = Object.values(mixedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
              const diff    = entered - total
              const exact   = Math.abs(diff) < 1
              return (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-purple-600 font-semibold">
                    Нийт: <span className="text-purple-800">{total.toLocaleString()}₮</span>
                  </span>
                  {exact ? (
                    <span className="text-xs font-bold text-green-600">✓ Таарч байна</span>
                  ) : diff > 0 ? (
                    <span className="text-xs font-bold text-blue-600">
                      Хариулт: {diff.toLocaleString()}₮
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-500">
                      Дутуу: {Math.abs(diff).toLocaleString()}₮
                    </span>
                  )}
                </div>
              )
            })()}
            {SINGLE_METHODS.map(({ value, label, icon: Icon }) => (
              <div key={value} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-600 w-20 shrink-0">{label}</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={mixedAmounts[value]}
                  onChange={e => {
                    setMixedAmounts({ ...mixedAmounts, [value]: e.target.value })
                  }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                />
                <span className="text-xs text-gray-400 shrink-0">₮</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + Checkout */}
      <div className="border-t bg-white px-4 pt-3 pb-4">
        <div className="space-y-1 text-sm mb-3">
          <div className="flex justify-between text-gray-500">
            <span>Нийт дүн</span>
            <span>{subtotal.toLocaleString()}₮</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Хямдрал</span>
              <span>-{discountAmount.toLocaleString()}₮</span>
            </div>
          )}
          {pointsToUse > 0 && (
            <div className="flex justify-between text-yellow-600">
              <span>Оноогоор</span>
              <span>-{pointsToUse.toLocaleString()}₮</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 border-t pt-2">
            <span>Төлөх дүн</span>
            <span className="text-blue-600">{total.toLocaleString()}₮</span>
          </div>
        </div>

        <button
          onClick={handleCheckout}
          disabled={submitting}
          className={`w-full text-white font-bold py-3.5 rounded-xl transition-colors
                     text-base shadow-lg relative
                     ${paymentMethod === 'unpaid'
                       ? 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 shadow-orange-200'
                       : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 shadow-blue-200'}`}
        >
          <span className="absolute top-1 right-2 text-[10px] font-mono text-blue-200 opacity-70">F9</span>
          {submitting ? 'Боловсруулж байна...'
            : paymentMethod === 'unpaid'
              ? `⏳ Дараалалд оруулах — ${total.toLocaleString()}₮`
              : `💳 Захиалга батлах — ${total.toLocaleString()}₮`}
        </button>
      </div>
    </div>
  )
}
