'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_CENTER } from './property-meta'

export type MapPin = { id: string; lat: number; lng: number; label: string; color: string; popup?: string }

/**
 * Mapa de OpenStreetMap con Leaflet. Sólo corre en el navegador: se carga con `dynamic`
 * y `ssr: false`. Los pines son etiquetas HTML (precio) para no depender de imágenes.
 */
export default function LeafletMap({ pins, selectedId, onSelect, onPick, picked, className = 'h-full w-full', fitToPins = true }: {
  pins?: MapPin[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Modo selector: un clic en el mapa elige la ubicación. */
  onPick?: (lat: number, lng: number) => void
  picked?: { lat: number; lng: number } | null
  className?: string
  fitToPins?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const pickMarker = useRef<L.Marker | null>(null)
  const onPickRef = useRef(onPick)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onPickRef.current = onPick; onSelectRef.current = onSelect })

  useEffect(() => {
    if (!container.current || map.current) return
    const instance = L.map(container.current, { zoomControl: true, attributionControl: true }).setView(picked ? [picked.lat, picked.lng] : DEFAULT_CENTER, picked ? 15 : 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(instance)
    layer.current = L.layerGroup().addTo(instance)
    instance.on('click', (event: L.LeafletMouseEvent) => onPickRef.current?.(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))))
    map.current = instance
    // El contenedor puede medir 0 al montar dentro de un modal: se recalcula enseguida.
    const timer = window.setTimeout(() => instance.invalidateSize(), 150)
    return () => { window.clearTimeout(timer); instance.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una sola vez.
  }, [])

  useEffect(() => {
    const instance = map.current
    const group = layer.current
    if (!instance || !group || !pins) return
    group.clearLayers()
    for (const pin of pins) {
      const active = pin.id === selectedId
      const icon = L.divIcon({
        className: '',
        html: `<span style="display:inline-flex;transform:translate(-50%,-100%);white-space:nowrap;border-radius:999px;padding:3px 9px;font:700 11px/1.4 system-ui,sans-serif;color:#fff;background:${pin.color};box-shadow:0 2px 6px rgba(0,0,0,.35);outline:${active ? '3px solid #fff' : 'none'};position:relative">${pin.label.replace(/</g, '&lt;')}</span>`,
        iconSize: [0, 0],
      })
      const marker = L.marker([pin.lat, pin.lng], { icon, zIndexOffset: active ? 1000 : 0 }).addTo(group)
      if (pin.popup) marker.bindPopup(pin.popup, { closeButton: false, offset: [0, -22] })
      marker.on('click', () => onSelectRef.current?.(pin.id))
    }
    if (fitToPins && pins.length) {
      const bounds = L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng] as [number, number]))
      instance.fitBounds(bounds.pad(0.2), { maxZoom: 15 })
    }
  }, [pins, selectedId, fitToPins])

  useEffect(() => {
    const instance = map.current
    if (!instance || !selectedId || !pins) return
    const pin = pins.find((item) => item.id === selectedId)
    if (pin) instance.setView([pin.lat, pin.lng], Math.max(instance.getZoom(), 15), { animate: true })
  }, [selectedId, pins])

  useEffect(() => {
    const instance = map.current
    if (!instance || onPick === undefined) return
    if (!picked) { pickMarker.current?.remove(); pickMarker.current = null; return }
    const icon = L.divIcon({ className: '', html: '<span style="display:block;width:18px;height:18px;transform:translate(-50%,-50%);border-radius:50%;background:#d7020e;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span>', iconSize: [0, 0] })
    if (pickMarker.current) pickMarker.current.setLatLng([picked.lat, picked.lng])
    else pickMarker.current = L.marker([picked.lat, picked.lng], { icon }).addTo(instance)
  }, [picked, onPick])

  return <div ref={container} className={className} />
}
