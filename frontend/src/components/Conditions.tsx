import { Link } from '@tanstack/react-router'

import type {
  AirQuality,
  ForecastEntry,
  HourlyEntry,
  NowcastEntry,
  Observation,
  OverviewItem,
} from '../api/client'
import { aqiLevel } from '../lib/aqi'
import {
  beaufort,
  cloudLabel,
  dewPoint,
  humidityFeel,
  nextHourRain,
  precipitationAhead,
  pressureTrend,
  uvLevel,
  uvOutlook,
  versusNormal,
  visibilityLabel,
} from '../lib/insights'
import { skyFor } from '../lib/sky'
import { formatTime, toLocationTime } from '../lib/time'
import { compass, type Units } from '../lib/units'
import { Instrument, Meter, RainBars, Sparkline, WindDial } from './Instrument'

const dash = '–'
// Rounded up to 5 minutes: the nowcast's steps are 15 minutes, so it can't be more precise.
const minutesUntil = (iso: string, nowMs: number) =>
  Math.max(5, Math.ceil((Date.parse(iso) - nowMs) / 300_000) * 5)
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`

interface ConditionsProps {
  locationId: number
  obs: Observation
  /** The last 24 hours of readings, oldest first. */
  recent: readonly Observation[]
  forecast: readonly ForecastEntry[]
  /** Open-Meteo's hourly forecast and 15-minute rain nowcast (empty when unavailable). */
  hours: readonly HourlyEntry[]
  nowcast: readonly NowcastEntry[]
  air: AirQuality | null
  today: { high: number; low: number } | null
  normal: OverviewItem['normal']
  nowMs: number
  offset: number | null
  units: Units
}

/** Every reading as an instrument: its value, what it means and how it is moving. */
export function Conditions({
  locationId,
  obs,
  recent,
  forecast,
  hours,
  nowcast,
  air,
  today,
  normal,
  nowMs,
  offset,
  units,
}: ConditionsProps) {
  const series = <K extends keyof Observation>(key: K) => recent.map((r) => r[key] as number | null)
  // Temperature differences convert by scale alone (no offset).
  const tempDelta = (celsius: number) => Math.round(units.temp(celsius) - units.temp(0))
  const time = (iso: string) => formatTime(toLocationTime(iso, offset))

  const wind = obs.wind_speed
  const dew = obs.temp != null && obs.humidity != null ? dewPoint(obs.temp, obs.humidity) : null
  const trend = pressureTrend(recent)
  const ahead = precipitationAhead(forecast, nowMs)
  const amountNow = (obs.rain_1h ?? 0) + (obs.snow_1h ?? 0)
  const condition = skyFor(obs)
  const snowing = condition === 'snow' || (obs.snow_1h ?? 0) > 0
  const falling = amountNow > 0 || snowing || ['drizzle', 'rain', 'thunder'].includes(condition)
  const versus = versusNormal(today?.high, normal?.temp_max)
  const aqi = air ? aqiLevel(air.aqi) : null
  const soon = nextHourRain(nowcast, nowMs)
  const starting = !falling && soon?.summary.state === 'starting' ? soon.summary : null
  const uv = uvOutlook(hours, nowMs, offset)
  const uvLevelNow = uv ? uvLevel(uv.now) : null
  // A millimetre is 0.04 in, so inches need another decimal place.
  const digits = units.system === 'metric' ? 1 : 2

  return (
    <section className="instruments" aria-labelledby="conditions-heading">
      <h2 id="conditions-heading" className="visually-hidden">
        Conditions
      </h2>
      <Instrument
        label="Wind"
        value={wind == null ? dash : String(Math.round(units.wind(wind)))}
        unit={wind == null ? undefined : units.windLabel}
        detail={
          wind == null ? undefined : (
            <>
              {beaufort(wind).label}
              {obs.wind_deg != null ? ` · from ${compass(obs.wind_deg)}` : ''}
              {obs.wind_gust != null ? (
                <div>
                  Gusts {Math.round(units.wind(obs.wind_gust))} {units.windLabel}
                </div>
              ) : null}
            </>
          )
        }
        aside={obs.wind_deg != null ? <WindDial degrees={obs.wind_deg} /> : null}
      >
        <Sparkline values={series('wind_speed')} />
      </Instrument>

      <Instrument
        label="Humidity"
        value={obs.humidity == null ? dash : String(Math.round(obs.humidity))}
        unit={obs.humidity == null ? undefined : '%'}
        detail={
          dew == null ? undefined : (
            <>
              {humidityFeel(dew, obs.temp, obs.humidity!)} · dew point {Math.round(units.temp(dew))}
              °
            </>
          )
        }
      >
        <Sparkline values={series('humidity')} />
      </Instrument>

      <Instrument
        label="Pressure"
        value={obs.pressure == null ? dash : String(Math.round(obs.pressure))}
        unit={obs.pressure == null ? undefined : 'hPa'}
        detail={
          trend ? (
            <>
              <span className="trend-arrow" aria-hidden="true">
                {trend.change >= 1 ? '↗' : trend.change <= -1 ? '↘' : '→'}
              </span>{' '}
              {trend.label} · {signed(Math.round(trend.change * 10) / 10)} hPa in 3 h
            </>
          ) : undefined
        }
      >
        <Sparkline values={series('pressure')} />
      </Instrument>

      <Instrument
        label="Precipitation"
        value={
          amountNow > 0
            ? units.precip(amountNow).toFixed(digits)
            : falling
              ? 'Now'
              : starting
                ? String(minutesUntil(starting.at, nowMs))
                : ahead
                  ? String(Math.round(ahead.chance * 100))
                  : dash
        }
        unit={
          amountNow > 0
            ? `${units.precipLabel}/h`
            : !falling && starting
              ? 'min'
              : !falling && ahead
                ? '%'
                : undefined
        }
        detail={
          falling ? (
            <>
              {snowing ? 'Snowing now' : 'Raining now'}
              {soon?.summary.state === 'ongoing'
                ? soon.summary.until
                  ? ` · stopping around ${time(soon.summary.until)}`
                  : ' · for the next 2 hours at least'
                : ahead
                  ? ` · ${Math.round(ahead.chance * 100)}% chance in the next 6 h`
                  : ''}
            </>
          ) : starting ? (
            <>
              {starting.kind === 'snow' ? 'Snow' : 'Rain'} starting around {time(starting.at)}
            </>
          ) : ahead?.at && ahead.kind ? (
            <>
              {ahead.kind === 'snow' ? 'Snow' : 'Rain'} most likely around {time(ahead.at)}
              {ahead.amount >= 0.1
                ? ` · ${units.precip(ahead.amount).toFixed(digits)} ${units.precipLabel}`
                : ''}
            </>
          ) : ahead ? (
            'Dry for the next 6 hours'
          ) : soon ? (
            'Dry for the next 2 hours'
          ) : (
            'No forecast for the next few hours'
          )
        }
      >
        {soon ? (
          <RainBars slots={soon.slots} />
        ) : ahead ? (
          <Meter value={ahead.chance} label="Chance of precipitation" />
        ) : null}
      </Instrument>

      <Instrument
        label="UV index"
        value={uv ? String(Math.round(uv.now)) : dash}
        detail={
          uv && uvLevelNow ? (
            <>
              <span className={`status-dot status-dot-${uvLevelNow.role}`} aria-hidden="true" />
              {uvLevelNow.label} · {uvLevelNow.advice}
              {uv.peak ? (
                <div>
                  {uv.peak.tomorrow ? 'Tomorrow peaks at' : 'Peaks at'} {Math.round(uv.peak.uv)}{' '}
                  around {time(uv.peak.at)}
                </div>
              ) : uv.now >= 1 ? (
                <div>Past today&apos;s peak</div>
              ) : null}
            </>
          ) : (
            'Appears with the hourly forecast'
          )
        }
      >
        {uv ? <Meter value={uv.now / 11} label="UV index on a scale to 11" /> : null}
      </Instrument>

      <Instrument
        label="Cloud cover"
        value={obs.clouds == null ? dash : String(Math.round(obs.clouds))}
        unit={obs.clouds == null ? undefined : '%'}
        detail={obs.clouds == null ? undefined : cloudLabel(obs.clouds)}
      >
        {obs.clouds != null ? <Meter value={obs.clouds / 100} label="Cloud cover" /> : null}
      </Instrument>

      <Instrument
        label="Visibility"
        value={obs.visibility == null ? dash : units.distance(obs.visibility).toFixed(1)}
        unit={obs.visibility == null ? undefined : units.distanceLabel}
        detail={obs.visibility == null ? undefined : visibilityLabel(obs.visibility)}
      >
        {obs.visibility != null ? (
          <Meter value={obs.visibility / 10000} label="Visibility out of 10 km" />
        ) : null}
      </Instrument>

      <Instrument
        label="Air quality"
        value={aqi ? aqi.label : dash}
        detail={
          air ? (
            <>
              <span className={`status-dot status-dot-${aqi?.role ?? 'none'}`} aria-hidden="true" />
              AQI {air.aqi} of 5{air.pm2_5 != null ? ` · PM2.5 ${Math.round(air.pm2_5)} µg/m³` : ''}
              <div>
                <Link to="/locations/$locationId/air-quality" params={{ locationId }}>
                  Pollutants
                </Link>
              </div>
            </>
          ) : (
            'No reading yet'
          )
        }
      />

      <Instrument
        label="Versus normal"
        value={versus ? `${signed(tempDelta(versus.difference))}°` : dash}
        detail={
          versus && today && normal?.temp_max != null ? (
            <>
              {normal.record_high && today.high > normal.record_high.value
                ? 'Warmest on record for the date'
                : normal.record_low && today.low < normal.record_low.value
                  ? 'Coldest on record for the date'
                  : versus.notable
                    ? versus.difference > 0
                      ? 'Warmer than usual today'
                      : 'Colder than usual today'
                    : 'About usual for the date'}
              <div>
                High {Math.round(units.temp(today.high))}° · normal{' '}
                {Math.round(units.temp(normal.temp_max))}°
                {normal.record_high
                  ? ` · previous record ${Math.round(units.temp(normal.record_high.value))}° in ${normal.record_high.date.slice(0, 4)}`
                  : ''}
              </div>
            </>
          ) : normal?.temp_max != null ? (
            "Waiting for today's readings"
          ) : (
            'Appears once history is collected'
          )
        }
      />
    </section>
  )
}
