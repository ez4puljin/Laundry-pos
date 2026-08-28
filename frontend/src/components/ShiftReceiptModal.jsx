import { useEffect, useState } from 'react'
import { Printer, LogOut, X } from 'lucide-react'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { settingsApi } from '../api/client'
import useShiftStore from '../store/useShiftStore'

const DEFAULT_RECEIPT = {
  shop_name: 'ЦЭМБИЙ LAUNDRY', shop_desc: 'Угаалгын үйлчилгээ',
  shop_phone: '9900-0000', footer_text: 'Баярлалаа!', footer_sub: 'Дахин ирнэ үү'
}

const SCOPE_LABEL = { laundry: 'Угаалга', shower: 'Шүршүүр', master: 'Бүх касс' }

const money = (n) => `${Math.round(n || 0).toLocaleString()}₮`
const fmt   = (d) => (d ? dayjs(d).format('YYYY/MM/DD HH:mm') : '—')

function duration(from, to) {
  if (!from || !to) return '—'
  const mins = Math.max(0, dayjs(to).diff(dayjs(from), 'minute'))
  return `${Math.floor(mins / 60)}ц ${mins % 60}мин`
}

/* ─── 80mm термал хэвлэлт ────────────────────────────────────────────── */
const PRINT_CSS = `
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 80mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px; font-weight: 700; line-height: 1.5;
      color: #000; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .wrap  { width: 80mm; padding: 2mm 3mm 8mm; }
    .c     { text-align: center; }
    .b     { font-weight: 900; }
    .xl    { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
    .lg    { font-size: 16px; font-weight: 900; }
    .sm    { font-size: 12px; font-weight: 700; }
    .dash  { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
    .solid { border: none; border-top: 3px solid  #000; margin: 2mm 0; }
    table  { width: 100%; border-collapse: collapse; }
    td     { padding: 0.8mm 0; vertical-align: top; color: #000; }
    .td-r  { text-align: right; white-space: nowrap; padding-left: 2mm; }
    .total-row td { padding-top: 2mm; font-size: 17px; font-weight: 900; }
    .sig   { margin-top: 9mm; }
    .sig-line { border-bottom: 1px solid #000; height: 8mm; margin-top: 1mm; }
`

const row = (label, value, cls = '') =>
  `<tr class="${cls}"><td>${label}</td><td class="td-r">${value}</td></tr>`

