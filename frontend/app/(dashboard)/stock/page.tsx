'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stockApi } from '@/lib/api'
import type {
  PaginatedResult,
  StockCashTransaction,
  StockCategory,
  StockDashboard,
  StockMovement,
  StockMovementType,
  StockProduct,
} from '@/types'
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Tags,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import clsx from 'clsx'

const PAGE_SIZE = 25

const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('es-AR')

const tabs = [
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'movements', label: 'Movimientos', icon: ClipboardList },
  { id: 'cash', label: 'Caja', icon: Banknote },
  { id: 'categories', label: 'Categorias', icon: Tags },
] as const

type TabId = typeof tabs[number]['id']

const emptyProductForm = {
  name: '',
  sku: '',
  categoryId: '',
  price: '0',
  cost: '',
  stockQuantity: '0',
  minStock: '3',
  description: '',
  image: '',
}

const emptyMovementForm = {
  productId: '',
  type: 'IN' as StockMovementType,
  quantity: '1',
  reason: 'Ingreso de stock',
  note: '',
}

const emptyCashForm = {
  type: 'INCOME' as 'INCOME' | 'EXPENSE',
  category: '',
  amount: '',
  paymentMethod: '',
  reference: '',
  note: '',
}

function formatMoney(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0)
}

function metricTone(kind: 'neutral' | 'success' | 'warning' | 'danger') {
  return {
    neutral: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-slate-500/50 dark:bg-slate-600/25 dark:text-slate-100',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-300/25 dark:bg-emerald-400/15 dark:text-emerald-100',
    warning: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/15 dark:text-amber-100',
    danger: 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-300/25 dark:bg-rose-400/15 dark:text-rose-100',
  }[kind]
}

function movementLabel(type: StockMovementType) {
  return {
    IN: 'Ingreso',
    OUT: 'Egreso',
    SALE: 'Venta',
    ADJUSTMENT: 'Ajuste',
  }[type]
}

function movementTone(type: StockMovementType) {
  return type === 'IN' || type === 'ADJUSTMENT'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/25 dark:bg-emerald-400/15 dark:text-emerald-100'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/15 dark:text-amber-100'
}

function stockTone(product: Pick<StockProduct, 'stockQuantity' | 'minStock'>) {
  if (product.stockQuantity <= 0) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-300/25 dark:bg-rose-400/15 dark:text-rose-100'
  }
  if (product.stockQuantity <= product.minStock) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/15 dark:text-amber-100'
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/25 dark:bg-emerald-400/15 dark:text-emerald-100'
}

function stockLabel(product: Pick<StockProduct, 'stockQuantity' | 'minStock'>) {
  if (product.stockQuantity <= 0) return 'Sin stock'
  if (product.stockQuantity <= product.minStock) return 'Stock bajo'
  return 'Disponible'
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: any
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return (
    <div className="interactive-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl border', metricTone(tone))}>
          <Icon size={19} strokeWidth={2.5} />
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-400">{subtitle}</p>
    </div>
  )
}

