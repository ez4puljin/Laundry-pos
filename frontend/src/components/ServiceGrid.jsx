import { useState, useEffect } from 'react'
import { Search, Plus, Package, Wrench } from 'lucide-react'
import { servicesApi, inventoryApi, categoriesApi } from '../api/client'
import useStore from '../store/useStore'

export default function ServiceGrid() {
  const [mainTab, setMainTab]               = useState('services')

  const [categories, setCategories]         = useState([])
  const [services, setServices]             = useState([])
  const [filtered, setFiltered]             = useState([])
  const [search, setSearch]                 = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [loadingSvc, setLoadingSvc]         = useState(true)

  const [products, setProducts]             = useState([])
  const [productSearch, setProductSearch]   = useState('')
  const [loadingProd, setLoadingProd]       = useState(false)
  const [prodLoaded, setProdLoaded]         = useState(false)

  const addToCart = useStore(s => s.addToCart)

  useEffect(() => {
    categoriesApi.list().then(r => setCategories(r.data)).catch(() => {})
    servicesApi.list({ active_only: true })
      .then(r => { setServices(r.data); setFiltered(r.data) })
      .finally(() => setLoadingSvc(false))
  }, [])

  useEffect(() => {
    if (mainTab === 'products' && !prodLoaded) {
      setLoadingProd(true)
      inventoryApi.list({ for_sale: true })
        .then(r => {
          setProducts((r.data || []).filter(p => p.sale_price != null))
          setProdLoaded(true)
        })
        .catch(() => setProducts([]))
        .finally(() => setLoadingProd(false))
    }
  }, [mainTab])

  useEffect(() => {
    let result = services
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      )
    }
    if (activeCategory !== 'all') {
      result = result.filter(s => s.category === activeCategory)
    }
    setFiltered(result)
  }, [search, activeCategory, services])

  const grouped = filtered.reduce((acc, svc) => {
    if (!acc[svc.category]) acc[svc.category] = []
    acc[svc.category].push(svc)
    return acc
  }, {})

  const filteredProducts = products.filter(p =>
    !productSearch.trim() ||
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Main tabs ── */}
      <div className="flex bg-white border-b px-4 pt-2 gap-1">
        <MainTab
          active={mainTab === 'services'}
          onClick={() => setMainTab('services')}
          icon={<Wrench className="w-4 h-4" />}
          label="Үйлчилгээ"
        />
        <MainTab
          active={mainTab === 'products'}
          onClick={() => setMainTab('products')}
          icon={<Package className="w-4 h-4" />}
          label="Бараа материал"
        />
      </div>

      {/* ════════ SERVICES TAB ════════ */}
      {mainTab === 'services' && (
        <>
          {/* Search + filters */}
          <div className="bg-white border-b px-4 py-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                placeholder="Нэр эсвэл код хайх..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              <CategoryPill
                active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                label="🏷️ Бүгд"
              />
              {categories.map(cat => (
                <CategoryPill
                  key={cat.value}
                  active={activeCategory === cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  label={cat.label}
                />
              ))}
            </div>
          </div>

          {/* Service cards */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingSvc ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                Уншиж байна...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                <Search className="w-10 h-10 opacity-20" />
                <p className="text-sm">Үйлчилгээ олдсонгүй</p>
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(grouped).map(([catValue, svcs]) => {
                  const catMeta = categories.find(c => c.value === catValue)
                  return (
                    <div key={catValue}>
                      {/* Category header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`h-5 w-1 rounded-full bg-gradient-to-b ${catMeta?.color || 'from-gray-400 to-gray-600'}`} />
                        <span className="text-sm font-bold text-gray-700 tracking-wide">
                          {catMeta?.label || catValue}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {svcs.length}
                        </span>
                      </div>
                      {/* Responsive grid: 2 → 3 → 4 columns */}
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {svcs.map(svc => (
                          <ServiceCard
                            key={svc.id}
                            service={svc}
                            colorClass={catMeta?.color || 'from-gray-400 to-gray-600'}
                            onAdd={() => addToCart(svc, 'service')}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════ PRODUCTS TAB ════════ */}
      {mainTab === 'products' && (
        <>
          <div className="bg-white border-b px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
                placeholder="Бараа хайх..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loadingProd ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                Уншиж байна...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                <Package className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Зарах бараа алга</p>
                <p className="text-xs text-center text-gray-300 px-4">
                  Удирдлага цэсний Бараа материал таб руу орж,<br/>
                  барааны "Зарах" тохиргоог асаана уу
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredProducts.map(prod => (
                  <ProductCard
                    key={prod.id}
                    product={prod}
                    onAdd={() => addToCart(prod, 'product')}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */

function MainTab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
        ${active
          ? 'border-blue-600 text-blue-600 bg-blue-50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
    >
      {icon}{label}
    </button>
  )
}

function CategoryPill({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all
        ${active
          ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {label}
    </button>
  )
}

function ServiceCard({ service, colorClass, onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="relative bg-white rounded-xl border border-gray-200 p-3 text-left
                 hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5
                 transition-all duration-150 active:scale-95 group overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorClass}`} />

      <div className="flex items-start justify-between gap-1 mt-1">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 font-mono">{service.code}</span>
          <p className="text-sm font-semibold text-gray-800 leading-snug mt-0.5 line-clamp-2">
            {service.name}
          </p>
        </div>
        <Plus className="w-5 h-5 text-gray-300 group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors" />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-base font-bold text-blue-600">{service.price.toLocaleString()}₮</span>
        <span className="text-xs text-gray-400">⏱ {service.duration_min}мин</span>
      </div>
    </button>
  )
}

function ProductCard({ product, onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="relative bg-white rounded-xl border border-gray-200 p-3 text-left
                 hover:shadow-md hover:border-green-300 hover:-translate-y-0.5
                 transition-all duration-150 active:scale-95 group overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />

      <div className="flex items-start justify-between gap-1 mt-1">
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700
                           px-1.5 py-0.5 rounded-full font-medium mb-1">
            <Package className="w-3 h-3" /> Бараа
          </span>
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {product.name}
          </p>
        </div>
        <Plus className="w-5 h-5 text-gray-300 group-hover:text-green-500 shrink-0 mt-0.5 transition-colors" />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-base font-bold text-green-600">
          {(product.sale_price ?? 0).toLocaleString()}₮
        </span>
        <span className="text-xs text-gray-400">{product.unit}</span>
      </div>

      {product.is_low && (
        <p className="text-xs text-red-500 mt-1">⚠ {product.quantity}{product.unit}</p>
      )}
    </button>
  )
}
