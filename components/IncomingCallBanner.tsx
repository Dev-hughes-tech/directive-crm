'use client'

import { Phone, PhoneOff, X } from 'lucide-react'

interface IncomingCallBannerProps {
  callerName: string
  callerPhone: string
  callerAddress?: string
  onAnswer: () => void
  onDecline: () => void
  onDismiss?: () => void
}

export default function IncomingCallBanner({
  callerName,
  callerPhone,
  callerAddress,
  onAnswer,
  onDecline,
  onDismiss,
}: IncomingCallBannerProps) {
  return (
    <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-dark-800 border-2 border-green-500 rounded-lg shadow-2xl p-4 w-96 animate-pulse">
        {/* Header with dismiss button */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <h3 className="text-sm font-bold text-white">Incoming Call</h3>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Caller info */}
        <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
          <p className="text-lg font-bold text-white truncate">{callerName}</p>
          <p className="text-sm text-gray-400 mt-0.5">{callerPhone}</p>
          {callerAddress && (
            <p className="text-xs text-gray-500 mt-1 truncate">{callerAddress}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onAnswer}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-all"
          >
            <Phone className="w-4 h-4" />
            Answer
          </button>
          <button
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-all"
          >
            <PhoneOff className="w-4 h-4" />
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}
