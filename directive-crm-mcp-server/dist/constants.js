export const API_BASE_URL = 'https://www.directivecrm.com';
export const CHARACTER_LIMIT = 25000;
// Lead Scoring Weights
export const LEAD_SCORE_DEFAULTS = {
    baseScore: 50,
    roofAge20Plus: 35,
    roofAge15To20: 20,
    hasPhoneNumber: 15,
    highMarketValue: 10, // marketValue > 200000
    hasPermits: -10, // permitCount > 0
    minScore: 10,
    maxScore: 99,
};
// Storm Risk Scoring
export const STORM_RISK_THRESHOLDS = {
    highAlert: 'Severe Thunderstorm,Tornado',
    moderateAlert: 'Winter Storm,Wind Advisory',
    highHailSize: 0.75, // inches
    recentDays: 365,
};
//# sourceMappingURL=constants.js.map