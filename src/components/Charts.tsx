import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PeriodBucket, TrackSample } from '@/utils/stats'

/**
 * Graficos del reporte y de las estadisticas.
 * Los colores se toman de las variables CSS del tema para que respeten el modo
 * claro y oscuro sin duplicar la paleta.
 */

const AXIS = { stroke: 'var(--text-dim)', fontSize: 11 }
const GRID = 'var(--border)'

const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--text)',
  boxShadow: 'var(--shadow-md)',
}

export function SpeedChart({ data, unitLabel }: { data: TrackSample[]; unitLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="minute"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          unit=" min"
          minTickGap={28}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value) => `${value} min`}
          formatter={(value: number) => [`${value} ${unitLabel}`, 'Velocidad']}
        />
        <Area
          type="monotone"
          dataKey="speed"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#speedFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function ElevationChart({ data }: { data: TrackSample[] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="km" tick={AXIS} tickLine={false} axisLine={false} unit=" km" minTickGap={28} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={['dataMin - 5', 'dataMax + 5']} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value) => `${value} km`}
          formatter={(value: number) => [`${value} m`, 'Altitud']}
        />
        <Area
          type="monotone"
          dataKey="altitude"
          stroke="var(--info)"
          strokeWidth={2}
          fill="url(#elevationFill)"
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PeriodBarChart({ data, unitLabel }: { data: PeriodBucket[]; unitLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={tooltipStyle}
          formatter={(value: number) => [`${value} ${unitLabel}`, 'Distancia']}
        />
        <Bar dataKey="km" fill="var(--accent)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
