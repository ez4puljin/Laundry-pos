import { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import dayjs from 'dayjs'
import useStore from '../store/useStore'
import { settingsApi } from '../api/client'

const PAY_LABELS = {
  cash:       'Бэлэн мөнгө',
  card:       'Карт',
  transfer:   'Шилжүүлэг',
  social_pay: 'SocialPay',
  points:     'Оноо',
  mixed:      'Холимог',
}

const STATUS_LABELS = {
  pending:   'Хүлээгдэж байна',
  washing:   'Угааж байна',
  ironing:   'Хатааж байна',
  ready:     'Бэлэн болсон',
  delivered: 'Олгосон',
}

const DEFAULT_RECEIPT = {
  shop_name: 'ЦЭМБИЙ LAUNDRY', shop_desc: 'Угаалгын үйлчилгээ',
  shop_phone: '9900-0000', footer_text: 'Баярлалаа!', footer_sub: 'Дахин ирнэ үү'
}

/* ─── receipt HTML string for print window ──────────────────────────────── */
function buildPrintHtml(o, rcpt = DEFAULT_RECEIPT) {
  const date = dayjs(o.created_at).format('YYYY/MM/DD  HH:mm')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Баримт - ${o.order_number}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 80mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.5;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrap  { width: 80mm; padding: 2mm 3mm 8mm; }
    .c     { text-align: center; }
    .r     { text-align: right; }
    .b     { font-weight: 900; }
    .xl    { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
    .lg    { font-size: 16px; font-weight: 900; }
    .sm    { font-size: 12px; font-weight: 700; }
    .dash  { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
    .solid { border: none; border-top: 3px solid  #000; margin: 2mm 0; }
    table  { width: 100%; border-collapse: collapse; }
    td     { padding: 0.8mm 0; vertical-align: top; color: #000; }
    .td-r  { text-align: right; white-space: nowrap; padding-left: 2mm; }
    .td-l  { text-align: left; }
    .total-row td { padding-top: 2mm; font-size: 17px; font-weight: 900; }
  </style>
</head>
<body>
<div class="wrap">

  <!-- HEADER -->
  <div class="c">
    <div class="xl">${rcpt.shop_name}</div>
    <div class="b">${rcpt.shop_desc}</div>
    <div class="sm">Утас: ${rcpt.shop_phone}</div>
  </div>

  <hr class="solid"/>

  <!-- ORDER INFO -->
  <table>
    <tr>
      <td class="td-l sm">Захиалга №</td>
      <td class="td-r b">${o.order_number}</td>
    </tr>
    <tr>
      <td class="td-l sm">Огноо</td>
      <td class="td-r">${date}</td>
    </tr>
    <tr>
      <td class="td-l sm">Кассчин</td>
      <td class="td-r">${o.cashier_name}</td>
    </tr>
    ${o.customer ? `<tr>
      <td class="td-l sm">Үйлчлүүлэгч</td>
      <td class="td-r b">${o.customer.name}</td>
    </tr>` : ''}
    ${o.customer?.phone ? `<tr>
      <td class="td-l sm">Утас</td>
      <td class="td-r">${o.customer.phone}</td>
    </tr>` : ''}
  </table>

  <hr class="dash"/>

  <!-- ITEMS HEADER -->
  <table>
    <tr class="sm">
      <td class="td-l">Бараа / Үйлчилгээ</td>
      <td class="td-r">Тоо</td>
      <td class="td-r">Үнэ</td>
    </tr>
  </table>
  <hr class="dash"/>

  <!-- ITEMS -->
  <table>
    ${o.items.map(item => {
      const name = item.item_name || item.service?.name || item.product?.name || '—'
      const tag  = item.item_type === 'product' ? ' <span class="sm">[бараа]</span>' : ''
      return `<tr>
        <td class="td-l">${name}${tag}</td>
        <td class="td-r" style="white-space:nowrap">×${item.quantity}</td>
        <td class="td-r" style="white-space:nowrap">${item.unit_price.toLocaleString()}₮</td>
      </tr>
      ${item.notes ? `<tr><td colspan="3" class="sm" style="padding-left:2mm">↳ ${item.notes}</td></tr>` : ''}`
    }).join('')}
  </table>

  <hr class="dash"/>

  <!-- SUBTOTAL + DISCOUNTS -->
  <table>
    <tr>
      <td class="td-l sm">Дэд дүн</td>
      <td class="td-r">${o.subtotal.toLocaleString()}₮</td>
    </tr>
    ${o.discount_amount > 0 ? `<tr>
      <td class="td-l sm">Хямдрал (${o.discount_type === 'percent' ? o.discount_value + '%' : 'дүн'})</td>
      <td class="td-r b">-${o.discount_amount.toLocaleString()}₮</td>
    </tr>` : ''}
    ${o.points_used > 0 ? `<tr>
      <td class="td-l sm">Оноо (${o.points_used} оноо)</td>
      <td class="td-r b">-${o.points_used.toLocaleString()}₮</td>
    </tr>` : ''}
  </table>

  <hr class="solid"/>

  <!-- TOTAL -->
  <table>
    <tr class="total-row">
      <td class="td-l">НИЙТ</td>
      <td class="td-r">${o.total.toLocaleString()}₮</td>
    </tr>
  </table>

  <hr class="solid"/>

  <!-- PAYMENT -->
  <table>
    <tr>
      <td class="td-l sm">Төлбөр</td>
      <td class="td-r b">${PAY_LABELS[o.payment_method] || o.payment_method}</td>
    </tr>
    ${o.payment_details && o.payment_method === 'mixed' ? (() => {
      try {
        const d = JSON.parse(o.payment_details)
        return Object.entries(d)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `<tr>
            <td class="td-l sm" style="padding-left:4mm">· ${PAY_LABELS[k] || k}</td>
            <td class="td-r sm">${Number(v).toLocaleString()}₮</td>
          </tr>`).join('')
      } catch { return '' }
    })() : ''}
    ${o.points_earned > 0 ? `<tr>
      <td class="td-l sm">Олгосон оноо</td>
      <td class="td-r b">+${o.points_earned} оноо</td>
    </tr>` : ''}
  </table>

  ${o.customer ? `
  <hr class="dash"/>
  <table style="width:100%">
    <tr><td colspan="2" class="b" style="padding-bottom:2mm">Онооны мэдээлэл</td></tr>
    <tr>
      <td class="td-l sm">Өмнөх үлдэгдэл</td>
      <td class="td-r">${(o.customer.points - (o.points_earned || 0) + (o.points_used || 0)).toLocaleString()} оноо</td>
    </tr>
    ${o.points_used > 0 ? `<tr>
      <td class="td-l sm">Ашигласан</td>
      <td class="td-r">-${o.points_used.toLocaleString()} оноо</td>
    </tr>` : ''}
    ${o.points_earned > 0 ? `<tr>
      <td class="td-l sm">Нэмэгдсэн</td>
      <td class="td-r">+${o.points_earned.toLocaleString()} оноо</td>
    </tr>` : ''}
    <tr>
      <td class="td-l b">Эцсийн үлдэгдэл</td>
      <td class="td-r b">${o.customer.points.toLocaleString()} оноо</td>
    </tr>
  </table>
  ` : ''}

  <hr class="dash"/>

  <!-- STATUS + FOOTER -->
  <div class="c">
    <div>Статус: <span class="b">${STATUS_LABELS[o.status] || o.status}</span></div>
    <div style="margin-top:5mm; font-size:17px; font-weight:900; letter-spacing:2px">★  ${rcpt.footer_text}  ★</div>
    <div style="margin-top:1mm">${rcpt.footer_sub}</div>
    <div style="margin-top:4mm; font-size:12px">${dayjs().format('YYYY-MM-DD HH:mm:ss')}</div>
  </div>

</div>
</body>
</html>`
}

function padLeft(str, total) {
  return str.padStart(total)
}

/* ─── Modal ─────────────────────────────────────────────────────────────── */
export default function Receipt() {
  const { lastOrder, showReceiptModal, closeReceipt } = useStore()
  const [rcpt, setRcpt] = useState(DEFAULT_RECEIPT)

  useEffect(() => {
    settingsApi.getReceipt().then(r => setRcpt(r.data)).catch(() => {})
  }, [showReceiptModal])

  if (!showReceiptModal || !lastOrder) return null

  const o = lastOrder

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=340,height=700,scrollbars=yes')
    w.document.write(buildPrintHtml(o, rcpt))
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         onClick={closeReceipt}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs flex flex-col max-h-[90vh]"
           onClick={e => e.stopPropagation()}>

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-bold text-base text-gray-800">🧾 Баримт</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700
                         text-white px-3 py-1.5 rounded-xl text-sm font-semibold
                         transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Хэвлэх
            </button>
            <button onClick={closeReceipt}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Receipt preview (thermal paper style) ── */}
        <div className="overflow-y-auto flex-1 bg-gray-100 p-4">
          {/* Paper effect */}
          <div className="mx-auto bg-white shadow-lg"
               style={{
                 width: '100%', maxWidth: '302px',
                 fontFamily: "'Courier New', Courier, monospace",
                 fontSize: '13px',
                 fontWeight: '700',
                 lineHeight: 1.5,
                 color: '#000',
                 padding: '8px 10px 18px',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
               }}>

            {/* ── Shop header ── */}
            <div className="text-center mb-2">
              <div className="font-black tracking-wide" style={{ fontSize: '16px' }}>{rcpt.shop_name}</div>
              <div className="font-bold" style={{ fontSize: '13px' }}>{rcpt.shop_desc}</div>
              <div style={{ fontSize: '12px' }}>Утас: {rcpt.shop_phone}</div>
            </div>

            <Solid />

            {/* ── Order meta ── */}
            <div className="space-y-0.5 mb-1" style={{ fontSize: '12px' }}>
              <Row label="Захиалга №" value={o.order_number} bold />
              <Row label="Огноо"      value={dayjs(o.created_at).format('YYYY/MM/DD HH:mm')} />
              <Row label="Кассчин"    value={o.cashier_name} />
              {o.customer && <Row label="Үйлчлүүлэгч" value={o.customer.name} bold />}
              {o.customer?.phone && <Row label="Утас" value={o.customer.phone} />}
            </div>

            <Dash />

            {/* ── Items header ── */}
            <div className="flex mb-0.5" style={{ fontSize: '11px' }}>
              <span className="flex-1">Нэр</span>
              <span className="w-7 text-right">Тоо</span>
              <span className="w-16 text-right">Үнэ</span>
            </div>
            <Dash />

            {/* ── Items ── */}
            <div className="space-y-1 mb-1" style={{ fontSize: '13px' }}>
              {o.items.map((item, i) => {
                const name = item.item_name || item.service?.name || item.product?.name || '—'
                return (
                  <div key={i}>
                    <div className="flex items-start gap-1">
                      <span className="flex-1 leading-snug font-bold">{name}
                        {item.item_type === 'product' &&
                          <span className="font-normal"> [б]</span>}
                      </span>
                      <span className="w-7 text-right">×{item.quantity}</span>
                      <span className="w-16 text-right font-bold">
                        {item.unit_price.toLocaleString()}₮
                      </span>
                    </div>
                    {item.notes && (
                      <div className="pl-2" style={{ fontSize: '11px' }}>↳ {item.notes}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <Dash />

            {/* ── Subtotals ── */}
            <div className="space-y-0.5 mb-1" style={{ fontSize: '12px' }}>
              <Row label="Дэд дүн" value={`${o.subtotal.toLocaleString()}₮`} />
              {o.discount_amount > 0 && (
                <Row label={`Хямдрал${o.discount_type === 'percent' ? ` (${o.discount_value}%)` : ''}`}
                     value={`-${o.discount_amount.toLocaleString()}₮`}
                     bold />
              )}
              {o.points_used > 0 && (
                <Row label={`Оноо (${o.points_used})`}
                     value={`-${o.points_used.toLocaleString()}₮`}
                     bold />
              )}
            </div>

            <Solid />

            {/* ── Total ── */}
            <div className="flex justify-between font-black py-0.5" style={{ fontSize: '16px' }}>
              <span>НИЙТ</span>
              <span>{o.total.toLocaleString()}₮</span>
            </div>

            <Solid />

            {/* ── Payment ── */}
            <div className="space-y-0.5 mb-1" style={{ fontSize: '12px' }}>
              <Row label="Төлбөр" value={PAY_LABELS[o.payment_method] || o.payment_method} bold />
              {o.payment_method === 'mixed' && o.payment_details && (() => {
                try {
                  return Object.entries(JSON.parse(o.payment_details))
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <Row key={k}
                           label={`  · ${PAY_LABELS[k] || k}`}
                           value={`${Number(v).toLocaleString()}₮`} />
                    ))
                } catch { return null }
              })()}
              {o.points_earned > 0 && (
                <Row label="Олгосон оноо"
                     value={`+${o.points_earned} оноо`}
                     bold />
              )}
            </div>

            {/* ── Points info ── */}
            {o.customer && (
              <>
                <Dash />
                <div>
                  <div className="font-bold mb-1" style={{ fontSize: '12px' }}>Онооны мэдээлэл</div>
                  <Row label="Өмнөх үлдэгдэл"
                       value={`${(o.customer.points - (o.points_earned || 0) + (o.points_used || 0)).toLocaleString()} оноо`} />
                  {o.points_used > 0 && (
                    <Row label="Ашигласан" value={`-${o.points_used.toLocaleString()} оноо`} />
                  )}
                  {o.points_earned > 0 && (
                    <Row label="Нэмэгдсэн" value={`+${o.points_earned.toLocaleString()} оноо`} />
                  )}
                  <Row label="Эцсийн үлдэгдэл"
                       value={`${o.customer.points.toLocaleString()} оноо`}
                       bold />
                </div>
              </>
            )}

            <Dash />

            {/* ── Status + footer ── */}
            <div className="text-center space-y-0.5" style={{ fontSize: '12px' }}>
              <div>Статус: <span className="font-black">{STATUS_LABELS[o.status] || o.status}</span></div>
              <div className="font-black tracking-widest mt-2" style={{ fontSize: '15px' }}>★  {rcpt.footer_text}  ★</div>
              <div style={{ fontSize: '12px' }}>{rcpt.footer_sub}</div>
              <div className="mt-2" style={{ fontSize: '11px' }}>
                {dayjs().format('YYYY-MM-DD HH:mm:ss')}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}

/* ── Small helpers ─────────────────────────────────────────────────────── */
function Dash() {
  return <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
}
function Solid() {
  return <div style={{ borderTop: '2px solid #000', margin: '3px 0' }} />
}
function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between" style={{ color: '#000' }}>
      <span>{label}</span>
      <span className={bold ? 'font-black' : ''}>{value}</span>
    </div>
  )
}
