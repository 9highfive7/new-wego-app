/// <reference types="@types/google.maps" />
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
if (!apiKey) throw new Error('Missing env: VITE_GOOGLE_MAPS_API_KEY')

let loading: Promise<void> | null = null
export function loadGoogle(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(s)
  })
  return loading
}