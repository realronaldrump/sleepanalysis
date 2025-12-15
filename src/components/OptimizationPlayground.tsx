
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Slider, { SliderProps } from 'rc-slider';
import 'rc-slider/assets/index.css';
import { AlignedDataPoint } from '@/types/analysis';
import { simulateConfiguration } from '@/services/mlClient';
import { SimulationResult, OptimizationSuggestion, PredictionDetail } from '@/types/mlTypes';

interface OptimizationPlaygroundProps {
    alignedData: AlignedDataPoint[];
    recommendations: OptimizationSuggestion[];
}

interface MedConfig {
    name: string;
    dose: number;
    time: number; // minutes from noon (0-840)
    enabled: boolean;
}

export default function OptimizationPlayground({ alignedData, recommendations }: OptimizationPlaygroundProps) {
    const [configs, setConfigs] = useState<MedConfig[]>([]);
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [availableMeds, setAvailableMeds] = useState<string[]>([]);
    const [availableDoses, setAvailableDoses] = useState<Record<string, number[]>>({});
    const [selectedMedToAdd, setSelectedMedToAdd] = useState('');

    // Initialize data
    useEffect(() => {
        const meds = new Set<string>();
        const doses: Record<string, Set<number>> = {};

        alignedData.forEach(d => {
            // d.medications is a Map
            d.medications.forEach((val, key) => {
                meds.add(key);
                if (!doses[key]) doses[key] = new Set();
                // Round to reasonable precision to avoid float noise
                if (val.totalMg > 0) {
                    doses[key].add(Math.round(val.totalMg * 10) / 10);
                }
            });
        });

        const sortedMeds = Array.from(meds).sort();
        setAvailableMeds(sortedMeds);

        const doseMap: Record<string, number[]> = {};
        Object.keys(doses).forEach(key => {
            doseMap[key] = Array.from(doses[key]).sort((a, b) => a - b);
            // Ensure at least one default dose if empty (e.g. 0 was filtered out or data missing)
            if (doseMap[key].length === 0) doseMap[key] = [5];
        });
        setAvailableDoses(doseMap);

        // Default configs: Top 3 meds
        const counts: Record<string, number> = {};
        alignedData.forEach(d => {
            d.medications.forEach((val, key) => {
                counts[key] = (counts[key] || 0) + 1;
            });
        });
        const topMeds = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);

        const initialConfigs = topMeds.map(name => {
            // Default to most common dose could be better, but median is fine
            const medDoses = doseMap[name] || [5];
            const defaultDose = medDoses[Math.floor(medDoses.length / 2)] || 5;
            return {
                name,
                dose: defaultDose,
                time: 600, // 10 PM
                enabled: false
            };
        });
        setConfigs(initialConfigs);
    }, [alignedData]);


    // Debounced simulation
    useEffect(() => {
        const timer = setTimeout(async () => {
            setIsSimulating(true);
            try {
                const activeConfigs = configs.filter(c => c.enabled);
                const requestMeds = activeConfigs.map(c => ({
                    name: c.name,
                    normalized_name: c.name,
                    drug_class: 'other',
                    quantity: 1,
                    dosage_mg: c.dose,
                    total_mg: c.dose,
                    time: "22:00" // Hardcoded to 10 PM as per request to remove timing variable
                }));

                const res = await simulateConfiguration(requestMeds);
                setResult(res);
            } catch (e) {
                console.error("Simulation error", e);
            } finally {
                setIsSimulating(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [configs]);

    const handleConfigChange = (index: number, changes: Partial<MedConfig>) => {
        const newConfigs = [...configs];
        newConfigs[index] = { ...newConfigs[index], ...changes };
        setConfigs(newConfigs);
    };

    const addMedication = () => {
        if (!selectedMedToAdd || configs.some(c => c.name === selectedMedToAdd)) return;
        const medDoses = availableDoses[selectedMedToAdd] || [5];
        const defaultDose = medDoses[Math.floor(medDoses.length / 2)];

        setConfigs([...configs, {
            name: selectedMedToAdd,
            dose: defaultDose,
            time: 600,
            enabled: true
        }]);
        setSelectedMedToAdd('');
    };

    const removeMedication = (index: number) => {
        const newConfigs = [...configs];
        newConfigs.splice(index, 1);
        setConfigs(newConfigs);
    };


    return (
        <div className="card p-6 bg-[#1a1a1a] border-sky-500/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                🧪 Optimization Playground
            </h3>
            <p className="text-sm text-gray-400 mb-6">
                Build your nightly stack and see predicted effects on all sleep metrics.
            </p>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Left Panel: Configuration */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="flex gap-2">
                        <select
                            className="bg-[#111] border border-gray-700 rounded px-2 py-1 text-sm flex-1"
                            value={selectedMedToAdd}
                            onChange={(e) => setSelectedMedToAdd(e.target.value)}
                        >
                            <option value="">Select a medication to add...</option>
                            {availableMeds.filter(m => !configs.some(c => c.name === m)).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <button
                            onClick={addMedication}
                            disabled={!selectedMedToAdd}
                            className="btn-secondary text-sm px-3"
                        >
                            + Add
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        {configs.map((config, idx) => {
                            const medDoses = availableDoses[config.name] || [0, 5, 10]; // Fallback
                            const isDiscrete = medDoses.length < 15;
                            const marks = isDiscrete
                                ? medDoses.reduce((acc, d) => ({ ...acc, [d]: `${d}mg` }), {})
                                : undefined;

                            return (
                                <div key={config.name} className={`p-4 rounded-lg border transition-all relative group ${config.enabled
                                    ? 'bg-[#222] border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                                    : 'bg-[#151515] border-transparent opacity-70'
                                    }`}>
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => removeMedication(idx)} className="text-gray-500 hover:text-red-400">×</button>
                                    </div>

                                    <div className="flex items-center justify-between mb-4 pr-6">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={config.enabled}
                                                onChange={(e) => handleConfigChange(idx, { enabled: e.target.checked })}
                                                className="rounded border-gray-600 bg-black text-sky-500 focus:ring-sky-500"
                                            />
                                            <span className={`font-semibold ${config.enabled ? 'text-white' : 'text-gray-400'}`}>
                                                {config.name}
                                            </span>
                                        </label>
                                    </div>

                                    {config.enabled && (
                                        <div className="space-y-4 px-2">
                                            <div>
                                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                                    <span>Dose</span>
                                                    <span className="text-white font-mono">{config.dose} mg</span>
                                                </div>
                                                <Slider
                                                    min={Math.min(...medDoses)}
                                                    max={Math.max(...medDoses)}
                                                    step={isDiscrete ? null : 1} // Null step forces snapping to marks
                                                    marks={marks}
                                                    value={config.dose}
                                                    onChange={(val) => handleConfigChange(idx, { dose: val as number })}
                                                    trackStyle={{ backgroundColor: '#0ea5e9' }}
                                                    handleStyle={{ borderColor: '#0ea5e9', backgroundColor: '#000' }}
                                                    railStyle={{ backgroundColor: '#333' }}
                                                    dotStyle={{ borderColor: '#333', backgroundColor: '#111' }}
                                                    activeDotStyle={{ borderColor: '#0ea5e9', backgroundColor: '#0ea5e9' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {configs.length === 0 && (
                            <div className="text-center py-8 text-gray-600 border border-dashed border-gray-800 rounded-lg">
                                No medications selected. Add one to start.
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Results */}
                <div className="lg:col-span-7 space-y-4">
                    {isSimulating && (
                        <div className="flex justify-center py-4">
                            <div className="animate-spin text-sky-500">⏳</div>
                        </div>
                    )}

                    {!isSimulating && result && (
                        <div className="grid grid-cols-2 gap-4">
                            {/* Main Score Card */}
                            <div className="col-span-2 card p-6 bg-[#111] border-gray-800 text-center">
                                <div className="text-sm text-gray-400 uppercase tracking-widest mb-2">Sleep Score</div>
                                <MetricDisplay
                                    detail={result.predictions['sleepScore']}
                                    unit=""
                                    scale={1}
                                    goodMin={85}
                                />
                            </div>

                            {/* Deep & REM */}
                            <div className="card p-4 bg-[#111] border-gray-800">
                                <div className="text-xs text-gray-400 mb-1">Deep Sleep</div>
                                <MetricDisplay
                                    detail={result.predictions['deepSleepMinutes']}
                                    unit=" min"
                                    scale={1}
                                    goodMin={60}
                                />
                            </div>
                            <div className="card p-4 bg-[#111] border-gray-800">
                                <div className="text-xs text-gray-400 mb-1">REM Sleep</div>
                                <MetricDisplay
                                    detail={result.predictions['remSleepMinutes']}
                                    unit=" min"
                                    scale={1}
                                    goodMin={90}
                                />
                            </div>

                            {/* HRV & Latency */}
                            <div className="card p-4 bg-[#111] border-gray-800">
                                <div className="text-xs text-gray-400 mb-1">HRV (Avg)</div>
                                <MetricDisplay
                                    detail={result.predictions['avgHrv']}
                                    unit=" ms"
                                    scale={1}
                                />
                            </div>
                            <div className="card p-4 bg-[#111] border-gray-800">
                                <div className="text-xs text-gray-400 mb-1">Latency</div>
                                <MetricDisplay
                                    detail={result.predictions['latencyMinutes']}
                                    unit=" min"
                                    scale={1}
                                    goodMin={10} goodMax={20}
                                />
                            </div>
                        </div>
                    )}

                    {!isSimulating && !result && (
                        <div className="h-full flex items-center justify-center text-gray-600">
                            Configure output to see predictions.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricDisplay({ detail, unit, scale, goodMin, goodMax }: {
    detail?: PredictionDetail;
    unit: string;
    scale: number;
    goodMin?: number;
    goodMax?: number;
}) {
    if (!detail) return <div className="text-gray-600">-</div>;

    const val = detail.predictedValue;
    const lower = detail.confidenceInterval[0];
    const upper = detail.confidenceInterval[1];

    let color = 'text-white';
    if (goodMin !== undefined) {
        if (val >= goodMin) color = 'text-green-400';
        else if (val >= goodMin * 0.8) color = 'text-yellow-400';
        else color = 'text-red-400';
    }
    // Handle ranges (like latency where too high is bad)
    if (goodMax !== undefined && val > goodMax && goodMin !== undefined) {
        // simplified logic: if generic "good" range logic needed, expand this
    }


    return (
        <div>
            <div className={`text-3xl font-bold ${color}`}>
                {(val * scale).toFixed(0)}{unit}
            </div>
            <div className="text-xs text-gray-500 mt-1 font-mono">
                Range: {(lower * scale).toFixed(0)} - {(upper * scale).toFixed(0)}
            </div>
            {/* Simple confidence bar */}
            <div className="w-full bg-gray-800 h-1 mt-2 rounded-full overflow-hidden relative">
                {/* Logic to show bar relative to some max? Complicated without global context. */}
                {/* Just show a small indicator for now/placeholder */}
                <div className="absolute left-0 top-0 bottom-0 bg-gray-600 w-full opacity-20"></div>
            </div>
        </div>
    );
}
