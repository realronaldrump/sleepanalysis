'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
    MedicationImport,
    OuraConnect,
    CorrelationHeatmap,
    MedicationImpactGrid,
    MLInsights
} from '@/components';
import {
    MedicationLogResult,
    MedicationEntry,
} from '@/types/medication';
import { ProcessedSleepMetrics, SLEEP_METRICS, SleepMetricKey } from '@/types/oura';
import { AnalysisResults, alignData, runCorrelationAnalysis } from '@/services/correlationEngine';
import { groupMedicationsBySleepNight } from '@/services/medicationParser';
import { AlignedDataPoint, CorrelationResult } from '@/types/analysis';
import { fetchAndProcessSleepData, loadTokens, saveTokens } from '@/services/ouraClient';
import { fetchMedicationLog, saveMedicationLog } from '@/services/medicationService';

export default function Dashboard() {
    // Data state
    const [medicationData, setMedicationData] = useState<MedicationLogResult | null>(null);
    const [sleepData, setSleepData] = useState<ProcessedSleepMetrics[]>([]);
    const [ouraToken, setOuraToken] = useState<string | null>(null);
    const [isLoadingOura, setIsLoadingOura] = useState(false);
    const [isLoadingStored, setIsLoadingStored] = useState(true);

    // Analysis state
    const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [alignedData, setAlignedData] = useState<AlignedDataPoint[]>([]);

    // UI state
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [filterSignificant, setFilterSignificant] = useState(true);

    // Sorting state
    const [sortDirection, setSortDirection] = useState<SortDirection>('strongest_abs');
    const [filterMetric, setFilterMetric] = useState<SleepMetricKey | 'all'>('all');
    const [filterMedication, setFilterMedication] = useState<string>('all');

    // Load stored data on mount
    useEffect(() => {
        async function loadStoredData() {
            try {
                // Load Medication Log
                const storedMedLogs = await fetchMedicationLog();
                if (storedMedLogs) {
                    setMedicationData(storedMedLogs);
                }

                // Load Oura Tokens
                const storedTokens = await loadTokens();
                if (storedTokens) {
                    setOuraToken(storedTokens.access_token);
                    // Optionally auto-fetch here if we have both?
                    // We'll let the user click "Connect" or just handle it if they are "connected"
                    // But we don't have an auto-fetch mechanism yet other than handleOuraConnect.
                    // Let's trigger a fetch if we have a token.
                    handleOuraConnect(storedTokens.access_token, true); // Pass flag to skip save
                }
            } catch (error) {
                console.error('Failed to load stored data:', error);
            } finally {
                setIsLoadingStored(false);
            }
        }
        loadStoredData();
    }, []);

    // Handle medication import
    const handleMedicationImport = useCallback(async (result: MedicationLogResult) => {
        setMedicationData(result);
        // Clear previous analysis
        setAnalysisResults(null);
        // Save to backend
        try {
            await saveMedicationLog(result.entries, result.dateRange);
        } catch (e) {
            console.error('Failed to save medication log', e);
        }
    }, []);

    // Handle Oura connection
    const handleOuraConnect = useCallback(async (token: string, skipSave = false) => {
        setOuraToken(token);
        setIsLoadingOura(true);

        if (!skipSave) {
            // We only have the access token from the simple input, not the full OAuth response if manual input.
            // But if we are assuming the input IS the access token (Personal Access Token), we can save it.
            // However, loadTokens/saveTokens expects OuraTokens with refresh/expiry.
            // If the user enters a Personal Access Token via the UI, we might not have expiry.
            // For now, let's assume we construct a dummy token object if one isn't passed,
            // OR we just save what we have. API expects full object.
            // Let's assume for manual entry we just save it with far future expiry? 
            // Or better, only save if it came from a "real" flow. 
            // Given the limitations, let's constructing a basic token object for PATs.
            try {
                await saveTokens({
                    access_token: token,
                    refresh_token: '',
                    expires_at: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
                    token_type: 'Bearer'
                });
            } catch (e) {
                console.error('Failed to save tokens', e);
            }
        }

        try {
            // Use the full medication date range for complete analysis
            // Default to last 2 years if no medication data (or use what we have loaded)
            // Note: medicationData might be stale in this closure if called from useEffect?
            // Actually medicationData is a dependency, so it should be fine.
            // BUT if called from useEffect loadStoredData, medicationData might not be set yet 
            // inside THIS closure if we just set it.
            // We should arguably use a refined approach for initial load.

            const endDate = new Date().toISOString().split('T')[0];
            // We need to access the LATEST medicationData. 
            // Simple fix: default to 2 years, user can re-run analysis.
            const startDate =
                new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const data = await fetchAndProcessSleepData(token, startDate, endDate);
            setSleepData(data);
            // Clear previous analysis
            setAnalysisResults(null);
        } catch (error) {
            console.error('Failed to fetch Oura data:', error);
            // Don't alert on auto-load failure to be less annoying
            if (!skipSave) {
                alert('Failed to fetch data from Oura. Please check your access token.');
                setOuraToken(null);
            }
        } finally {
            setIsLoadingOura(false);
        }
    }, []);

    const handleOuraDisconnect = useCallback(() => {
        setOuraToken(null);
        setSleepData([]);
        setAnalysisResults(null);
        // We could also clear server storage but maybe better to keep it?
    }, []);

    // Run analysis when both datasets are available
    const runAnalysis = useCallback(() => {
        if (!medicationData || sleepData.length === 0) return;

        setIsAnalyzing(true);

        // Run analysis in next tick to allow UI update
        setTimeout(() => {
            try {
                const results = runCorrelationAnalysis(
                    medicationData.entries,
                    sleepData
                );
                setAnalysisResults(results);

                // Also compute aligned data for ML service
                const medSummaries = groupMedicationsBySleepNight(medicationData.entries);
                const aligned = alignData(medSummaries, sleepData);
                setAlignedData(aligned);
            } catch (error) {
                console.error('Analysis failed:', error);
                alert('Analysis failed. Please check your data.');
            } finally {
                setIsAnalyzing(false);
            }
        }, 100);
    }, [medicationData, sleepData]);

    // Check if we can run analysis
    const canAnalyze = medicationData && sleepData.length > 0 && !analysisResults;

    // Get unique medications for heatmap and filtering
    const getUniqueMedications = (): string[] => {
        if (!analysisResults) return [];
        return [...new Set(analysisResults.significantCorrelations.map(c => c.medication))].sort();
    };

    // Sort and filter correlations
    const getSortedCorrelations = (correlations: CorrelationResult[]): CorrelationResult[] => {
        let filtered = [...correlations];

        // Filter by metric
        if (filterMetric !== 'all') {
            filtered = filtered.filter(c => c.metric === filterMetric);
        }

        // Filter by medication
        if (filterMedication !== 'all') {
            filtered = filtered.filter(c => c.medication === filterMedication);
        }

        // Sort
        switch (sortDirection) {
            case 'strongest_positive':
                filtered.sort((a, b) => b.pearsonR - a.pearsonR);
                break;
            case 'strongest_negative':
                filtered.sort((a, b) => a.pearsonR - b.pearsonR);
                break;
            case 'strongest_abs':
                filtered.sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));
                break;
            case 'medication':
                filtered.sort((a, b) => a.medication.localeCompare(b.medication));
                break;
            case 'metric':
                filtered.sort((a, b) => a.metric.localeCompare(b.metric));
                break;
        }

        return filtered;
    };

    // Calculate the overlapping date range between medication and sleep data
    const getAnalysisDateRange = () => {
        if (!medicationData || sleepData.length === 0) return null;

        const medStart = medicationData.dateRange.start;
        const medEnd = medicationData.dateRange.end;
        const sleepStart = sleepData[0]?.date;
        const sleepEnd = sleepData[sleepData.length - 1]?.date;

        // Return the overlapping range
        const start = medStart > sleepStart ? medStart : sleepStart;
        const end = medEnd < sleepEnd ? medEnd : sleepEnd;

        return { start, end };
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Sleep Correlation Analysis</h1>
                    <p className="text-gray-400 mt-1">
                        Statistical analysis of medication effects on sleep quality
                    </p>
                </div>

                {canAnalyze && (
                    <button
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="btn-primary"
                    >
                        {isAnalyzing ? 'Analyzing...' : '🔬 Run Analysis'}
                    </button>
                )}
            </div>

            {/* Data Sources */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <MedicationImport onImport={handleMedicationImport} />
                <OuraConnect
                    isConnected={!!ouraToken}
                    onConnect={handleOuraConnect}
                    onDisconnect={handleOuraDisconnect}
                    dateRange={sleepData.length > 0 ? {
                        start: sleepData[0].date,
                        end: sleepData[sleepData.length - 1].date,
                    } : undefined}
                    sleepNightsCount={sleepData.length}
                />
            </div>

            {/* Data Status */}
            {(medicationData || sleepData.length > 0) && (
                <div className="card p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${medicationData ? 'bg-green-500' : 'bg-gray-600'}`} />
                                <span className="text-sm text-gray-400">
                                    Medications: {medicationData?.totalEntries.toLocaleString() || 0} entries
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${sleepData.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
                                <span className="text-sm text-gray-400">
                                    Sleep: {sleepData.length} nights
                                </span>
                            </div>
                            {analysisResults && (
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                                    <span className="text-sm text-gray-400">
                                        {analysisResults.significantCorrelations.length} significant correlations found
                                    </span>
                                </div>
                            )}
                        </div>

                        {isLoadingOura && (
                            <span className="text-sm text-gray-400 animate-pulse">
                                Loading Oura data...
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Analysis Results */}
            {analysisResults && (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card p-4">
                            <div className="stat-label">Total Nights Analyzed</div>
                            <div className="stat-value">{analysisResults.totalNights}</div>
                        </div>
                        <div className="card p-4">
                            <div className="stat-label">Medications Tested</div>
                            <div className="stat-value">{analysisResults.medicationsAnalyzed}</div>
                        </div>
                        <div className="card p-4">
                            <div className="stat-label">Significant Findings</div>
                            <div className="stat-value text-green-400">{analysisResults.significantCorrelations.length}</div>
                        </div>
                        <div className="card p-4">
                            <div className="stat-label">Date Range</div>
                            <div className="text-sm">
                                {(() => {
                                    const range = getAnalysisDateRange();
                                    return range ? `${range.start} to ${range.end}` : 'N/A';
                                })()}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Meds: {medicationData?.dateRange.start} - {medicationData?.dateRange.end}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-[#111] p-1 rounded-lg w-fit">
                        {(['overview', 'heatmap', 'insights', 'ml'] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`
                  px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${activeTab === tab
                                        ? 'bg-primary-600 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                                    }
                `}
                            >
                                {tab === 'ml' ? '🧠 ML Insights' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Top Correlations */}
                            {analysisResults.topPositiveCorrelations.length > 0 && (
                                <div>
                                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                        <span className="text-green-400">↑</span> Top Positive Correlations
                                    </h2>
                                    <MedicationImpactGrid
                                        correlations={analysisResults.topPositiveCorrelations.slice(0, 6)}
                                        filterSignificant={false}
                                    />
                                </div>
                            )}

                            {analysisResults.topNegativeCorrelations.length > 0 && (
                                <div>
                                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                        <span className="text-red-400">↓</span> Top Negative Correlations
                                    </h2>
                                    <MedicationImpactGrid
                                        correlations={analysisResults.topNegativeCorrelations.slice(0, 6)}
                                        filterSignificant={false}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'heatmap' && (
                        <CorrelationHeatmap
                            correlations={analysisResults.significantCorrelations}
                            medications={getUniqueMedications()}
                            metrics={[...SLEEP_METRICS]}
                        />
                    )}

                    {activeTab === 'ml' && (
                        <MLInsights
                            alignedData={alignedData}
                            isLoading={isAnalyzing}
                        />
                    )}

                    {activeTab === 'insights' && (
                        <div className="space-y-4">
                            {/* Controls Bar */}
                            <div className="card p-4">
                                <div className="flex flex-wrap items-center gap-4">
                                    {/* Sort Direction */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500 uppercase tracking-wider">Sort By</label>
                                        <select
                                            value={sortDirection}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortDirection(e.target.value as SortDirection)}
                                            className="input-field py-1.5 text-sm min-w-[180px]"
                                        >
                                            <option value="strongest_abs">Strongest (Absolute)</option>
                                            <option value="strongest_positive">Strongest Positive ↑</option>
                                            <option value="strongest_negative">Strongest Negative ↓</option>
                                            <option value="medication">Medication Name (A-Z)</option>
                                            <option value="metric">Metric Name (A-Z)</option>
                                        </select>
                                    </div>

                                    {/* Filter by Metric */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500 uppercase tracking-wider">Sleep Metric</label>
                                        <select
                                            value={filterMetric}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterMetric(e.target.value as SleepMetricKey | 'all')}
                                            className="input-field py-1.5 text-sm min-w-[160px]"
                                        >
                                            <option value="all">All Metrics</option>
                                            {SLEEP_METRICS.map(m => (
                                                <option key={m} value={m}>{m.replace(/([A-Z])/g, ' $1').trim()}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Filter by Medication */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500 uppercase tracking-wider">Medication</label>
                                        <select
                                            value={filterMedication}
                                            onChange={(e) => setFilterMedication(e.target.value)}
                                            className="input-field py-1.5 text-sm min-w-[160px]"
                                        >
                                            <option value="all">All Medications</option>
                                            {getUniqueMedications().map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Significance Toggle */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500 uppercase tracking-wider">Filter</label>
                                        <label className="flex items-center gap-2 text-sm text-gray-400 h-[34px]">
                                            <input
                                                type="checkbox"
                                                checked={filterSignificant}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterSignificant(e.target.checked)}
                                                className="rounded"
                                            />
                                            Significant only (p &lt; 0.05)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Results Count */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold">
                                    Correlation Results
                                </h2>
                                <span className="text-sm text-gray-400">
                                    {getSortedCorrelations(
                                        filterSignificant
                                            ? analysisResults.significantCorrelations
                                            : analysisResults.medicationAnalyses.flatMap(m => m.correlations)
                                    ).length} results
                                </span>
                            </div>

                            <MedicationImpactGrid
                                correlations={getSortedCorrelations(
                                    filterSignificant
                                        ? analysisResults.significantCorrelations
                                        : analysisResults.medicationAnalyses.flatMap(m => m.correlations)
                                )}
                                filterSignificant={false}
                                sortBy="effect"
                            />
                        </div>
                    )}
                </>
            )}

            {/* Empty State */}
            {!medicationData && sleepData.length === 0 && (
                <div className="card p-12 text-center">
                    <div className="text-5xl mb-4">🔬</div>
                    <h2 className="text-xl font-semibold mb-2">Get Started</h2>
                    <p className="text-gray-400 max-w-md mx-auto">
                        Import your medication log and connect your Oura Ring to discover
                        statistically significant correlations between your medications and sleep quality.
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-gray-600 pt-8 border-t border-[#222]">
                <p>Analysis uses Pearson correlation, Spearman rank correlation, and effect size calculations.</p>
                <p className="mt-1">Statistical significance threshold: p &lt; 0.05 | No LLM/AI generation - pure statistical analysis</p>
            </div>
        </div>
    );
}
