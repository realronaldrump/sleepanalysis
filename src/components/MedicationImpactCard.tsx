'use client';

import React from 'react';
import { CorrelationResult } from '@/types/analysis';
import { SLEEP_METRIC_LABELS, SLEEP_METRIC_DESCRIPTIONS } from '@/types/oura';

interface MedicationImpactCardProps {
    correlation: CorrelationResult;
}

/**
 * Card displaying the impact of a medication on a specific sleep metric
 */
export function MedicationImpactCard({ correlation }: MedicationImpactCardProps) {
    const {
        medication,
        drugClass,
        metric,
        pearsonR,
        pValue,
        effectSize,
        isSignificant,
        isHighlySignificant,
        meansComparison,
        direction,
        sampleSize,
        medicationNights,
        confidenceInterval,
    } = correlation;

    const metricLabel = SLEEP_METRIC_LABELS[metric as keyof typeof SLEEP_METRIC_LABELS] || metric;
    const metricDesc = SLEEP_METRIC_DESCRIPTIONS[metric as keyof typeof SLEEP_METRIC_DESCRIPTIONS];

    const getDirectionIcon = () => {
        if (direction === 'positive') return '↑';
        if (direction === 'negative') return '↓';
        return '—';
    };

    const getDirectionColor = () => {
        if (direction === 'positive') return 'text-green-400';
        if (direction === 'negative') return 'text-red-400';
        return 'text-gray-400';
    };

    const getSignificanceBadge = () => {
        if (isHighlySignificant) {
            return <span className="significance-high px-2 py-0.5 rounded text-xs">p &lt; 0.01</span>;
        }
        if (isSignificant) {
            return <span className="significance-medium px-2 py-0.5 rounded text-xs">p &lt; 0.05</span>;
        }
        return <span className="significance-low px-2 py-0.5 rounded text-xs">Not significant</span>;
    };

    const getEffectBadge = () => {
        const colors = {
            large: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
            medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            small: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            negligible: 'bg-gray-800 text-gray-500 border-gray-700',
        };

        return (
            <span className={`px-2 py-0.5 rounded text-xs border ${colors[effectSize]}`}>
                {effectSize.charAt(0).toUpperCase() + effectSize.slice(1)} effect
            </span>
        );
    };

    const getDrugClassBadge = () => {
        const colors: Record<string, string> = {
            sleep_aid: 'bg-sleep-deep/20 text-sleep-light',
            stimulant: 'bg-orange-500/20 text-orange-400',
            beta_blocker: 'bg-cyan-500/20 text-cyan-400',
            antipsychotic: 'bg-pink-500/20 text-pink-400',
            anxiolytic: 'bg-violet-500/20 text-violet-400',
            antidepressant: 'bg-indigo-500/20 text-indigo-400',
            supplement: 'bg-emerald-500/20 text-emerald-400',
            other: 'bg-gray-500/20 text-gray-400',
        };

        return (
            <span className={`px-2 py-0.5 rounded text-xs ${colors[drugClass] || colors.other}`}>
                {drugClass.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="card card-hover">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="font-semibold text-lg">{medication}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        {getDrugClassBadge()}
                        <span className="text-gray-500">→</span>
                        <span className="text-sm text-gray-300">{metricLabel}</span>
                    </div>
                </div>
                <div className={`text-3xl font-bold ${getDirectionColor()}`}>
                    {getDirectionIcon()}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <div className="stat-label">Correlation (r)</div>
                    <div className={`text-xl font-bold ${getDirectionColor()}`}>
                        {pearsonR > 0 ? '+' : ''}{pearsonR.toFixed(3)}
                    </div>
                </div>
                <div>
                    <div className="stat-label">Change</div>
                    <div className={`text-xl font-bold ${meansComparison.percentChange > 0 ? 'text-green-400' : meansComparison.percentChange < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {meansComparison.percentChange > 0 ? '+' : ''}{meansComparison.percentChange.toFixed(1)}%
                    </div>
                </div>
                <div>
                    <div className="stat-label">Nights</div>
                    <div className="text-xl font-bold">{medicationNights}</div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {getSignificanceBadge()}
                {getEffectBadge()}
            </div>

            {/* Mini comparison bar */}
            <div className="bg-[#0a0a0a] rounded-lg p-3">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>Without medication</span>
                    <span>With medication</span>
                </div>
                <div className="relative h-8 bg-[#1a1a1a] rounded overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full bg-gray-600 flex items-center justify-end pr-2"
                        style={{ width: '45%' }}
                    >
                        <span className="text-xs font-medium">{meansComparison.withoutMedication.toFixed(1)}</span>
                    </div>
                    <div
                        className={`absolute right-0 top-0 h-full flex items-center justify-start pl-2 ${meansComparison.percentChange > 0 ? 'bg-green-600' : meansComparison.percentChange < 0 ? 'bg-red-600' : 'bg-gray-600'
                            }`}
                        style={{ width: '45%' }}
                    >
                        <span className="text-xs font-medium">{meansComparison.withMedication.toFixed(1)}</span>
                    </div>
                </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
                95% CI: [{confidenceInterval.lower.toFixed(3)}, {confidenceInterval.upper.toFixed(3)}] | n = {sampleSize}
            </div>

            {metricDesc && (
                <div className="mt-2 text-xs text-gray-500 italic">
                    {metricDesc}
                </div>
            )}
        </div>
    );
}

interface MedicationImpactGridProps {
    correlations: CorrelationResult[];
    sortBy?: 'effect' | 'significance' | 'medication';
    filterSignificant?: boolean;
}

/**
 * Grid of medication impact cards
 */
export function MedicationImpactGrid({
    correlations,
    sortBy = 'effect',
    filterSignificant = true
}: MedicationImpactGridProps) {
    let filtered = filterSignificant
        ? correlations.filter(c => c.isSignificant)
        : correlations;

    // Sort
    if (sortBy === 'effect') {
        filtered.sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));
    } else if (sortBy === 'significance') {
        filtered.sort((a, b) => a.pValue - b.pValue);
    } else {
        filtered.sort((a, b) => a.medication.localeCompare(b.medication));
    }

    if (filtered.length === 0) {
        return (
            <div className="card p-8 text-center text-gray-400">
                {filterSignificant
                    ? 'No statistically significant correlations found. Try adding more data.'
                    : 'No correlations to display.'
                }
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((corr, idx) => (
                <MedicationImpactCard key={`${corr.medication}-${corr.metric}-${idx}`} correlation={corr} />
            ))}
        </div>
    );
}
