import { useState } from 'react'
import { X, Banknote, ArrowLeftRight, Smartphone, Layers } from 'lucide-react'

export const PAY_METHODS = [
  { value: 'cash',     label: 'Бэлэн мөнгө', icon: Banknote },
  { value: 'transfer', label: 'Шилжүүлэг',   icon: ArrowLeftRight },
  { value: 'card',     label: 'Карт',         icon: Smartphone },
]

/* ── Төлбөр авах модал (Дараалал / Анхааруулга хуудсанд) ── */
export default function PayModal({ order, onClose, onPay }) {
  const [method, setMethod] = useState('cash')
  const [mixedAmounts, setMixedAmounts] = useState({ cash: '', transfer: '', card: '' })

  const mixedTotal = Object.values(mixedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const mixedDiff = mixedTotal - order.total
  const mixedValid = method !== 'mixed' || (
    Object.entries(mixedAmounts).filter(([, v]) => parseFloat(v) > 0).length >= 2 &&
    mixedTotal >= order.total - 1
  )

  const handlePay = () => {
    if (method === 'mixed') {
      const details = {}
      Object.entries(mixedAmounts).forEach(([k, v]) => {
        const n = parseFloat(v)
        if (n > 0) details[k] = n
      })
      onPay(method, JSON.stringify(details))
    } else {
      onPay(method, null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Төлбөр авах</h3>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-3xl font-black mt-2 tracking-tight">
            {order.total.toLocaleString()}₮
          </p>
        </div>

        <div className="p-4 space-y-3">
          {/* Payment methods */}
          <div className="grid grid-cols-4 gap-1.5">
            {PAY_METHODS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setMethod(value)}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 text-[11px]
                            font-semibold transition-all
                            ${method === value
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                              : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                {label}
              </button>
            ))}
            <button
              onClick={() => setMethod('mixed')}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 text-[11px]
                          font-semibold transition-all
                          ${method === 'mixed'
                            ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                            : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
            >
              <Layers className="w-4 h-4 mb-0.5" />
              Хосолсон
            </button>
          </div>

          {/* Mixed payment inputs */}
          {method === 'mixed' && (
            <div className="rounded-xl bg-gray-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">Задаргаа</span>
                {Math.abs(mixedDiff) < 1 ? (
                  <span className="text-[11px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Таарсан</span>
                ) : mixedDiff > 0 ? (
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">+{mixedDiff.toLocaleString()}₮</span>
                ) : (
                  <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">-{Math.abs(mixedDiff).toLocaleString()}₮</span>
                )}
              </div>
              {PAY_METHODS.map(({ value, label, icon: Icon }) => (
                <div key={value} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 w-24 shrink-0">
                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                  <div className="flex-1 relative">
                    <input
                      type="number" min="0" placeholder="0"
                      value={mixedAmounts[value]}
                      onChange={e => setMixedAmounts(p => ({ ...p, [value]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right pr-7
                                 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-300">₮</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handlePay}
            disabled={!mixedValid}
            className={`w-full text-white font-bold py-3 rounded-xl transition-colors text-sm
                       ${mixedValid ? 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            Төлбөр батлах
          </button>
        </div>
      </div>
    </div>
  )
}
