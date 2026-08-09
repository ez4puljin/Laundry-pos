# 🧺 Laundry POS System

Өөртөө үйлчлэх угаалгын газрын POS систем.  
**Стек:** React 18 + FastAPI + SQLite

---

## 🚀 Ажиллуулах заавар

### Backend (FastAPI)
```bash
cd backend

# Virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# Багцуудыг суулгах
pip install -r requirements.txt

# Сервер ажиллуулах (http://localhost:8000)
python main.py
```

**API документ:** http://localhost:8000/docs

---

### Frontend (React + Vite)
```bash
cd frontend

# Суулгах
npm install

# Dev server (http://localhost:5173)
npm run dev

# Эцсийн хувилбар build хийх
npm run build
```

---

## 📁 Файлын бүтэц

```
laundry-pos/
├── backend/
│   ├── main.py          ← FastAPI app, seed data
│   ├── database.py      ← SQLite холболт
│   ├── models.py        ← SQLAlchemy ORM
│   ├── schemas.py       ← Pydantic schemas
│   └── routers/
│       ├── services.py  ← Угаалгын үйлчилгээ CRUD
│       ├── customers.py ← CRM + лояалти
│       ├── orders.py    ← POS захиалга + купон
│       ├── inventory.py ← Бараа материал
│       └── reports.py   ← Тайлан / Dashboard
└── frontend/
    └── src/
        ├── pages/
        │   ├── POSPage.jsx       ← Кассчин хэсэг
        │   ├── QueuePage.jsx     ← Угаалгын явц Kanban
        │   ├── CustomersPage.jsx ← CRM
        │   ├── InventoryPage.jsx ← Бараа
        │   └── DashboardPage.jsx ← Тайлан + Chart
        ├── components/
        │   ├── ServiceGrid.jsx   ← Үйлчилгээний grid
        │   ├── Cart.jsx          ← Сагс + хямдрал
        │   ├── CustomerSearch.jsx← Хурдан хайлт
        │   ├── Receipt.jsx       ← Баримт хэвлэх
        │   ├── QRPayment.jsx     ← QPay / SocialPay QR
        │   └── Layout.jsx        ← Sidebar navigation
        ├── api/client.js         ← Axios API wrapper
        └── store/useStore.js     ← Zustand global state
```

---

## ✨ Функцүүд

| Хэсэг          | Функц |
|----------------|-------|
| **POS**        | Сагс, хайлт, хямдрал, купон, оноо, QPay QR, баримт хэвлэх |
| **Queue**      | Kanban дараалал (4 статус), авто шинэчлэл (30с) |
| **CRM**        | Үйлчлүүлэгч хайх, бүртгэх, лояалти оноо, захиалгын түүх |
| **Inventory**  | Бараа материалын удирдлага, бага үлдэгдлийн анхааруулга |
| **Dashboard**  | 7 хоногийн орлогын chart, шилдэг үйлчилгээ, дараалалын статус |

---

## 🔧 QPay тохиргоо

`frontend/src/components/QRPayment.jsx` файлд:
```js
const QR_CONFIG = {
  qpay: {
    getValue: (amount) => `https://qpay.mn/q/YOUR_MERCHANT_ID/${amount}`,
  }
}
```
Merchant ID-гаа оруулаад бодит QPay URL-аар солино.
