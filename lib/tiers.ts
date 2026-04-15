// ===== Directive CRM — Subscription Tiers =====

export type UserRole = 'admin' | 'enterprise_manager' | 'enterprise_rep' | 'pro' | 'plus' | 'basic' | 'trial'

export interface TierConfig {
  name: string
  price: number | null
  color: string
  features: {
    dashboard: boolean
    territory: boolean
    sweep: boolean
    stormscope: boolean
    michael: boolean
    jobs: boolean
    clients: boolean
    proposals: boolean
    materials: boolean
    team: boolean
    settings: boolean
    // Limits
    maxProperties: number
    maxProposals: number
    maxClients: number
    multiUser: boolean
    exportPDF: boolean
    smartEstimates: boolean
    routeOptimize: boolean
    apiAccess: boolean
  }
}

export const TIER_CONFIGS: Record<UserRole, TierConfig> = {
  admin: {
    name: 'Admin',
    price: null,
    color: '#f59e0b',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: true,
      michael: true, jobs: true, clients: true, proposals: true,
      materials: true, team: true, settings: true,
      maxProperties: Infinity, maxProposals: Infinity, maxClients: Infinity,
      multiUser: true, exportPDF: true, smartEstimates: true,
      routeOptimize: true, apiAccess: true,
    },
  },
  enterprise_manager: {
    name: 'Enterprise',
    price: 1200,
    color: '#8b5cf6',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: true,
      michael: true, jobs: true, clients: true, proposals: true,
      materials: true, team: true, settings: true,
      maxProperties: Infinity, maxProposals: Infinity, maxClients: Infinity,
      multiUser: true, exportPDF: true, smartEstimates: true,
      routeOptimize: true, apiAccess: true,
    },
  },
  enterprise_rep: {
    name: 'Enterprise Rep',
    price: null,
    color: '#8b5cf6',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: true,
      michael: true, jobs: true, clients: true, proposals: true,
      materials: true, team: true, settings: false,
      maxProperties: Infinity, maxProposals: Infinity, maxClients: Infinity,
      multiUser: false, exportPDF: true, smartEstimates: true,
      routeOptimize: true, apiAccess: false,
    },
  },
  pro: {
    name: 'Pro',
    price: 575,
    color: '#06b6d4',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: true,
      michael: true, jobs: true, clients: true, proposals: true,
      materials: true, team: true, settings: true,
      maxProperties: 500, maxProposals: 200, maxClients: 200,
      multiUser: false, exportPDF: true, smartEstimates: true,
      routeOptimize: true, apiAccess: false,
    },
  },
  plus: {
    name: 'Plus',
    price: 325,
    color: '#22c55e',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: true,
      michael: true, jobs: true, clients: true, proposals: true,
      materials: true, team: false, settings: true,
      maxProperties: 200, maxProposals: 100, maxClients: 100,
      multiUser: false, exportPDF: true, smartEstimates: true,
      routeOptimize: false, apiAccess: false,
    },
  },
  basic: {
    name: 'Basic',
    price: 175,
    color: '#94a3b8',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: false,
      michael: false, jobs: false, clients: true, proposals: true,
      materials: true, team: false, settings: true,
      maxProperties: 50, maxProposals: 25, maxClients: 50,
      multiUser: false, exportPDF: false, smartEstimates: false,
      routeOptimize: false, apiAccess: false,
    },
  },
  trial: {
    name: 'Trial',
    price: 0,
    color: '#6b7280',
    features: {
      dashboard: true, territory: true, sweep: true, stormscope: false,
      michael: false, jobs: false, clients: true, proposals: false,
      materials: false, team: false, settings: true,
      maxProperties: 10, maxProposals: 3, maxClients: 10,
      multiUser: false, exportPDF: false, smartEstimates: false,
      routeOptimize: false, apiAccess: false,
    },
  },
}

export function getTierConfig(role: UserRole | string): TierConfig {
  return TIER_CONFIGS[role as UserRole] ?? TIER_CONFIGS.trial
}

export function canAccess(role: UserRole | string, feature: keyof TierConfig['features']): boolean {
  const config = getTierConfig(role)
  const val = config.features[feature]
  return val === true || val === Infinity || (typeof val === 'number' && val > 0)
}

export const TIER_DESCRIPTIONS = [
  {
    role: 'basic' as UserRole,
    name: 'Basic',
    price: 175,
    color: '#94a3b8',
    tagline: 'Get started with roofing intelligence',
    perks: [
      'GPS Sweep — unlimited address research',
      'Territory mapping',
      'CRM (up to 50 clients)',
      'Proposal builder (up to 25)',
      'Materials calculator',
    ],
    locked: ['StormScope', 'Michael AI', 'Jobs pipeline', 'Team chat', 'PDF export'],
  },
  {
    role: 'plus' as UserRole,
    name: 'Plus',
    price: 325,
    color: '#22c55e',
    tagline: 'AI-powered lead generation included',
    perks: [
      'Everything in Basic',
      'StormScope storm damage leads',
      'Michael AI lead engine',
      'Jobs pipeline',
      'PDF export',
      'Up to 200 properties & clients',
    ],
    locked: ['Team chat', 'Route optimization', 'Multi-user'],
  },
  {
    role: 'pro' as UserRole,
    name: 'Pro',
    price: 575,
    color: '#06b6d4',
    tagline: 'Full platform — solo closer',
    perks: [
      'Everything in Plus',
      'Team chat',
      'Route optimization',
      'Smart estimates',
      'Up to 500 properties & clients',
    ],
    locked: ['Multi-user accounts', 'API access'],
  },
  {
    role: 'enterprise_manager' as UserRole,
    name: 'Enterprise',
    price: 1200,
    color: '#8b5cf6',
    tagline: '4 sales reps + 1 manager account',
    perks: [
      'Everything in Pro',
      '4 sales rep accounts',
      '1 manager account',
      'Unlimited properties & clients',
      'API access',
      'Priority support',
    ],
    locked: [],
  },
]
