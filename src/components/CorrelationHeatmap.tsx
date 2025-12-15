'use client';

import React from 'react';
import { CorrelationResult } from '@/types/analysis';
import { SLEEP_METRIC_LABELS } from '@/types/oura';

interface CorrelationHeatmapProps {
    correlations: CorrelationResult[];
    medications: string[];
    metrics: string[];
}

/**
 * Interactive heatmap showing correlation matrix between medications and sleep metrics
 */
export function CorrelationHeatmap({ correlations, medications, metrics }: CorrelationHeatmapProps) {
    // Build correlation matrix
    const matrix = new Map<string, Map<string, CorrelationResult>>();

    for (const corr of correlations) {
        if (!matrix.has(corr.medication)) {
            matrix.set(corr.medication, new Map());
        }
        matrix.get(corr.medication)!.set(corr.metric, corr);
    }

    const [selectedCell, setSelectedCell] = React.useState<CorrelationResult | null>(null);

    const getColor = (r: number, isSignificant: boolean): string => {
        if (!isSignificant) {
            return 'bg-gray-800/50';
        }

        const intensity = Math.min(Math.abs(r) * 2, 1);

        if (r > 0) {
            // Green for positive
            if (intensity > 0.6) return 'bg-green-500';
            if (intensity > 0.3) return 'bg-green-600/70';
            return 'bg-green-700/50';
        } else {
            // Red for negative
            if (intensity > 0.6) return 'bg-red-500';
            if (intensity > 0.3) return 'bg-red-600/70';
            return 'bg-red-700/50';
        }
    };

    const formatR = (r: number): string => {
        return r.toFixed(2);
    };

    if (medications.length === 0 || metrics.length === 0) {
        return (
            <div className="card p-8 text-center text-gray-400">
                <p>No correlation data available. Import medications and connect Oura to see analysis.</p>
            </div>
        );
    }

    return (
        <div className="card overflow-hidden">
            <div className="p-4 border-b border-[#222]">
                <h3 className="text-lg font-semibold">Correlation Heatmap</h3>
                <p className="text-sm text-gray-400 mt-1">
                    Click any cell to see detailed statistics
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-[#111] p-3 text-left text-sm font-medium text-gray-400 z-10">
                                Medication
                            </th>
                            {metrics.map(metric => (
                                <th key={metric} className="p-3 text-center text-xs font-medium text-gray-400 min-w-[80px]">
                                    <div className="transform -rotate-45 origin-center whitespace-nowrap">
                                        {SLEEP_METRIC_LABELS[metric as keyof typeof SLEEP_METRIC_LABELS] || metric}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {medications.map(med => (
                            <tr key={med} className="border-t border-[#222]">
                                <td className="sticky left-0 bg-[#111] p-3 text-sm font-medium z-10 max-w-[180px] truncate">
                                    {med}
                                </td>
                                {metrics.map(metric => {
                                    const corr = matrix.get(med)?.get(metric);
                                    if (!corr) {
                                        return (
                                            <td key={metric} className="p-1">
                                                <div className="w-full h-10 bg-gray-900/30 rounded flex items-center justify-center text-gray-600 text-xs">
                                                    -
                                                </div>
                                            </td>
                                        );
                                    }

                                    return (
                                        <td key={metric} className="p-1">
                                            <button
                                                onClick={() => setSelectedCell(corr)}
                                                className={`
                          heatmap-cell w-full h-10 rounded flex items-center justify-center
                          text-xs font-medium transition-all cursor-pointer
                          ${getColor(corr.pearsonR, corr.isSignificant)}
                          ${selectedCell === corr ? 'ring-2 ring-white' : ''}
                          ${corr.isSignificant ? 'text-white' : 'text-gray-500'}
                        `}
                                            >
                                                {formatR(corr.pearsonR)}
                                                {corr.isHighlySignificant && <span className="ml-0.5">**</span>}
                                                {corr.isSignificant && !corr.isHighlySignificant && <span className="ml-0.5">*</span>}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="p-4 border-t border-[#222] flex items-center gap-4 text-xs text-gray-400">
                <span>Legend:</span>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-green-500 rounded" />
                    <span>Positive</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-red-500 rounded" />
                    <span>Negative</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-gray-800 rounded" />
                    <span>Not significant</span>
                </div>
                <span className="ml-4">* p &lt; 0.05, ** p &lt; 0.01</span>
            </div>

            {/* Detail panel */}
            {selectedCell && (
                <div className="p-4 border-t border-[#222] bg-[#0a0a0a]">
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="font-semibold">{selectedCell.medication} → {SLEEP_METRIC_LABELS[selectedCell.metric as keyof typeof SLEEP_METRIC_LABELS]}</h4>
                            <p className="text-sm text-gray-400 mt-1">
                                {selectedCell.direction === 'positive' ? 'Positive' : selectedCell.direction === 'negative' ? 'Negative' : 'No'} correlation detected
                            </p>
                        </div>
                        <button onClick={() => setSelectedCell(null)} className="text-gray-500 hover:text-white">
                            ✕
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                            <div className="stat-label">Pearson r</div>
                            <div className="stat-value text-lg">{selectedCell.pearsonR.toFixed(3)}</div>
                        </div>
                        <div>
                            <div className="stat-label">p-value</div>
                            <div className={`stat-value text-lg ${selectedCell.pValue < 0.01 ? 'text-green-400' : selectedCell.pValue < 0.05 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                {selectedCell.pValue < 0.001 ? '<0.001' : selectedCell.pValue.toFixed(3)}
                            </div>
                        </div>
                        <div>
                            <div className="stat-label">Effect Size</div>
                            <div className="stat-value text-lg capitalize">{selectedCell.effectSize}</div>
                        </div>
                        <div>
                            <div className="stat-label">Sample Size</div>
                            <div className="stat-value text-lg">{selectedCell.sampleSize}</div>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-[#111] rounded-lg">
                        <div className="text-sm text-gray-400 mb-2">Means Comparison</div>
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-gray-500">With medication:</span>{' '}
                                <span className="font-medium">{selectedCell.meansComparison.withMedication.toFixed(1)}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Without:</span>{' '}
                                <span className="font-medium">{selectedCell.meansComparison.withoutMedication.toFixed(1)}</span>
                            </div>
                            <div className={selectedCell.meansComparison.percentChange > 0 ? 'text-green-400' : selectedCell.meansComparison.percentChange < 0 ? 'text-red-400' : ''}>
                                ({selectedCell.meansComparison.percentChange > 0 ? '+' : ''}{selectedCell.meansComparison.percentChange.toFixed(1)}%)
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                        95% CI: [{selectedCell.confidenceInterval.lower.toFixed(3)}, {selectedCell.confidenceInterval.upper.toFixed(3)}]
                    </div>
                </div>
            )}
        </div>
    );
}
