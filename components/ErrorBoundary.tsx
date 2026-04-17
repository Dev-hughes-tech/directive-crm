'use client'

import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        route: 'client/ErrorBoundary',
        msg: 'React render error',
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join(' | '),
        componentStack: info.componentStack?.split('\n').slice(0, 5).join(' | '),
      })
    )

    fetch('/api/observability/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'components/ErrorBoundary',
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        message: error.message,
        metadata: {
          stack: error.stack,
          componentStack: info.componentStack,
        },
      }),
      keepalive: true,
    }).catch(() => {})
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red/20 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold mb-2">Something went wrong</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-xs">
            This section encountered an error. Your data is safe.
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-cyan text-dark text-sm font-semibold rounded-lg hover:bg-cyan/90 transition-all"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
