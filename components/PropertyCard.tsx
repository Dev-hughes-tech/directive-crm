'use client'

import { Navigation, Phone, Mail } from 'lucide-react'
import StreetView from '@/components/StreetView'
import AerialView from '@/components/AerialView'
import { calculateLeadScore } from '@/lib/scoring'
import type { Property } from '@/lib/types'

interface PropertyCardProps {
  property: Property
}

function getFlagColor(flag: string): string {
  if (flag === 'old-roof' || flag === 'estimated-roof-age') return 'bg-amber/10 text-amber border border-amber/30'
  if (flag === 'high-value') return 'bg-green/10 text-green border border-green/30'
  if (flag === 'investor-owned' || flag === 'rental') return 'bg-purple/10 text-purple border border-purple/30'
  if (flag === 'listed-for-sale') return 'bg-red/10 text-red border border-red/30'
  if (flag === 'owner-occupied') return 'bg-cyan/10 text-cyan border border-cyan/30'
  if (flag === 'recently-sold') return 'bg-blue/10 text-blue border border-blue/30'
  return 'bg-gray/10 text-gray border border-gray/30'
}

export function PropertyCard({ property }: PropertyCardProps) {
  const score = calculateLeadScore(property)

  return (
    <div className="glass p-6 rounded-lg space-y-4">
      {/* Header: Address + County + Source + Score */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{property.address}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {property.county || '—'} •{' '}
              {property.sources && Object.keys(property.sources).length > 0
                ? Object.keys(property.sources).join(', ')
                : '—'}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-cyan">{score}</span>
              <span className="text-xs text-gray-400">/100</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">LEAD SCORE</p>
          </div>
        </div>
      </div>

      {/* Navigation Button */}
      <div className="flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(property.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 text-xs px-3 py-2 rounded-lg transition-all"
        >
          <Navigation className="w-3.5 h-3.5" />
          Navigate to Property
        </a>
        <a
          href={`tel:${property.owner_phone}`}
          className={`flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg transition-all ${
            property.owner_phone
              ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
              : 'bg-gray-800 text-gray-600 border border-gray-700 pointer-events-none'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          Call
        </a>
      </div>

      {/* Street View + Aerial View Side by Side */}
      <div className="border-t border-white/5 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <StreetView lat={property.lat} lng={property.lng} address={property.address} className="h-40 w-full rounded" />
          <AerialView address={property.address} className="h-40 w-full rounded" />
        </div>
      </div>

      {/* OWNER Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Owner</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Name:</span>
            <span className="text-white">{property.owner_name || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Phone:</span>
            {property.owner_phone ? (
              <a href={`tel:${property.owner_phone}`} className="text-cyan hover:text-cyan/80 flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {property.owner_phone}
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Email:</span>
            {property.owner_email ? (
              <a href={`mailto:${property.owner_email}`} className="text-cyan hover:text-cyan/80 flex items-center gap-1">
                <Mail className="w-4 h-4" />
                <span className="truncate">{property.owner_email}</span>
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
          {property.owner_age && (
            <div className="flex justify-between">
              <span className="text-gray-400">Age:</span>
              <span className="text-white">{property.owner_age}</span>
            </div>
          )}
          {property.occupancy_type && (
            <div className="flex justify-between">
              <span className="text-gray-400">Occupancy:</span>
              <span className="text-white">{property.occupancy_type}</span>
            </div>
          )}
        </div>
      </div>

      {/* PROPERTY Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Property</h4>
        <div className="space-y-1 text-sm">
          {property.year_built && (
            <div className="flex justify-between">
              <span className="text-gray-400">Year Built:</span>
              <span className="text-white">{property.year_built}</span>
            </div>
          )}
          {property.sqft && (
            <div className="flex justify-between">
              <span className="text-gray-400">Sqft:</span>
              <span className="text-white">{property.sqft.toLocaleString()}</span>
            </div>
          )}
          {property.lot_sqft && (
            <div className="flex justify-between">
              <span className="text-gray-400">Lot Size:</span>
              <span className="text-white">{property.lot_sqft.toLocaleString()} sqft</span>
            </div>
          )}
          {(property.bedrooms !== null || property.bathrooms !== null) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Beds/Baths:</span>
              <span className="text-white">
                {property.bedrooms || '—'} bd / {property.bathrooms || '—'} ba
              </span>
            </div>
          )}
          {property.property_class && (
            <div className="flex justify-between">
              <span className="text-gray-400">Property Class:</span>
              <span className="text-white">{property.property_class}</span>
            </div>
          )}
          {property.land_use && (
            <div className="flex justify-between">
              <span className="text-gray-400">Land Use:</span>
              <span className="text-white">{property.land_use}</span>
            </div>
          )}
          {property.subdivision && (
            <div className="flex justify-between">
              <span className="text-gray-400">Subdivision:</span>
              <span className="text-white">{property.subdivision}</span>
            </div>
          )}
          {property.neighborhood && (
            <div className="flex justify-between">
              <span className="text-gray-400">Neighborhood:</span>
              <span className="text-white">{property.neighborhood}</span>
            </div>
          )}
        </div>
      </div>

      {/* VALUATION Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Valuation</h4>
        <div className="space-y-1 text-sm">
          {property.market_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Market Value:</span>
              <span className="text-white">${property.market_value.toLocaleString()}</span>
            </div>
          )}
          {property.assessed_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Assessed Value:</span>
              <span className="text-white">${property.assessed_value.toLocaleString()}</span>
            </div>
          )}
          {property.appraised_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Appraised Value:</span>
              <span className="text-white">${property.appraised_value.toLocaleString()}</span>
            </div>
          )}
          {(property.last_sale_date || property.last_sale_price) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Last Sale:</span>
              <span className="text-white">
                {property.last_sale_date ? property.last_sale_date : '—'}
                {property.last_sale_price ? ` @ $${property.last_sale_price.toLocaleString()}` : ''}
              </span>
            </div>
          )}
          {property.listing_status && (
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="text-white">{property.listing_status}</span>
            </div>
          )}
          {property.listing_price && (
            <div className="flex justify-between">
              <span className="text-gray-400">Listing Price:</span>
              <span className="text-white">${property.listing_price.toLocaleString()}</span>
            </div>
          )}
          {property.hoa_monthly && (
            <div className="flex justify-between">
              <span className="text-gray-400">HOA Monthly:</span>
              <span className="text-white">${property.hoa_monthly.toLocaleString()}</span>
            </div>
          )}
          {property.tax_annual && (
            <div className="flex justify-between">
              <span className="text-gray-400">Annual Tax:</span>
              <span className="text-white">${property.tax_annual.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ROOF Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Roof</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Roof Age:</span>
            <span className="text-white">
              {property.roof_age_years !== null
                ? `${property.roof_age_years} years${property.roof_age_estimated ? ' (est)' : ''}`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Permits:</span>
            <span className="text-white">
              {property.permit_count !== null ? `${property.permit_count} on record` : 'Not verified'}
            </span>
          </div>
          {property.permit_count && property.permit_count > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Last Permit:</span>
              <span className="text-white">{property.permit_last_date || '—'}</span>
            </div>
          )}
        </div>
      </div>

      {/* ROOF MEASUREMENTS — Powered by Google Solar */}
      {property.roof_area_sqft && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-bold text-cyan uppercase tracking-wider">Roof Measurements</h4>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-lg font-bold text-white">{property.roof_area_sqft?.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">Total Sq Ft</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{property.roof_pitch}</p>
              <p className="text-[10px] text-gray-400">Pitch</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{property.roofing_squares}</p>
              <p className="text-[10px] text-gray-400">Squares</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-center text-sm">
            <div>
              <p className="text-sm font-bold text-white">{property.roof_segments}</p>
              <p className="text-[10px] text-gray-400">Roof Segments</p>
            </div>
            <div>
              <p className="text-sm font-bold text-white">×{property.pitch_multiplier}</p>
              <p className="text-[10px] text-gray-400">Pitch Multiplier</p>
            </div>
          </div>
          {property.satellite_image_url && (
            <div className="mt-3">
              <img
                src={property.satellite_image_url}
                alt="Satellite view"
                className="w-full rounded-lg border border-white/10"
              />
              <p className="text-[9px] text-gray-500 mt-1 text-center">
                Satellite imagery{' '}
                {property.roof_imagery_date ? `from ${property.roof_imagery_date}` : ''} •{' '}
                {property.roof_imagery_quality || 'Standard'} quality
              </p>
            </div>
          )}
        </div>
      )}

      {/* STORM HISTORY */}
      {property.storm_history && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Storm History (5yr)</h4>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                property.storm_history.stormRiskLevel === 'high'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : property.storm_history.stormRiskLevel === 'moderate'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : property.storm_history.stormRiskLevel === 'low'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {property.storm_history.stormRiskLevel.toUpperCase()} RISK
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Hail Events:</span>
              <span className="text-white">
                {property.storm_history.totalHailEvents} ({property.storm_history.severeHailCount} severe)
              </span>
            </div>
            {property.storm_history.maxHailSize && (
              <div className="flex justify-between">
                <span className="text-gray-400">Max Hail Size:</span>
                <span className="text-white">{property.storm_history.maxHailSize}" diameter</span>
              </div>
            )}
            {property.storm_history.lastHailDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Last Hail:</span>
                <span className="text-white">{property.storm_history.lastHailDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Tornadoes:</span>
              <span className={property.storm_history.totalTornadoEvents > 0 ? 'text-red-400 font-medium' : 'text-white'}>
                {property.storm_history.totalTornadoEvents} events
              </span>
            </div>
            {property.storm_history.lastTornadoDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Last Tornado:</span>
                <span className="text-red-400">{property.storm_history.lastTornadoDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">High Wind Events:</span>
              <span className="text-white">{property.storm_history.totalWindEvents}</span>
            </div>
            {property.storm_history.maxWindSpeed && (
              <div className="flex justify-between">
                <span className="text-gray-400">Max Wind Speed:</span>
                <span className="text-white">{property.storm_history.maxWindSpeed} mph</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEED Section - only show if any deed data exists */}
      {(property.deed_date || property.deed_type || property.deed_book) && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Deed</h4>
          <div className="space-y-1 text-sm">
            {property.deed_date && (
              <div className="flex justify-between">
                <span className="text-gray-400">Date:</span>
                <span className="text-white">{property.deed_date}</span>
              </div>
            )}
            {property.deed_type && (
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="text-white">{property.deed_type}</span>
              </div>
            )}
            {property.deed_book && (
              <div className="flex justify-between">
                <span className="text-gray-400">Book/Page:</span>
                <span className="text-white">{property.deed_book}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLAGS Section */}
      {property.flags && property.flags.length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Flags</h4>
          <div className="flex flex-wrap gap-2">
            {property.flags.map((flag) => (
              <span key={flag} className={`text-xs ${getFlagColor(flag)} px-2 py-1 rounded`}>
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SOURCES Section */}
      {property.sources && Object.keys(property.sources).length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Sources</h4>
          <div className="space-y-1 text-xs">
            {Object.entries(property.sources).map(([key, url]) => (
              <div key={key} className="flex justify-between items-center gap-2">
                <span className="text-gray-400">{key}:</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:text-cyan/80 truncate"
                >
                  {url.replace(/^https?:\/\//, '').slice(0, 40)}...
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
