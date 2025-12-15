'use client';

import React, { useState } from 'react';
import { getOuraAuthUrl } from '@/services/ouraClient';

interface OuraConnectProps {
    isConnected: boolean;
    onConnect: (accessToken: string) => void;
    onDisconnect: () => void;
    dateRange?: { start: string; end: string };
    sleepNightsCount?: number;
}

/**
 * Oura Ring connection and data fetching component
 */
export function OuraConnect({
    isConnected,
    onConnect,
    onDisconnect,
    dateRange,
    sleepNightsCount,
}: OuraConnectProps) {
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [token, setToken] = useState('UVC3U4BLQLOZ5HUTTKKMBBMP6QJ6TOTZ');
    const [error, setError] = useState<string | null>(null);

    const handleConnect = () => {
        // For now, we'll use a personal access token flow
        // In production, this would use OAuth2
        setShowTokenInput(true);
    };

    const handleSubmitToken = () => {
        if (token.trim()) {
            onConnect(token.trim());
            setToken('');
            setShowTokenInput(false);
            setError(null);
        } else {
            setError('Please enter a valid access token');
        }
    };

    if (isConnected) {
        return (
            <div className="card">
                <div className="p-4 border-b border-[#262626] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center" style={{ boxShadow: '3px 3px 6px #080808, -3px -3px 6px #1a1a1a' }}>
                            <span className="text-lg">💍</span>
                        </div>
                        <div>
                            <h3 className="font-semibold text-green-400">Oura Connected</h3>
                            <p className="text-sm text-gray-400">Sleep data synced</p>
                        </div>
                    </div>
                    <button onClick={onDisconnect} className="btn-secondary text-sm">
                        Disconnect
                    </button>
                </div>

                {dateRange && (
                    <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                            <div className="stat-label">Date Range</div>
                            <div className="text-sm">{dateRange.start} to {dateRange.end}</div>
                        </div>
                        <div>
                            <div className="stat-label">Sleep Nights</div>
                            <div className="stat-value">{sleepNightsCount ?? 0}</div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="card">
            <div className="p-4 border-b border-[#222]">
                <h3 className="text-lg font-semibold">Connect Oura Ring</h3>
                <p className="text-sm text-gray-400 mt-1">
                    Link your Oura account to analyze sleep data
                </p>
            </div>

            <div className="p-4">
                {!showTokenInput ? (
                    <button onClick={handleConnect} className="btn-primary w-full flex items-center justify-center gap-2">
                        <span className="text-lg">💍</span>
                        Connect Oura Account
                    </button>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                Personal Access Token
                            </label>
                            <input
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Paste your Oura access token"
                                className="input-field"
                            />
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm">{error}</div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={handleSubmitToken} className="btn-primary flex-1">
                                Connect
                            </button>
                            <button onClick={() => setShowTokenInput(false)} className="btn-secondary">
                                Cancel
                            </button>
                        </div>

                        <div className="text-xs text-gray-500">
                            Get your token from{' '}
                            <a
                                href="https://cloud.ouraring.com/personal-access-tokens"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-400 hover:underline"
                            >
                                cloud.ouraring.com/personal-access-tokens
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
