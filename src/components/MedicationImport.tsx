'use client';

import React, { useCallback, useState } from 'react';
import { parseMedicationCsv } from '@/services/medicationParser';
import { MedicationLogResult } from '@/types/medication';

interface MedicationImportProps {
    onImport: (result: MedicationLogResult) => void;
}

/**
 * Drag-and-drop medication CSV import component
 */
export function MedicationImport({ onImport }: MedicationImportProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<MedicationLogResult | null>(null);

    const handleFile = useCallback(async (file: File) => {
        setIsLoading(true);
        setError(null);

        try {
            const text = await file.text();
            const result = parseMedicationCsv(text);

            if (result.parsingErrors.length > 0 && result.entries.length === 0) {
                setError(`Failed to parse CSV. First error: ${result.parsingErrors[0].error}`);
                return;
            }

            setPreview(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to read file');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            handleFile(file);
        } else {
            setError('Please drop a CSV file');
        }
    }, [handleFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile]);

    const confirmImport = useCallback(() => {
        if (preview) {
            onImport(preview);
            setPreview(null);
        }
    }, [preview, onImport]);

    // Group by drug class for preview
    const getClassCounts = () => {
        if (!preview) return {};
        const counts: Record<string, number> = {};
        for (const entry of preview.entries) {
            counts[entry.drugClass] = (counts[entry.drugClass] || 0) + 1;
        }
        return counts;
    };

    if (preview) {
        const classCounts = getClassCounts();

        return (
            <div className="card">
                <div className="p-4 border-b border-[#222]">
                    <h3 className="text-lg font-semibold text-green-400">✓ CSV Parsed Successfully</h3>
                </div>

                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <div className="stat-label">Total Entries</div>
                            <div className="stat-value">{preview.totalEntries.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="stat-label">Unique Medications</div>
                            <div className="stat-value">{preview.uniqueDrugs.size}</div>
                        </div>
                        <div>
                            <div className="stat-label">Date Range</div>
                            <div className="text-sm">
                                {preview.dateRange.start} to {preview.dateRange.end}
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="stat-label mb-2">By Category</div>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(classCounts).map(([cls, count]) => (
                                <span key={cls} className="px-2 py-1 bg-[#1a1a1a] rounded text-sm">
                                    {cls.replace('_', ' ')}: {count}
                                </span>
                            ))}
                        </div>
                    </div>

                    {preview.parsingErrors.length > 0 && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <div className="text-yellow-400 text-sm font-medium">
                                {preview.parsingErrors.length} parsing warnings
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                These rows were skipped but the rest imported successfully.
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={confirmImport} className="btn-primary flex-1">
                            Import {preview.totalEntries.toLocaleString()} Entries
                        </button>
                        <button onClick={() => setPreview(null)} className="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="p-4 border-b border-[#222]">
                <h3 className="text-lg font-semibold">Import Medication Log</h3>
                <p className="text-sm text-gray-400 mt-1">
                    Upload your CSV file exported from Guava Health
                </p>
            </div>

            <div className="p-4">
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`
            relative border-2 border-dashed rounded-xl p-8 text-center
            transition-all duration-200 cursor-pointer
            ${isDragging ? 'border-primary-500 bg-primary-500/10' : 'border-[#333] hover:border-[#444]'}
            ${isLoading ? 'opacity-50 pointer-events-none' : ''}
          `}
                >
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileInput}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />

                    <div className="text-4xl mb-3">📄</div>

                    {isLoading ? (
                        <div className="text-gray-400">Processing...</div>
                    ) : (
                        <>
                            <div className="font-medium mb-1">
                                Drop your CSV file here
                            </div>
                            <div className="text-sm text-gray-400">
                                or click to browse
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="mt-4 p-3 bg-[#0a0a0a] rounded-lg">
                    <div className="text-xs text-gray-500 font-medium mb-1">Expected CSV format:</div>
                    <code className="text-xs text-gray-400">
                        date,time,name,quantity<br />
                        2024-01-15,22:30,temazepam 15 mg capsule,2
                    </code>
                </div>
            </div>
        </div>
    );
}
