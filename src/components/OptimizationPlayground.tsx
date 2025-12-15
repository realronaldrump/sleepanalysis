
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Slider, { SliderProps } from 'rc-slider';
import 'rc-slider/assets/index.css';
import { AlignedDataPoint } from '@/types/analysis';
import { simulateConfiguration } from '@/services/mlClient';
import { SimulationResult, OptimizationSuggestion } from '@/types/mlTypes';

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

    // Initialize configs from data
    useEffect(() => {
        const meds = new Set<string>();
        // Get top 5 most frequent meds
        const counts: Record<string, number> = {};
        alignedData.forEach(d => {
            d.medications.forEach((val, key) => {
                counts[key] = (counts[key] || 0) + 1;
            });
        });

        const topMeds = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);

        const initialConfigs = topMeds.map(name => ({
            name,
            dose: 5, // Default
            time: 600, // 10 PM (minutes from noon)
            enabled: false
        }));

        setConfigs(initialConfigs);
    }, [alignedData]);

    // Debounced simulation
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (configs.some(c => c.enabled)) {
                setIsSimulating(true);
                try {
                    const activeConfigs = configs.filter(c => c.enabled);
                    const requestMeds = activeConfigs.map(c => ({
                        name: c.name,
                        normalized_name: c.name,
                        drug_class: 'other', // optimizing placeholder
                        quantity: 1,
                        dosage_mg: c.dose,
                        total_mg: c.dose,
                        time: minutesToTime(c.time)
                    }));

                    const res = await simulateConfiguration(requestMeds);
                    setResult(res);
                } catch (e) {
                    console.error("Simulation error", e);
                } finally {
                    setIsSimulating(false);
                }
            } else {
                setResult(null);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [configs]);

    const handleConfigChange = (index: number, changes: Partial<MedConfig>) => {
        const newConfigs = [...configs];
        newConfigs[index] = { ...newConfigs[index], ...changes };
        setConfigs(newConfigs);
    };

    const minutesToTime = (mins: number) => {
        const totalMins = mins + 12 * 60; // Add 12 hours offset
        const h = Math.floor(totalMins / 60) % 24;
        const m = totalMins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const formatTimeDisplay = (mins: number) => {
        const totalMins = mins + 12 * 60;
        const h = Math.floor(totalMins / 60) % 24;
        const m = totalMins % 60;
        const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    return (
        <div className="card p-6 bg-[#1a1a1a] border-sky-500/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                🧪 Optimization Playground
            </h3>
            <p className="text-sm text-gray-400 mb-6">
                Experiment with different medication timings and dosages to see the predicted effect on your sleep score.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    {configs.map((config, idx) => (
                        <div key={config.name} className={`p-4 rounded-lg border transition-all ${config.enabled
                                ? 'bg-[#222] border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                                : 'bg-[#151515] border-transparent opacity-70'
                            }`}>
                            <div className="flex items-center justify-between mb-4">
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
                                {config.enabled && (
                                    <div className="text-xs text-sky-400 font-mono">Active</div>
                                )}
                            </div>

                            {config.enabled && (
                                <div className="space-y-4 px-2">
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                                            <span>Dose (mg)</span>
                                            <span className="text-white font-mono">{config.dose} mg</span>
                                        </div>
                                        <Slider
                                            min={0}
                                            max={500} // Arbitrary max, could range per med
                                            step={1}
                                            value={config.dose}
                                            onChange={(val) => handleConfigChange(idx, { dose: val as number })}
                                            trackStyle={{ backgroundColor: '#0ea5e9' }}
                                            handleStyle={{ borderColor: '#0ea5e9', backgroundColor: '#000' }}
                                            railStyle={{ backgroundColor: '#333' }}
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                                            <span>Time</span>
                                            <span className="text-white font-mono">{formatTimeDisplay(config.time)}</span>
                                        </div>
                                        <Slider
                                            min={360} // 6 PM
                                            max={960} // 4 AM next day
                                            step={15}
                                            value={config.time}
                                            onChange={(val) => handleConfigChange(idx, { time: val as number })}
                                            trackStyle={{ backgroundColor: '#a855f7' }}
                                            handleStyle={{ borderColor: '#a855f7', backgroundColor: '#000' }}
                                            railStyle={{ backgroundColor: '#333' }}
                                        />
                                        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                                            <span>6 PM</span>
                                            <span>12 AM</span>
                                            <span>4 AM</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex flex-col justify-center">
                    <div className="bg-[#111] rounded-xl p-6 border border-gray-800 relative overflow-hidden">
                        {isSimulating && (
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
                                <div className="animate-spin text-2xl">⏳</div>
                            </div>
                        )}

                        <h4 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-8 text-center">
                            Predicted Sleep Score
                        </h4>

                        {result ? (
                            <div className="text-center">
                                <div className="text-6xl font-bold text-white mb-2 tracking-tighter"
                                    style={{ textShadow: '0 0 30px rgba(255,255,255,0.1)' }}>
                                    {result.predictedValue.toFixed(0)}
                                </div>

                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 border border-gray-800 text-xs text-gray-400 mb-6">
                                    <span>CI: {result.confidenceInterval[0].toFixed(0)} - {result.confidenceInterval[1].toFixed(0)}</span>
                                </div>

                                <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden relative">
                                    {/* Gradient bar based on score */}
                                    <div
                                        className="h-full transition-all duration-500 ease-out"
                                        style={{
                                            width: `${result.predictedValue}%`,
                                            backgroundColor: result.predictedValue > 85 ? '#22c55e' : result.predictedValue > 70 ? '#eab308' : '#ef4444'
                                        }}
                                    />
                                    {/* Confidence Range Marker */}
                                    <div
                                        className="absolute top-0 bottom-0 bg-white/20"
                                        style={{
                                            left: `${result.confidenceInterval[0]}%`,
                                            width: `${result.confidenceInterval[1] - result.confidenceInterval[0]}%`
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mt-2 font-mono">
                                    <span>0</span>
                                    <span>100</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-600">
                                Select and configure medications to see prediction
                            </div>
                        )}
                    </div>

                    {/* Recommendations Panel */}
                    {recommendations.length > 0 && (
                        <div className="mt-6">
                            <h4 className="text-sm font-medium text-gray-400 mb-3">AI Suggestions</h4>
                            <div className="space-y-2">
                                {recommendations.slice(0, 3).map((rec, i) => (
                                    <div key={i} className="text-xs bg-[#111] p-3 rounded border border-gray-800 hover:border-sky-500/30 transition-colors cursor-pointer"
                                        onClick={() => {
                                            // Apply suggestion
                                            const idx = configs.findIndex(c => c.name === rec.medication);
                                            if (idx !== -1) {
                                                const timeParts = rec.time.split(':');
                                                let mins = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
                                                // Normalize to noon-base
                                                if (parseInt(timeParts[0]) < 12) mins += 24 * 60;
                                                mins -= 12 * 60;

                                                handleConfigChange(idx, {
                                                    enabled: true,
                                                    dose: rec.doseMg,
                                                    time: mins
                                                });
                                            }
                                        }}>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sky-400 font-semibold">{rec.medication}</span>
                                            <span className="text-green-400">+{rec.predictedImpact.toFixed(1)}</span>
                                        </div>
                                        <div className="text-gray-500">
                                            Try {rec.doseMg}mg at {rec.time}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

