import { X, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import useStore from '../store/useStore'

// QR утгууд (жишиг — бодит дансны мэдээллээр солино)
const QR_CONFIG = {
  card: {
    label:    'Карт',
    color:    '#1a56db',
    bg:       '#eff6ff',
    logo:     '💳',
    bankName: 'Картаар төлөх',
    getValue: (amount) =>
      `card://pay?amount=${amount}`,
  },
  social_pay: {
    label:    'SocialPay',
    color:    '#7c3aed',
    bg:       '#f5f3ff',
    logo:     '💜',
    bankName: 'Khan Bank SocialPay',
    getValue: (amount) =>
      `khanpay://pay?amount=${amount}&desc=Laundry`,
  },
}

export default function QRPayment() {
  const { showQRModal, qrType, setShowQRModal, getTotal } = useStore()
  if (!showQRModal) return null

  const total  = getTotal()
  const config = QR_CONFIG[qrType] || QR_CONFIG.card
  const qrVal  = config.getValue(total)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 text-white"
          style={{ backgroundColor: config.color }}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config.logo}</span>
            <div>
              <p className="font-bold">{config.label}</p>
              <p className="text-xs opacity-75">{config.bankName}</p>
            </div>
          </div>
          <button onClick={() => setShowQRModal(false)} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR */}
        <div style={{ backgroundColor: config.bg }} className="flex flex-col items-center p-6">
          <div className="bg-white p-3 rounded-2xl shadow-inner">
            <QRCodeSVG
              value={qrVal}
              size={200}
              fgColor={config.color}
              level="M"
              includeMargin={false}
            />
          </div>

          <div className="mt-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{total.toLocaleString()}₮</p>
            <p className="text-sm text-gray-500 mt-1">QR кодыг уншуулж төлбөр хийнэ үү</p>
          </div>

          <div className="flex gap-2 mt-4 w-full">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-1.5
                         border border-gray-300 rounded-xl py-2.5 text-sm font-medium
                         text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Шинэчлэх
            </button>
            <button
              onClick={() => setShowQRModal(false)}
              className="flex-1 text-white rounded-xl py-2.5 text-sm font-bold
                         hover:opacity-90 transition-opacity"
              style={{ backgroundColor: config.color }}
            >
              Төлөгдлөө ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