function buildPrintHtml(d, rcpt) {
  const s = d.shift || {}
  // «Бүх төлбөрийн хэлбэр» — дүн 0 байсан ч мөр нь гарна, тулгалтад хэрэгтэй
  const payRows = [
    row('Бэлэн мөнгө',  money(d.cash_total)),
    row('Шилжүүлэг',    money(d.transfer_total)),
    row('Карт',         money(d.card_total)),
  ].join('')

  const extraRows = [
    d.late_total     > 0 ? row('Нөхөж авсан',    '+' + money(d.late_total))  : '',
    d.unpaid_total   > 0 ? row('Төлбөр төлөөгүй', money(d.unpaid_total))     : '',
    d.points_total   > 0 ? row('Оноогоор',       '-' + money(d.points_total)) : '',
    d.discount_total > 0 ? row('Хямдрал',        '-' + money(d.discount_total)) : '',
  ].filter(Boolean).join('')

  const kindRows = [
    d.laundry_total > 0 ? row('Угаалгын үйлчилгээ', money(d.laundry_total)) : '',
    d.shower_total  > 0 ? row('Шүршүүр',            money(d.shower_total))  : '',
    d.product_total > 0 ? row('Бараа материал',     money(d.product_total)) : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html lang="mn"><head><meta charset="utf-8"/>
<title>Тулгалтын баримт</title>
<style>${PRINT_CSS}</style>
</head><body>
<div class="wrap">
  <div class="c">
    <div class="xl">${rcpt.shop_name}</div>
    <div class="b" style="letter-spacing:3px; margin-top:1mm">ТУЛГАЛТЫН БАРИМТ</div>
  </div>

  <hr class="solid"/>
  <table>
    ${row('Касс:',    s.user?.full_name || '—')}
    ${row('Төрөл:',   SCOPE_LABEL[s.scope] || s.scope || '—')}
    ${row('Эхэлсэн:', fmt(s.started_at))}
    ${row('Дууссан:', fmt(s.ended_at))}
    ${row('Хугацаа:', duration(s.started_at, s.ended_at))}
  </table>

  <hr class="dash"/>
  <table>
    ${row('Нийт үйлчлүүлэгч:', d.total_customers)}
    ${row('Нийт захиалга:',    d.total_orders)}
  </table>

  <hr class="dash"/>
  <div class="b">ТӨЛБӨРИЙН ХЭЛБЭР</div>
  <table>${payRows}</table>
  ${extraRows ? `<hr class="dash"/><table>${extraRows}</table>` : ''}

  <hr class="solid"/>
  <table>
    <tr class="total-row"><td>НИЙТ (төлөгдсөн)</td>
        <td class="td-r">${money(d.total_revenue)}</td></tr>
  </table>

  ${kindRows ? `<hr class="dash"/>
  <div class="b">ҮЙЛЧИЛГЭЭНИЙ ЗАДАРГАА</div>
  <table>${kindRows}</table>` : ''}
  ${d.vat_total > 0
      ? `<table>${row('үүнд НӨАТ (10%)', money(d.vat_total))}</table>` : ''}

  <hr class="dash"/>
  <div class="sig">
    <div class="sm">Хүлээлгэн өгсөн (касс):</div>
    <div class="sig-line"></div>
    <div class="sm" style="margin-top:1mm">${s.user?.full_name || ''}</div>
  </div>
  <div class="sig">
    <div class="sm">Хүлээн авсан:</div>
    <div class="sig-line"></div>
  </div>

  <hr class="dash"/>
  <div class="c sm">${fmt(new Date())}</div>
</div>
</body></html>`
}

/* ─── Дэлгэц дээрх тулгалтын цонх ────────────────────────────────────── */
export default function ShiftReceiptModal({ data, onLogout }) {
  const [rcpt, setRcpt] = useState(DEFAULT_RECEIPT)
  const clearSummary = useShiftStore(s => s.clearSummary)

  useEffect(() => {
    settingsApi.getReceipt()
      .then(r => setRcpt({ ...DEFAULT_RECEIPT, ...r.data }))
      .catch(() => {})
  }, [])

  const s = data.shift || {}

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=340,height=700,scrollbars=yes')
    if (!w) {
      toast.error('Хэвлэх цонх нээгдсэнгүй. Хөтчийн popup зөвшөөрнө үү.',
                  { id: 'print-blocked' })
      return
    }
    w.document.write(buildPrintHtml(data, rcpt))
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm
                    flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm
                      flex flex-col max-h-[92vh]">

        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4
                        text-white rounded-t-2xl shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold">Тулгалтын баримт</h3>
            <p className="text-sm text-orange-100 mt-0.5 truncate">
              {s.user?.full_name} · {SCOPE_LABEL[s.scope] || s.scope}
            </p>
          </div>
          <button onClick={clearSummary}
                  className="p-1 rounded-lg hover:bg-white/20 shrink-0" title="Хаах">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <Line label="Эхэлсэн" value={fmt(s.started_at)} />
          <Line label="Дууссан" value={fmt(s.ended_at)} />
          <Line label="Хугацаа" value={duration(s.started_at, s.ended_at)} />

          <div className="border-t pt-3 space-y-2">
            <Line label="Нийт үйлчлүүлэгч" value={data.total_customers} bold />
            <Line label="Нийт захиалга"    value={data.total_orders}    bold />
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              Төлбөрийн хэлбэр
            </p>
            <Line label="Бэлэн мөнгө" value={money(data.cash_total)}     bold />
            <Line label="Шилжүүлэг"   value={money(data.transfer_total)} bold />
            <Line label="Карт"        value={money(data.card_total)}     bold />
            {data.late_total > 0 && (
              <Line label="💰 Нөхөж авсан" value={`+${money(data.late_total)}`}
                    bold className="text-orange-600" />
            )}
            {data.unpaid_total > 0 && (
              <Line label="⚠️ Төлбөр төлөөгүй" value={money(data.unpaid_total)}
                    bold className="text-red-600" />
            )}
            <div className="border-t pt-2 flex justify-between text-base font-black">
              <span>НИЙТ (төлөгдсөн)</span>
              <span className="text-blue-600">{money(data.total_revenue)}</span>
            </div>
          </div>

          {(data.laundry_total > 0 || data.shower_total > 0 || data.product_total > 0) && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                Үйлчилгээний задаргаа
              </p>
              {data.laundry_total > 0 && <Line label="Угаалгын үйлчилгээ" value={money(data.laundry_total)} bold />}
              {data.shower_total  > 0 && <Line label="Шүршүүр"            value={money(data.shower_total)}  bold />}
              {data.product_total > 0 && <Line label="Бараа материал"     value={money(data.product_total)} bold />}
              {data.points_total  > 0 && <Line label="Оноогоор хасагдсан" value={`-${money(data.points_total)}`}  bold className="text-emerald-600" />}
              {data.discount_total> 0 && <Line label="Хямдрал"            value={`-${money(data.discount_total)}`} bold className="text-emerald-600" />}
              {data.vat_total     > 0 && <Line label="үүнд НӨАТ (10%)"    value={money(data.vat_total)} />}
            </div>
          )}

          <p className="text-xs text-gray-400 border-t pt-3">
            Баримт дээр «Хүлээлгэн өгсөн» ба «Хүлээн авсан» гарын үсгийн хэсэг хэвлэгдэнэ.
          </p>
        </div>

        <div className="p-4 pt-0 space-y-2 shrink-0">
          <button onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 bg-orange-500
                       hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">
            <Printer className="w-4 h-4" /> Баримт хэвлэх
          </button>
          <div className="flex gap-2">
            <button onClick={clearSummary}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700
                         font-semibold py-2.5 rounded-xl transition-colors text-sm">
              Хаах
            </button>
            <button onClick={() => { clearSummary(); onLogout?.() }}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gray-800
                         hover:bg-gray-900 text-white font-semibold py-2.5 rounded-xl
                         transition-colors text-sm">
              <LogOut className="w-4 h-4" /> Гарах
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, bold, className = '' }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${className}`}>
      <span className={className || 'text-gray-500'}>{label}</span>
      <span className={bold ? 'font-bold' : 'font-medium'}>{value}</span>
    </div>
  )
}
