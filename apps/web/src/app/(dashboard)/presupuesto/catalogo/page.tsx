'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Upload, Plus, ArrowLeft, ChevronLeft, ChevronRight,
  Check, X, Pencil, Eye, EyeOff, RefreshCw, AlertTriangle,
} from 'lucide-react';
import {
  getCatalogItems, updateCatalogItem, deleteCatalogItem, importCatalogFromExcel,
  type CatalogItem,
} from '@/lib/api';

const LIMIT = 50;

export default function CatalogoPage() {
  const router = useRouter();

  const [items,   setItems]   = useState<CatalogItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const [search,     setSearch]     = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editId,    setEditId]    = useState<string | null>(null);
  const [editHoras, setEditHoras] = useState('');
  const [editDesc,  setEditDesc]  = useState('');
  const [saving,    setSaving]    = useState(false);

  const [loadError,   setLoadError]   = useState('');
  const [importing,   setImporting]   = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load(page, search, showInactive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, showInactive]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, search, showInactive); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function load(p: number, q: string, inclInactive: boolean) {
    setLoading(true);
    setLoadError('');
    try {
      const res = await getCatalogItems({
        search:     q || undefined,
        page:       p,
        limit:      LIMIT,
        activeOnly: !inclInactive,
      });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Error al cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: CatalogItem) {
    setEditId(item.id);
    setEditHoras(String(item.horas));
    setEditDesc(item.descripcionFinal);
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    const horas = parseFloat(editHoras.replace(',', '.'));
    if (isNaN(horas) || horas < 0) return;
    setSaving(true);
    try {
      const updated = await updateCatalogItem(id, { horas, descripcionFinal: editDesc.trim() || undefined });
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setEditId(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: CatalogItem) {
    if (item.active) {
      await deleteCatalogItem(item.id);
    } else {
      await updateCatalogItem(item.id, { active: true });
    }
    load(page, search, showInactive);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importCatalogFromExcel(file);
      setImportResult(result);
      load(1, search, showInactive);
      setPage(1);
    } catch (err: any) {
      setImportResult({ created: 0, updated: 0, errors: [err.message ?? 'Error al importar'] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Catálogo de trabajos</h1>
            <p className="text-xs text-slate-500">{total} ítems{showInactive ? ' (incluye inactivos)' : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showInactive
                ? 'border-slate-300 bg-slate-100 text-slate-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showInactive ? 'Mostrando inactivos' : 'Ver inactivos'}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {importing
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />
            }
            Importar Excel
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`flex-shrink-0 px-6 py-3 flex items-start gap-3 text-sm ${
          importResult.errors.length > 0 ? 'bg-amber-50 border-b border-amber-200' : 'bg-emerald-50 border-b border-emerald-200'
        }`}>
          <div className="flex-1">
            <span className="font-semibold">
              Importación completada: {importResult.created} creados, {importResult.updated} actualizados.
            </span>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {importResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {e}
                  </li>
                ))}
                {importResult.errors.length > 5 && (
                  <li className="text-xs text-amber-600">...y {importResult.errors.length - 5} errores más</li>
                )}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-slate-100">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por pieza, proceso, descripción..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-40 text-red-500 gap-2">
            <AlertTriangle className="h-8 w-8 opacity-50" />
            <p className="text-sm font-medium">{loadError}</p>
            <button onClick={() => load(page, search, showInactive)} className="text-xs text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
            <Search className="h-8 w-8 opacity-30" />
            <p className="text-sm">Sin resultados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[180px]">Pieza</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[120px]">Proceso</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Tipo daño</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[80px]">Horas</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[80px]">Estado</th>
                <th className="w-[100px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const isEditing = editId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${!item.active ? 'opacity-40' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-800">{item.pieza}</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-mono">{item.codigoPosicion}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {item.proceso}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{item.tipoDano}</td>

                    {/* Descripción — editable */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      ) : (
                        <span className="text-xs text-slate-600 truncate block max-w-xs">{item.descripcionFinal}</span>
                      )}
                    </td>

                    {/* Horas — editable */}
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          value={editHoras}
                          onChange={e => setEditHoras(e.target.value)}
                          inputMode="decimal"
                          className="w-16 text-xs text-right border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      ) : (
                        <span className="text-xs font-mono font-semibold text-slate-800">{Number(item.horas).toFixed(2)}h</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {item.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(item.id)}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                              title="Guardar"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                              title="Editar horas / descripción"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => toggleActive(item)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                item.active
                                  ? 'hover:bg-red-50 text-slate-300 hover:text-red-500'
                                  : 'hover:bg-emerald-50 text-slate-300 hover:text-emerald-600'
                              }`}
                              title={item.active ? 'Desactivar' : 'Reactivar'}
                            >
                              {item.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
          <span className="text-xs text-slate-500">
            Página {page} de {pages} · {total} ítems
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
