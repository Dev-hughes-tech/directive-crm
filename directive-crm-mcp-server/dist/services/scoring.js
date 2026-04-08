import { LEAD_SCORE_DEFAULTS, STORM_RISK_THRESHOLDS } from '../constants.js';
export function scoreLead(options) {
    let score = LEAD_SCORE_DEFAULTS.baseScore;
    const reasons = [];
    // Roof age scoring
    if (options.roofAgeYears !== null && options.roofAgeYears !== undefined) {
        if (options.roofAgeYears >= 20) {
            score += LEAD_SCORE_DEFAULTS.roofAge20Plus;
            reasons.push(`Roof age ${options.roofAgeYears} years (20+ years = high replacement urgency)`);
        }
        else if (options.roofAgeYears >= 15) {
            score += LEAD_SCORE_DEFAULTS.roofAge15To20;
            reasons.push(`Roof age ${options.roofAgeYears} years (15-19 years = moderate replacement need)`);
        }
    }
    // Phone number scoring
    if (options.ownerPhone) {
        score += LEAD_SCORE_DEFAULTS.hasPhoneNumber;
        reasons.push('Owner phone number available');
    }
    // Market value scoring
    if (options.marketValue && options.marketValue > 200000) {
        score += LEAD_SCORE_DEFAULTS.highMarketValue;
        reasons.push(`Market value $${options.marketValue.toLocaleString()} (>$200k)`);
    }
    // Permit penalty
    if (options.permitCount && options.permitCount > 0) {
        score += LEAD_SCORE_DEFAULTS.hasPermits;
        reasons.push(`${options.permitCount} recent permit(s) (may indicate recent work)`);
    }
    // Clamp to min/max
    score = Math.max(LEAD_SCORE_DEFAULTS.minScore, Math.min(LEAD_SCORE_DEFAULTS.maxScore, score));
    // Determine confidence based on available data
    const dataPoints = [
        options.roofAgeYears !== null && options.roofAgeYears !== undefined,
        options.ownerPhone !== null && options.ownerPhone !== undefined,
        options.marketValue !== null && options.marketValue !== undefined,
        options.permitCount !== null && options.permitCount !== undefined,
    ].filter(Boolean).length;
    let confidence = 'Low';
    if (dataPoints >= 3) {
        confidence = 'High';
    }
    else if (dataPoints >= 2) {
        confidence = 'Medium';
    }
    return { score, confidence, reasons };
}
export function assessStormRisk(options) {
    const { alerts, hailEvents, recentHailDays = 365 } = options;
    let score = 0;
    const factors = [];
    // Check for high severity alerts
    const severeAlerts = alerts.filter((a) => STORM_RISK_THRESHOLDS.highAlert.includes(a.event));
    if (severeAlerts.length > 0) {
        score += 40;
        factors.push(`${severeAlerts.length} active severe weather alert(s): ${severeAlerts.map((a) => a.event).join(', ')}`);
    }
    // Check for moderate alerts
    const moderateAlerts = alerts.filter((a) => !STORM_RISK_THRESHOLDS.highAlert.includes(a.event) &&
        STORM_RISK_THRESHOLDS.moderateAlert.includes(a.event));
    if (moderateAlerts.length > 0) {
        score += 15;
        factors.push(`${moderateAlerts.length} active moderate weather alert(s): ${moderateAlerts.map((a) => a.event).join(', ')}`);
    }
    // Check for recent large hail
    const recentLargeHail = hailEvents.filter((h) => {
        const days = Math.floor((Date.now() - new Date(h.date).getTime()) / (1000 * 60 * 60 * 24));
        return days <= recentHailDays && h.size >= STORM_RISK_THRESHOLDS.highHailSize;
    });
    if (recentLargeHail.length > 0) {
        score += 30;
        factors.push(`${recentLargeHail.length} large hail event(s) in past ${recentHailDays} days (>${STORM_RISK_THRESHOLDS.highHailSize}")`);
    }
    // Check for any hail in past 90 days
    const recentAnyHail = hailEvents.filter((h) => {
        const days = Math.floor((Date.now() - new Date(h.date).getTime()) / (1000 * 60 * 60 * 24));
        return days <= 90;
    });
    if (recentAnyHail.length > 0 && recentLargeHail.length === 0) {
        score += 10;
        factors.push(`${recentAnyHail.length} hail event(s) in past 90 days`);
    }
    if (factors.length === 0) {
        factors.push('No significant storm activity detected');
    }
    // Determine risk level
    let riskLevel = 'Low';
    if (score >= 40) {
        riskLevel = 'High';
    }
    else if (score >= 20) {
        riskLevel = 'Moderate';
    }
    return { riskLevel, score, factors };
}
export function truncateOutput(text, limit) {
    if (text.length <= limit) {
        return text;
    }
    return text.substring(0, limit - 100) + '\n\n[Output truncated due to length limit]';
}
export function formatMarkdown(data) {
    const lines = [];
    for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) {
            lines.push(`**${key}:** —`);
        }
        else if (typeof value === 'object') {
            lines.push(`**${key}:**`);
            if (Array.isArray(value)) {
                if (value.length === 0) {
                    lines.push('  None');
                }
                else {
                    value.forEach((item) => {
                        if (typeof item === 'object') {
                            lines.push(`  - ${JSON.stringify(item)}`);
                        }
                        else {
                            lines.push(`  - ${item}`);
                        }
                    });
                }
            }
            else {
                lines.push(`\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``);
            }
        }
        else if (typeof value === 'boolean') {
            lines.push(`**${key}:** ${value ? 'Yes' : 'No'}`);
        }
        else {
            lines.push(`**${key}:** ${value}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=scoring.js.map