export default function StockPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('products')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stockState, setStockState] = useState<'all' | 'low' | 'out' | 'active'>('all')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [showCashForm, setShowCashForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<StockProduct | null>(null)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [movementForm, setMovementForm] = useState(emptyMovementForm)
  const [cashForm, setCashForm] = useState(emptyCashForm)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })

  const dashboardQuery = useQuery<StockDashboard>({
    queryKey: ['stock', 'dashboard'],
    queryFn: () => stockApi.dashboard().then((r) => r.data),
  })

  const categoriesQuery = useQuery<StockCategory[]>({
    queryKey: ['stock', 'categories'],
    queryFn: () => stockApi.listCategories().then((r) => r.data),
  })

  const productsQuery = useQuery<PaginatedResult<StockProduct>>({
    queryKey: ['stock', 'products', search, categoryId, stockState],
    queryFn: () => stockApi.listProducts({
      search: search || undefined,
      categoryId: categoryId || undefined,
      stockState,
      limit: PAGE_SIZE,
    }).then((r) => r.data),
  })

  const movementsQuery = useQuery<PaginatedResult<StockMovement>>({
    queryKey: ['stock', 'movements'],
    queryFn: () => stockApi.listMovements({ limit: PAGE_SIZE }).then((r) => r.data),
  })

  const cashQuery = useQuery<PaginatedResult<StockCashTransaction>>({
    queryKey: ['stock', 'cash'],
    queryFn: () => stockApi.listCash({ limit: PAGE_SIZE }).then((r) => r.data),
  })

  const products = productsQuery.data?.items ?? []
  const categories = categoriesQuery.data ?? []
  const movements = movementsQuery.data?.items ?? []
  const cashTransactions = cashQuery.data?.items ?? []

  const productOptions = useMemo(
    () => products.map((product) => ({ id: product.id, name: product.name, sku: product.sku })),
    [products]
  )

  function invalidateStock() {
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  function resetProductForm() {
    setEditingProduct(null)
    setProductForm(emptyProductForm)
    setShowProductForm(false)
  }

  function openEditProduct(product: StockProduct) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      sku: product.sku ?? '',
      categoryId: product.categoryId ?? '',
      price: String(product.price),
      cost: product.cost == null ? '' : String(product.cost),
      stockQuantity: String(product.stockQuantity),
      minStock: String(product.minStock),
      description: product.description ?? '',
      image: product.image ?? '',
    })
    setShowProductForm(true)
  }

  const saveProduct = useMutation({
    mutationFn: () => {
      const payload = {
        name: productForm.name,
        sku: productForm.sku || undefined,
        categoryId: productForm.categoryId || undefined,
        price: Number(productForm.price || 0),
        cost: productForm.cost ? Number(productForm.cost) : undefined,
        stockQuantity: Number(productForm.stockQuantity || 0),
        minStock: Number(productForm.minStock || 0),
        description: productForm.description,
        image: productForm.image || undefined,
      }

      return editingProduct
        ? stockApi.updateProduct(editingProduct.id, payload)
        : stockApi.createProduct(payload)
    },
    onSuccess: () => {
      invalidateStock()
      resetProductForm()
    },
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo guardar el producto'),
  })

  const deleteProduct = useMutation({
    mutationFn: (id: string) => stockApi.deleteProduct(id),
    onSuccess: invalidateStock,
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo archivar el producto'),
  })

  const quickSale = useMutation({
    mutationFn: (product: StockProduct) => stockApi.quickSale(product.id, { quantity: 1 }),
    onSuccess: invalidateStock,
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo registrar la venta'),
  })

  const createMovement = useMutation({
    mutationFn: () => stockApi.createMovement({
      productId: movementForm.productId,
      type: movementForm.type,
      quantity: Number(movementForm.quantity || 0),
      reason: movementForm.reason,
      note: movementForm.note || undefined,
    }),
    onSuccess: () => {
      invalidateStock()
      setMovementForm(emptyMovementForm)
      setShowMovementForm(false)
    },
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo registrar el movimiento'),
  })

  const createCash = useMutation({
    mutationFn: () => stockApi.createCash({
      type: cashForm.type,
      category: cashForm.category,
      amount: Number(cashForm.amount || 0),
      paymentMethod: cashForm.paymentMethod || undefined,
      reference: cashForm.reference || undefined,
      note: cashForm.note || undefined,
    }),
    onSuccess: () => {
      invalidateStock()
      setCashForm(emptyCashForm)
      setShowCashForm(false)
    },
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo registrar el movimiento de caja'),
  })

  const deleteCash = useMutation({
    mutationFn: (id: string) => stockApi.deleteCash(id),
    onSuccess: invalidateStock,
  })

  const createCategory = useMutation({
    mutationFn: () => stockApi.createCategory({
      name: categoryForm.name,
      description: categoryForm.description || undefined,
    }),
    onSuccess: () => {
      invalidateStock()
      setCategoryForm({ name: '', description: '' })
      setShowCategoryForm(false)
    },
    onError: (err: any) => alert(err.response?.data?.message ?? 'No se pudo crear la categoria'),
  })

  const metrics = dashboardQuery.data?.metrics
  const isLoading = dashboardQuery.isLoading || productsQuery.isLoading || categoriesQuery.isLoading

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">Inventario</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Stock</h1>
          <p className="mt-1 font-medium text-slate-500">
            Productos, movimientos y caja operativa del workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowMovementForm(true)} className="btn-secondary">
            <ClipboardList size={17} />
            Movimiento
          </button>
          <button onClick={() => setShowCashForm(true)} className="btn-secondary">
            <Banknote size={17} />
            Caja
          </button>
          <button onClick={() => setShowProductForm(true)} className="btn-primary">
            <Plus size={17} />
            Producto
          </button>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Productos"
          value={metrics ? numberFormatter.format(metrics.totalProducts) : '-'}
          subtitle="Items activos"
          icon={Boxes}
          tone="neutral"
        />
        <MetricCard
          title="Unidades"
          value={metrics ? numberFormatter.format(metrics.unitsInStock) : '-'}
          subtitle="Stock disponible"
          icon={Package}
          tone="success"
        />
        <MetricCard
          title="Alertas"
          value={metrics ? numberFormatter.format(metrics.lowStockProducts + metrics.outOfStockProducts) : '-'}
          subtitle="Bajo stock o sin stock"
          icon={TriangleAlert}
          tone={metrics && metrics.lowStockProducts + metrics.outOfStockProducts > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          title="Valor stock"
          value={metrics ? formatMoney(metrics.inventoryValue) : '-'}
          subtitle="Estimado a precio de venta"
          icon={CircleDollarSign}
          tone="success"
        />
      </div>

      {dashboardQuery.data?.lowStockProducts.length ? (
        <div className="interactive-card mb-7 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <TriangleAlert size={18} className="text-amber-600" />
              Reposicion prioritaria
            </h2>
            <button onClick={() => setStockState('low')} className="text-xs font-bold text-primary-600 hover:text-primary-700">
              Ver filtrados
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboardQuery.data.lowStockProducts.slice(0, 4).map((product) => (
              <div key={product.id} className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-300/20 dark:bg-amber-400/10">
                <p className="truncate text-sm font-bold text-slate-900">{product.name}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Min. {product.minStock}</span>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-black text-amber-700 shadow-sm dark:bg-slate-800/80 dark:text-amber-200">
                    {product.stockQuantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all',
                  active
                    ? 'border-primary-200 bg-primary-50 text-primary-700 shadow-sm dark:border-slate-500 dark:bg-slate-600/70 dark:text-slate-50'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-primary-100 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="relative w-full lg:w-[360px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto o SKU..."
            className="ctrl-input pl-10"
          />
        </div>
      </div>

      {showProductForm && (
        <div className="interactive-card mb-6 border-l-4 border-l-primary-600 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              {editingProduct ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <button onClick={resetProductForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input className="ctrl-input" placeholder="Nombre *" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
            <input className="ctrl-input" placeholder="SKU" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
            <select className="ctrl-input" value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}>
              <option value="">Sin categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <input className="ctrl-input" placeholder="Imagen URL" value={productForm.image} onChange={(e) => setProductForm({ ...productForm, image: e.target.value })} />
            <input className="ctrl-input" type="number" min="0" step="0.01" placeholder="Precio" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
            <input className="ctrl-input" type="number" min="0" step="0.01" placeholder="Costo" value={productForm.cost} onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })} />
            <input className="ctrl-input" type="number" min="0" step="1" placeholder="Stock" value={productForm.stockQuantity} onChange={(e) => setProductForm({ ...productForm, stockQuantity: e.target.value })} />
            <input className="ctrl-input" type="number" min="0" step="1" placeholder="Stock minimo" value={productForm.minStock} onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })} />
            <textarea
              className="ctrl-input min-h-24 md:col-span-2 xl:col-span-4"
              placeholder="Descripcion"
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-600/70">
            <button
              onClick={() => saveProduct.mutate()}
              disabled={!productForm.name || saveProduct.isPending}
              className="btn-primary"
            >
              {saveProduct.isPending && <Loader2 size={16} className="animate-spin" />}
              Guardar
            </button>
            <button onClick={resetProductForm} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {showMovementForm && (
        <div className="interactive-card mb-6 border-l-4 border-l-emerald-600 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Registrar movimiento</h2>
            <button onClick={() => setShowMovementForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select className="ctrl-input xl:col-span-2" value={movementForm.productId} onChange={(e) => setMovementForm({ ...movementForm, productId: e.target.value })}>
              <option value="">Producto</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}{product.sku ? ` - ${product.sku}` : ''}
                </option>
              ))}
            </select>
            <select className="ctrl-input" value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value as StockMovementType })}>
              <option value="IN">Ingreso</option>
              <option value="OUT">Egreso</option>
              <option value="SALE">Venta</option>
              <option value="ADJUSTMENT">Ajuste</option>
            </select>
            <input className="ctrl-input" type="number" min="1" step="1" placeholder="Cantidad" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
            <input className="ctrl-input" placeholder="Motivo" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} />
            <textarea className="ctrl-input md:col-span-2 xl:col-span-5" placeholder="Nota" value={movementForm.note} onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-600/70">
            <button
              onClick={() => createMovement.mutate()}
              disabled={!movementForm.productId || !movementForm.reason || createMovement.isPending}
              className="btn-primary"
            >
              {createMovement.isPending && <Loader2 size={16} className="animate-spin" />}
              Registrar
            </button>
            <button onClick={() => setShowMovementForm(false)} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {showCashForm && (
        <div className="interactive-card mb-6 border-l-4 border-l-amber-600 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Movimiento de caja</h2>
            <button onClick={() => setShowCashForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select className="ctrl-input" value={cashForm.type} onChange={(e) => setCashForm({ ...cashForm, type: e.target.value as 'INCOME' | 'EXPENSE' })}>
              <option value="INCOME">Ingreso</option>
              <option value="EXPENSE">Egreso</option>
            </select>
            <input className="ctrl-input" placeholder="Categoria *" value={cashForm.category} onChange={(e) => setCashForm({ ...cashForm, category: e.target.value })} />
            <input className="ctrl-input" type="number" min="0" step="0.01" placeholder="Importe *" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} />
            <input className="ctrl-input" placeholder="Metodo de pago" value={cashForm.paymentMethod} onChange={(e) => setCashForm({ ...cashForm, paymentMethod: e.target.value })} />
            <input className="ctrl-input" placeholder="Referencia" value={cashForm.reference} onChange={(e) => setCashForm({ ...cashForm, reference: e.target.value })} />
            <textarea className="ctrl-input md:col-span-2 xl:col-span-5" placeholder="Nota" value={cashForm.note} onChange={(e) => setCashForm({ ...cashForm, note: e.target.value })} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-600/70">
            <button
              onClick={() => createCash.mutate()}
              disabled={!cashForm.category || !cashForm.amount || createCash.isPending}
              className="btn-primary"
            >
              {createCash.isPending && <Loader2 size={16} className="animate-spin" />}
              Registrar
            </button>
            <button onClick={() => setShowCashForm(false)} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {showCategoryForm && (
        <div className="interactive-card mb-6 border-l-4 border-l-slate-500 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr_auto]">
            <input className="ctrl-input" placeholder="Categoria *" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
            <input className="ctrl-input" placeholder="Descripcion" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={() => createCategory.mutate()} disabled={!categoryForm.name || createCategory.isPending} className="btn-primary">
                {createCategory.isPending && <Loader2 size={16} className="animate-spin" />}
                Guardar
              </button>
              <button onClick={() => setShowCategoryForm(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="interactive-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-600/70 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <select className="ctrl-input w-full md:w-56" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Todas las categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <select className="ctrl-input w-full md:w-44" value={stockState} onChange={(e) => setStockState(e.target.value as typeof stockState)}>
                <option value="all">Todos</option>
                <option value="active">Con stock</option>
                <option value="low">Stock bajo</option>
                <option value="out">Sin stock</option>
              </select>
            </div>
            <p className="text-sm font-semibold text-slate-500">{productsQuery.data?.total ?? 0} productos</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="animate-spin text-primary-500" size={36} />
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center">
              <Archive size={44} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-600">No hay productos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-600/70 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-5 py-3 font-bold">Producto</th>
                    <th className="px-5 py-3 font-bold">Categoria</th>
                    <th className="px-5 py-3 font-bold">Stock</th>
                    <th className="px-5 py-3 font-bold">Precio</th>
                    <th className="px-5 py-3 text-right font-bold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-white/60 transition-colors hover:bg-primary-50/50 dark:bg-slate-900/10 dark:hover:bg-slate-700/50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700">
                            {product.image ? (
                              <img src={product.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Package size={19} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">{product.name}</p>
                            <p className="mt-0.5 text-xs font-semibold text-slate-400">{product.sku || 'Sin SKU'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{product.category?.name ?? 'Sin categoria'}</td>
                      <td className="px-5 py-4">
                        <span className={clsx('inline-flex rounded-lg border px-2.5 py-1 text-xs font-black', stockTone(product))}>
                          {stockLabel(product)}: {product.stockQuantity}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-black text-slate-900">{formatMoney(product.price)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => quickSale.mutate(product)}
                            disabled={product.stockQuantity <= 0 || quickSale.isPending}
                            className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ShoppingCart size={14} className="inline" /> Venta
                          </button>
                          <button onClick={() => openEditProduct(product)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Archivar ${product.name}?`)) deleteProduct.mutate(product.id)
                            }}
                            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="interactive-card overflow-hidden">
          {movementsQuery.isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="animate-spin text-primary-500" size={36} />
            </div>
          ) : movements.length === 0 ? (
            <div className="py-20 text-center">
              <ClipboardList size={44} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-600">No hay movimientos</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/70">
              {movements.map((movement) => (
                <div key={movement.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl border', movementTone(movement.type))}>
                      {movement.type === 'IN' || movement.type === 'ADJUSTMENT' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{movement.product?.name ?? 'Producto archivado'}</p>
                      <p className="text-xs font-semibold text-slate-500">{movement.reason}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={clsx('rounded-lg border px-2.5 py-1 text-xs font-black', movementTone(movement.type))}>
                      {movementLabel(movement.type)}
                    </span>
                    <span className="font-black text-slate-900">{movement.quantity} u.</span>
                    <span className="font-semibold text-slate-400">{new Date(movement.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cash' && (
        <div className="interactive-card overflow-hidden">
          {cashQuery.isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="animate-spin text-primary-500" size={36} />
            </div>
          ) : cashTransactions.length === 0 ? (
            <div className="py-20 text-center">
              <Banknote size={44} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-600">No hay movimientos de caja</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/70">
              {cashTransactions.map((transaction) => (
                <div key={transaction.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'flex h-10 w-10 items-center justify-center rounded-xl border',
                      transaction.type === 'INCOME' ? metricTone('success') : metricTone('warning')
                    )}>
                      {transaction.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{transaction.category}</p>
                      <p className="text-xs font-semibold text-slate-500">{transaction.paymentMethod || 'Sin metodo'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
                    <span className={clsx('font-black', transaction.type === 'INCOME' ? 'text-emerald-700' : 'text-amber-700')}>
                      {transaction.type === 'INCOME' ? '+' : '-'}{formatMoney(transaction.amount)}
                    </span>
                    <span className="font-semibold text-slate-400">{new Date(transaction.occurredAt).toLocaleDateString()}</span>
                    <button
                      onClick={() => deleteCash.mutate(transaction.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="interactive-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-600/70">
            <p className="text-sm font-bold text-slate-500">{categories.length} categorias</p>
            <button onClick={() => setShowCategoryForm(true)} className="btn-secondary">
              <Plus size={16} />
              Categoria
            </button>
          </div>
          {categories.length === 0 ? (
            <div className="py-20 text-center">
              <Tags size={44} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-600">No hay categorias</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800/70">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">{category.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{category.description || 'Sin descripcion'}</p>
                    </div>
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  </div>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {category.productCount} productos
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
