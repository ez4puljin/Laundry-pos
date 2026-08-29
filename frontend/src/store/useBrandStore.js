import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

/* Системийн нэр (байгууллагын брэнд).
   САЛБАР ТУС БҮРД тусдаа — нэвтрэх хуудсанд салбараа сонгоход зүүн талын
   мэдээлэл тухайн салбарынхаар солигдоно.
   Нэвтрэх хуудас, ТВ дэлгэц ч ашигладаг тул нэвтрэлтгүй endpoint-оос уншина.
   localStorage-д хадгалагдсан тул хуудас дахин ачаалахад анивчихгүй. */

export const DEFAULT_BRAND = {
  brand_name:  'Цэмбий Laundry угаалга',
  brand_short: 'Цэмбий',
  brand_desc:  'Угаалгын үйлчилгээний удирдлагын систем',
}

const useBrandStore = create(
  persist(
    (set) => ({
      ...DEFAULT_BRAND,
      loaded: false,

      /** branchCode — аль салбарын нэрийг татах вэ (сонгоогүй бол анхныхыг) */
      fetchBrand: async (branchCode) => {
        try {
          // Interceptor-ийн toast/redirect-ээс зайлсхийж bare axios ашиглана
          const { data } = await axios.get(
            '/api/public/brand',
            branchCode ? { headers: { 'X-Branch': branchCode } } : undefined,
          )
          set({
            brand_name:  data.brand_name  || DEFAULT_BRAND.brand_name,
            brand_short: data.brand_short || DEFAULT_BRAND.brand_short,
            brand_desc:  data.brand_desc  ?? DEFAULT_BRAND.brand_desc,
            loaded: true,
          })
        } catch {
          set({ loaded: true })   // сүлжээгүй бол хадгалсан утгаа хэрэглэнэ
        }
      },

      setBrand: (b) => set({ ...b }),
    }),
    { name: 'cemby-brand' }
  )
)

export default useBrandStore
