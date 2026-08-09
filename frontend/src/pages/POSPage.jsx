import { useState } from 'react'
import ServiceGrid from '../components/ServiceGrid'
import Cart from '../components/Cart'
import CustomerSearch from '../components/CustomerSearch'
import Receipt from '../components/Receipt'
import QRPayment from '../components/QRPayment'
import useStore from '../store/useStore'
import { Smartphone, ShoppingCart, Grid3x3 } from 'lucide-react'

export default function POSPage() {
  const { paymentMethod, setShowQRModal, getItemCount, getTotal } = useStore()
  const cart      = useStore(s => s.cart)
  const itemCount = getItemCount()
  const total     = getTotal()
  const [mobileTab, setMobileTab] = useState('services') // 'services' | 'cart'

  return (
    <div className="flex h-full overflow-hidden">

      {/* ══════════════════════════════════════════
          DESKTOP layout — md+ дээр харагдана
      ══════════════════════════════════════════ */}

      {/* LEFT — Service grid */}
      <div className="hidden md:flex flex-1 flex-col overflow-hidden border-r border-gray-200">
        <div className="bg-white px-4 py-3 border-b shrink-0">
          <h1 className="font-bold text-lg text-gray-800">🧺 Угаалгын POS</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <ServiceGrid />
        </div>
      </div>

      {/* RIGHT — Cart panel */}
      <div className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col bg-gray-50 border-l border-gray-200">
        <div className="p-3 bg-white border-b shrink-0">
          <CustomerSearch />
        </div>
        {(paymentMethod === 'card') && itemCount > 0 && (
          <div className="px-3 pt-2 shrink-0">
            <button
              onClick={() => setShowQRModal(true, paymentMethod)}
              className="w-full flex items-center justify-center gap-2
                         bg-purple-600 hover:bg-purple-700 text-white
                         py-2.5 rounded-xl text-sm font-bold transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              QR Код харуулах
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Cart onOrderComplete={() => {}} />
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MOBILE layout — md-аас доош харагдана
      ══════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Mobile tab bar */}
        <div className="flex bg-white border-b shrink-0 shadow-sm">
          <button
            onClick={() => setMobileTab('services')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold
                         border-b-2 transition-colors
                         ${mobileTab === 'services'
                           ? 'border-blue-600 text-blue-600'
                           : 'border-transparent text-gray-400'}`}
          >
            <Grid3x3 className="w-4 h-4" />
            Үйлчилгээ
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold
                         border-b-2 transition-colors relative
                         ${mobileTab === 'cart'
                           ? 'border-blue-600 text-blue-600'
                           : 'border-transparent text-gray-400'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            Сагс
            {itemCount > 0 && (
              <span className="ml-0.5 bg-red-500 text-white text-xs font-bold
                               px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile: Services tab */}
        {mobileTab === 'services' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              <ServiceGrid />
            </div>

            {/* Sticky cart summary bar at bottom when cart has items */}
            {itemCount > 0 && (
              <button
                onClick={() => setMobileTab('cart')}
                className="shrink-0 bg-blue-600 text-white flex items-center justify-between
                           px-5 py-3.5 gap-3 active:bg-blue-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  <span className="font-bold text-sm">{itemCount} зүйл сонгосон</span>
                </div>
                <span className="font-bold text-base">{total.toLocaleString()}₮ →</span>
              </button>
            )}
          </div>
        )}

        {/* Mobile: Cart tab */}
        {mobileTab === 'cart' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Customer search */}
            <div className="p-3 bg-white border-b shrink-0">
              <CustomerSearch />
            </div>
            {/* QR button */}
            {paymentMethod === 'card' && itemCount > 0 && (
              <div className="px-3 pt-2 shrink-0 bg-white">
                <button
                  onClick={() => setShowQRModal(true, paymentMethod)}
                  className="w-full flex items-center justify-center gap-2
                             bg-purple-600 hover:bg-purple-700 text-white
                             py-2.5 rounded-xl text-sm font-bold transition-colors"
                >
                  <Smartphone className="w-4 h-4" />
                  QR Код харуулах
                </button>
              </div>
            )}
            {/* Cart */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <Cart onOrderComplete={() => setMobileTab('services')} />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <Receipt />
      <QRPayment />
    </div>
  )
}
