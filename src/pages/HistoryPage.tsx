import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RideCard } from '@/components/RideCard'
import { EmptyState, Notice, Segmented, SkeletonList } from '@/components/ui'
import { useRides } from '@/hooks/useRides'
import { useSettings } from '@/hooks/useSettings'
import type { RideListItem } from '@/services/ridesRepository'

type SortKey = 'date' | 'distance' | 'speed' | 'duration'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'date', label: 'Fecha' },
  { value: 'distance', label: 'Distancia' },
  { value: 'speed', label: 'Velocidad' },
  { value: 'duration', label: 'Duración' },
]

/** "Mis carreras": listado ordenable de todo el historial. */
export function HistoryPage() {
  const { rides, loading, error, reload } = useRides()
  const { settings } = useSettings()
  const [sort, setSort] = useState<SortKey>('date')

  // El numero de carrera se asigna por orden cronologico, no por el orden actual.
  const numbering = useMemo(() => {
    const map = new Map<string, number>()
    const chronological = [...rides].sort((a, b) => a.startTime - b.startTime)
    chronological.forEach((ride, index) => map.set(ride.id, index + 1))
    return map
  }, [rides])

  const sorted = useMemo(() => sortRides(rides, sort), [rides, sort])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis carreras</h1>
          <p className="page-subtitle">
            {rides.length} {rides.length === 1 ? 'carrera registrada' : 'carreras registradas'}
          </p>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={reload}>
          ↻
        </button>
      </div>

      {rides.length > 1 && (
        <div style={{ overflowX: 'auto', paddingBottom: 'var(--gap-2)' }}>
          <Segmented value={sort} options={SORT_OPTIONS} onChange={setSort} />
        </div>
      )}

      {error && (
        <Notice tone="warn" icon="⚠️">
          {error}
        </Notice>
      )}

      <div className="stack" style={{ marginTop: 'var(--gap-4)' }}>
        {loading ? (
          <SkeletonList count={4} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="🚴"
            title="Todavía no hay carreras"
            description="Registra tu primera salida y aparecerá aquí."
            action={
              <Link to="/ride" className="btn btn--primary">
                Iniciar carrera
              </Link>
            }
          />
        ) : (
          sorted.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              index={numbering.get(ride.id)}
              settings={settings}
            />
          ))
        )}
      </div>
    </>
  )
}

function sortRides(rides: RideListItem[], key: SortKey): RideListItem[] {
  const copy = [...rides]
  switch (key) {
    case 'distance':
      return copy.sort((a, b) => b.distance - a.distance)
    case 'speed':
      return copy.sort((a, b) => b.averageSpeed - a.averageSpeed)
    case 'duration':
      return copy.sort((a, b) => b.duration - a.duration)
    default:
      return copy.sort((a, b) => b.startTime - a.startTime)
  }
}
