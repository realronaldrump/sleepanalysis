/**
 * ML Insights Component
 * Displays advanced ML-powered analysis including interactions, feature importance,
 * causal analysis, and clustering results.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    ComprehensiveMLResult,
    MLInteractionResult,
    FeatureImportanceResult,
    CausalResult,
    ClusterResult,
} from '@/types/mlTypes';
import { runMLAnalysisSafe, checkMLServiceHealth } from '@/services/mlClient';
import { AlignedDataPoint } from '@/types/analysis';

interface MLInsightsProps {
    alignedData: AlignedDataPoint[];
    isLoading?: boolean;
}

export default function MLInsights({ alignedData, isLoading = false }: MLInsightsProps) {
    const [mlResults, setMLResults] = useState<ComprehensiveMLResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [mlStatus, setMLStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
    const [error, setError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'interactions' | 'importance' | 'causal' | 'clusters'>('interactions');

    // Check ML service availability on mount
    useEffect(() => {
        checkMLServiceHealth().then(health => {
            setMLStatus(health ? 'available' : 'unavailable');
        });
    }, []);

    // Run ML analysis
    const runAnalysis = async () => {
        if (alignedData.length < 20) {
            setError('Need at least 20 nights of data for ML analysis');
            return;
        }

        setIsAnalyzing(true);
        setError(null);

        try {
            const results = await runMLAnalysisSafe(alignedData);
            if (results) {
                setMLResults(results);
            } else {
                setError('ML service unavailable. Please ensure the Python service is running.');
            }
        } catch (err) {
            setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // If ML service is unavailable
    if (mlStatus === 'unavailable') {
        return (
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                    <h3 className="text-lg font-semibold">Advanced ML Insights</h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                    The Python ML service is not currently running. Start it to access advanced machine learning analytics.
                </p>
                <div className="bg-[#111] rounded-lg p-4 font-mono text-sm">
                    <p className="text-gray-500 mb-2"># Start the ML service:</p>
                    <p className="text-green-400">cd ml-service && pip install -r requirements.txt</p>
                    <p className="text-green-400">uvicorn main:app --port 8000 --reload</p>
                </div>
                <button
                    onClick={() => {
                        setMLStatus('checking');
                        checkMLServiceHealth().then(health => {
                            setMLStatus(health ? 'available' : 'unavailable');
                        });
                    }}
                    className="mt-4 btn-secondary text-sm"
                >
                    🔄 Check Again
                </button>
            </div>
        );
    }

    // Still checking
    if (mlStatus === 'checking') {
        return (
            <div className="card p-6">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-gray-400">Checking ML service availability...</span>
                </div>
            </div>
        );
    }

    // No results yet
    if (!mlResults) {
        return (
            <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <h3 className="text-lg font-semibold">Advanced ML Insights</h3>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
                        ML Service Online
                    </span>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                    Run advanced machine learning analysis to discover drug interactions,
                    feature importance, causal effects, and medication patterns.
                </p>
                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}
                <button
                    onClick={runAnalysis}
                    disabled={isAnalyzing || isLoading || alignedData.length < 20}
                    className="btn-primary"
                >
                    {isAnalyzing ? (
                        <>
                            <span className="animate-spin mr-2">⏳</span>
                            Running ML Analysis...
                        </>
                    ) : (
                        '🧠 Run ML Analysis'
                    )}
                </button>
                {alignedData.length < 20 && (
                    <p className="text-xs text-gray-500 mt-2">
                        Need at least 20 aligned data points. Currently: {alignedData.length}
                    </p>
                )}
            </div>
        );
    }

    // Results display
    return (
        <div className="space-y-6">
            {/* Summary Card */}
            <div className="card p-6 bg-[#1a1a1a] border-sky-500/30">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                    🧠 ML Analysis Summary
                </h3>
                <p className="text-neutral-300 mb-4">{mlResults.summary}</p>
                <div className="flex flex-wrap gap-2">
                    {mlResults.recommendations.map((rec, i) => (
                        <div key={i} className="bg-[#0d0d0d] px-3 py-2 rounded-lg text-sm text-neutral-300" style={{ boxShadow: 'inset 2px 2px 4px #080808, inset -2px -2px 4px #1a1a1a' }}>
                            💡 {rec}
                        </div>
                    ))}
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex gap-1 bg-[#171717] p-1 rounded-lg w-fit" style={{ boxShadow: 'inset 3px 3px 6px #080808, inset -3px -3px 6px #1a1a1a' }}>
                {[
                    { key: 'interactions', label: '🔗 Interactions', count: mlResults.interactions.length },
                    { key: 'importance', label: '📊 Importance', count: mlResults.featureImportance.topMedications.length },
                    { key: 'causal', label: '🎯 Causal', count: mlResults.causalResults.filter(c => c.isCausal).length },
                    { key: 'clusters', label: '📦 Clusters', count: mlResults.clusters.clusters.length },
                ].map(({ key, label, count }) => (
                    <button
                        key={key}
                        onClick={() => setActiveSection(key as typeof activeSection)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${activeSection === key
                            ? 'bg-sky-600 text-white'
                            : 'text-neutral-400 hover:text-white hover:bg-[#1f1f1f]'
                            }`}
                        style={activeSection === key ? { boxShadow: '3px 3px 6px #080808, -3px -3px 6px #1a1a1a' } : {}}
                    >
                        {label} ({count})
                    </button>
                ))}
            </div>

            {/* Section Content */}
            {activeSection === 'interactions' && (
                <InteractionsSection interactions={mlResults.interactions} />
            )}
            {activeSection === 'importance' && (
                <ImportanceSection importance={mlResults.featureImportance} />
            )}
            {activeSection === 'causal' && (
                <CausalSection results={mlResults.causalResults} />
            )}
            {activeSection === 'clusters' && (
                <ClustersSection clusters={mlResults.clusters} />
            )}

            {/* Re-run button */}
            <button
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="btn-secondary text-sm"
            >
                {isAnalyzing ? 'Analyzing...' : '🔄 Re-run Analysis'}
            </button>
        </div>
    );
}

// Interactions Section
function InteractionsSection({ interactions }: { interactions: MLInteractionResult[] }) {
    if (interactions.length === 0) {
        return (
            <div className="card p-6 text-center text-gray-400">
                No significant drug interactions detected.
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {interactions.map((interaction, i) => (
                <div
                    key={i}
                    className={`card p-4 border-l-4 ${interaction.interactionType === 'synergistic'
                        ? 'border-l-green-500'
                        : interaction.interactionType === 'antagonistic'
                            ? 'border-l-red-500'
                            : 'border-l-gray-500'
                        }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">
                                {interaction.medications.join(' + ')}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${interaction.interactionType === 'synergistic'
                                ? 'bg-green-500/20 text-green-400'
                                : interaction.interactionType === 'antagonistic'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                {interaction.interactionType}
                            </span>
                        </div>
                        <span className="text-sm text-gray-400">
                            Score: {(interaction.interactionScore * 100).toFixed(0)}%
                        </span>
                    </div>
                    <p className="text-sm text-gray-400">{interaction.description}</p>
                    <div className="mt-2 text-xs text-gray-500">
                        Confidence: {(interaction.confidence * 100).toFixed(0)}%
                    </div>
                </div>
            ))}
        </div>
    );
}

// Feature Importance Section
function ImportanceSection({ importance }: { importance: FeatureImportanceResult }) {
    const metrics = Object.keys(importance.byMetric);

    if (metrics.length === 0) {
        return (
            <div className="card p-6 text-center text-gray-400">
                Not enough data to calculate feature importance.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Top Medications Overall */}
            <div className="card p-4">
                <h4 className="font-bold mb-3">Most Impactful Medications (Overall)</h4>
                <div className="flex flex-wrap gap-2">
                    {importance.topMedications.map((med, i) => (
                        <span
                            key={med}
                            className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-sm"
                        >
                            #{i + 1} {med}
                        </span>
                    ))}
                </div>
                <div className="mt-3 text-xs text-gray-500">
                    Model R²: {(importance.modelR2 * 100).toFixed(1)}% variance explained
                </div>
            </div>

            {/* By Metric */}
            {metrics.slice(0, 4).map(metric => {
                const items = importance.byMetric[metric];
                if (!items || items.length === 0) return null;

                return (
                    <div key={metric} className="card p-4">
                        <h4 className="font-semibold mb-3 capitalize">
                            {metric.replace(/([A-Z])/g, ' $1').trim()}
                        </h4>
                        <div className="space-y-2">
                            {items.slice(0, 5).map((item, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-24 text-sm text-gray-300 truncate">
                                        {item.medication}
                                    </div>
                                    <div className="flex-1 bg-[#111] rounded-full h-3 overflow-hidden">
                                        <div
                                            className={`h-full ${item.direction === 'positive'
                                                ? 'bg-green-500'
                                                : item.direction === 'negative'
                                                    ? 'bg-red-500'
                                                    : 'bg-gray-500'
                                                }`}
                                            style={{ width: `${Math.min(100, item.importance * 100)}%` }}
                                        />
                                    </div>
                                    <div className="w-16 text-right text-xs text-gray-400">
                                        {(item.importance * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Causal Analysis Section
function CausalSection({ results }: { results: CausalResult[] }) {
    const causalEffects = results.filter(r => r.isCausal);
    const suggestive = results.filter(r => !r.isCausal && r.pValue < 0.1);

    return (
        <div className="space-y-6">
            {/* Causal Effects */}
            <div>
                <h4 className="font-semibold mb-3 text-green-400">
                    ✓ Likely Causal Effects ({causalEffects.length})
                </h4>
                {causalEffects.length === 0 ? (
                    <div className="card p-4 text-sm text-gray-400">
                        No effects passed all causal tests. This doesn't mean medications don't work -
                        just that we need more controlled data to confirm causality.
                    </div>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {causalEffects.map((result, i) => (
                            <div key={i} className="card p-4 border-l-4 border-l-green-500">
                                <div className="font-semibold">{result.medication}</div>
                                <div className="text-sm text-gray-400">
                                    Effect on {result.metric.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <div className={`text-lg font-bold mt-1 ${result.causalEffect > 0 ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                    {result.causalEffect > 0 ? '+' : ''}{result.causalEffect.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    CI: [{result.confidenceInterval[0].toFixed(2)}, {result.confidenceInterval[1].toFixed(2)}]
                                    | p = {result.pValue.toFixed(3)}
                                </div>
                                {result.conditionalInsight && (
                                    <div className="mt-2 text-xs text-sky-400 bg-sky-950/30 p-2 rounded border border-sky-500/20">
                                        💡 {result.conditionalInsight}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Suggestive Effects */}
            {suggestive.length > 0 && (
                <div>
                    <h4 className="font-semibold mb-3 text-yellow-400">
                        ? Suggestive Effects ({suggestive.length})
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                        {suggestive.slice(0, 6).map((result, i) => (
                            <div key={i} className="card p-3 border-l-4 border-l-yellow-500/50 opacity-75">
                                <div className="font-semibold text-sm">{result.medication}</div>
                                <div className="text-xs text-gray-400">
                                    {result.metric.replace(/([A-Z])/g, ' $1').trim()}: {result.causalEffect > 0 ? '+' : ''}{result.causalEffect.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-500">
                                    p = {result.pValue.toFixed(3)} | {result.refutationPassed ? '✓ refutation passed' : '✗ refutation failed'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Clusters Section
function ClustersSection({ clusters }: { clusters: ClusterResult }) {
    if (clusters.clusters.length === 0) {
        return (
            <div className="card p-6 text-center text-gray-400">
                Not enough data to identify medication patterns.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Recommendation */}
            <div className="card p-4 bg-[#1a1a1a] border-sky-500/30">
                <div className="font-bold mb-1">💡 Recommendation</div>
                <p className="text-neutral-300">{clusters.recommendation}</p>
                <div className="text-xs text-neutral-500 mt-2">
                    Clustering silhouette score: {(clusters.silhouetteScore * 100).toFixed(0)}%
                </div>
            </div>

            {/* Cluster Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                {clusters.clusters.map((cluster) => (
                    <div
                        key={cluster.id}
                        className={`card p-4 ${cluster.id === clusters.optimalCluster
                            ? 'border-2 border-green-500/50 bg-green-500/5'
                            : ''
                            }`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">
                                Pattern #{cluster.id + 1}
                            </span>
                            {cluster.id === clusters.optimalCluster && (
                                <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                                    Best Outcomes
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 mb-3">{cluster.description}</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {cluster.medications.slice(0, 4).map(med => (
                                <span key={med} className="text-xs px-2 py-1 rounded bg-[#111] text-gray-300">
                                    {med}
                                </span>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500">
                            {cluster.nightCount} nights
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
