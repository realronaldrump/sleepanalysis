
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from skopt import gp_minimize, load, dump
from skopt.learning import GaussianProcessRegressor
from skopt.space import Real, Integer
from sklearn.preprocessing import StandardScaler
from collections import defaultdict
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

from models.schemas import (
    AlignedDataPoint,
    SleepMetricKey,
    OptimizationResult,
    OptimizationSuggestion,
    MedicationData
)

class MedicationOptimizer:
    def __init__(self):
        self.feature_scaler = StandardScaler()
        self.target_scaler = StandardScaler()
        self.model = None
        self.known_medications = []
        self.med_stats = {} # Store min/max dose and timing
    
    def _parse_time_to_minutes(self, time_str: str) -> float:
        """Convert HH:MM to minutes from noon (12:00)."""
        if not time_str:
            return 0.0
        try:
            h, m = map(int, time_str.split(':'))
            # Adjust so 12:00 is 0, 24:00 is 720, 26:00 (2 AM) is 840
            minutes = h * 60 + m
            if h < 12: # Assume next day (AM)
                minutes += 24 * 60
            return float(minutes - 12 * 60) 
        except:
            return 0.0

    def _minutes_to_time(self, minutes: float) -> str:
        """Convert minutes from noon back to HH:MM."""
        total_minutes = int(minutes + 12 * 60)
        h = (total_minutes // 60) % 24
        m = total_minutes % 60
        return f"{h:02d}:{m:02d}"

    def prepare_data(self, history: List[AlignedDataPoint], target_metric: str):
        """Prepare data for training."""
        # 1. Identify top medications (limit to top 5 for dimensionality)
        med_counts = defaultdict(int)
        all_meds_data = defaultdict(list)
        
        for entry in history:
            for med_name, med_info in entry.medications.items():
                med_counts[med_name] += 1
                all_meds_data[med_name].append({
                    'dose': med_info.get('total_mg', 0),
                    'time': self._parse_time_to_minutes(med_info.get('time', '22:00'))
                })
        
        # Sort by frequency
        self.known_medications = sorted(med_counts.keys(), key=lambda k: med_counts[k], reverse=True)[:5]
        
        # Store stats for normalization/ranges
        for med in self.known_medications:
            data = all_meds_data[med]
            doses = [d['dose'] for d in data if d['dose'] > 0]
            times = [d['time'] for d in data]
            
            self.med_stats[med] = {
                'min_dose': min(doses) if doses else 0,
                'max_dose': max(doses) if doses else 10,
                'avg_dose': np.mean(doses) if doses else 5,
                'min_time': min(times) if times else 600, # 10 PM
                'max_time': max(times) if times else 840, # 2 AM
                'avg_time': np.mean(times) if times else 720 # 12 AM
            }

        # 2. Build Feature Matrix X and Target y
        X = []
        y = []
        
        for entry in history:
            target_val = entry.sleep_metrics.get(target_metric)
            if target_val is None:
                continue
                
            row = []
            valid_row = False
            for med in self.known_medications:
                if med in entry.medications:
                    info = entry.medications[med]
                    row.extend([
                        float(info.get('total_mg', 0)),
                        self._parse_time_to_minutes(info.get('time', '22:00'))
                    ])
                    valid_row = True
                else:
                    # Impute missing meds as 0 dose, and average time (neutral)
                    # Or maybe 0 time? Time matters less if dose is 0.
                    row.extend([0.0, self.med_stats[med]['avg_time']])
            
            if valid_row:
                X.append(row)
                y.append(target_val)
        
        return np.array(X), np.array(y)

    def train(self, history: List[AlignedDataPoint], target_metric: str = SleepMetricKey.SLEEP_SCORE):
        """Train the Gaussian Process."""
        try:
            X, y = self.prepare_data(history, target_metric)
            if len(X) < 5:
                # Not enough data
                return False

            # Normalize
            X_scaled = self.feature_scaler.fit_transform(X)
            y_scaled = self.target_scaler.fit_transform(y.reshape(-1, 1)).flatten()

            # Train GP
            # Using Matern kernel is standard for BO
            self.model = GaussianProcessRegressor(
                alpha=1e-2, # Noise observation
                n_restarts_optimizer=10,
                normalize_y=False # We handled it
            )
            self.model.fit(X_scaled, y_scaled)
            return True
        except Exception as e:
            print(f"Training failed: {e}")
            return False

    def optimize_next_night(self, target_metric: str) -> OptimizationResult:
        """Find the optimal configuration using Bayesian Optimization."""
        if not self.model or not self.known_medications:
            return OptimizationResult(
                target_metric=target_metric,
                recommendations=[],
                predicted_score=0,
                confidence=0
            )

        # Define search space
        # For each medication: Dose (0 to 1.5x max), Time (min_time - 60 to max_time + 60)
        space = []
        for med in self.known_medications:
            stats = self.med_stats[med]
            space.append(Real(0.0, stats['max_dose'] * 1.5, name=f"{med}_dose"))
            space.append(Real(max(0, stats['min_time'] - 60), min(1200, stats['max_time'] + 60), name=f"{med}_time"))

        # Objective function for minimization (negative sleep score)
        def objective(x):
            X_in = np.array(x).reshape(1, -1)
            X_scaled = self.feature_scaler.transform(X_in)
            
            # Predict
            pred_scaled, sigma = self.model.predict(X_scaled, return_std=True)
            pred = self.target_scaler.inverse_transform(pred_scaled.reshape(-1, 1))[0][0]
            
            # Penalize super high doses if outside standard deviation (soft constraint) / or implicit in GP
            # But let's trust GP for now.
            return -pred # We want to maximize score

        # Run optimization
        res = gp_minimize(
            objective,
            space,
            n_calls=30,
            n_random_starts=10,
            random_state=42
        )

        # Parse result
        best_x = res.x
        predicted_max_score = -res.fun
        
        # Calculate confidence at this point
        X_best_scaled = self.feature_scaler.transform(np.array(best_x).reshape(1, -1))
        _, sigma = self.model.predict(X_best_scaled, return_std=True)
        # Sigma is in scaled space. Approximate confidence 0-1.
        confidence = max(0, 1 - float(sigma[0])) 

        suggestions = []
        for i, med in enumerate(self.known_medications):
            dose = best_x[2*i]
            time_mins = best_x[2*i + 1]
            
            # Threshold: If dose is significant (e.g., > 10% of avg), recommend it
            if dose > self.med_stats[med]['avg_dose'] * 0.1:
                # Calculate individual impact (marginal)
                # Create a baseline vector where this med is 0
                baseline_x = list(best_x)
                baseline_x[2*i] = 0
                X_base_scaled = self.feature_scaler.transform(np.array(baseline_x).reshape(1, -1))
                base_pred_scaled = self.model.predict(X_base_scaled)[0]
                base_pred = self.target_scaler.inverse_transform(base_pred_scaled.reshape(-1, 1))[0][0]
                
                impact = predicted_max_score - base_pred
                
                suggestions.append(OptimizationSuggestion(
                    medication=med,
                    dose_mg=round(dose, 1),
                    time=self._minutes_to_time(time_mins),
                    predicted_impact=round(impact, 2),
                    confidence=round(confidence, 2) # Simplify
                ))

        # Sort by impact
        suggestions.sort(key=lambda x: x.predicted_impact, reverse=True)

        return OptimizationResult(
            target_metric=target_metric,
            recommendations=suggestions,
            predicted_score=round(predicted_max_score, 1),
            confidence=round(confidence, 2)
        )

    def simulate_configuration(self, meds: List[MedicationData]) -> Tuple[float, float, float]:
        """
        Predict outcome for a specific configuration.
        Returns: (Predicted Value, Std Dev, Percentile)
        """
        if not self.model or not self.known_medications:
            return 0.0, 0.0, 0.0

        # Construct vector
        row = []
        med_map = {m.normalized_name: m for m in meds}
        
        for med in self.known_medications:
            if med in med_map:
                m = med_map[med]
                row.extend([
                    m.total_mg,
                    self._parse_time_to_minutes(m.time)
                ])
            else:
                 row.extend([0.0, self.med_stats[med]['avg_time']])
        
        X_in = np.array(row).reshape(1, -1)
        X_scaled = self.feature_scaler.transform(X_in)
        
        pred_scaled, sigma_scaled = self.model.predict(X_scaled, return_std=True)
        
        pred = self.target_scaler.inverse_transform(pred_scaled.reshape(-1, 1))[0][0]
        # Sigma scaling approximation
        sigma = sigma_scaled[0] * self.target_scaler.scale_[0]
        
        # Percentile? We need historical Y distribution
        # For now, return 0.5 as placeholder if we don't store history Y
        percentile = 0.5 
        
        return float(pred), float(sigma), percentile

# Global instance for caching state (simplified for MVP)
optimizer_instance = MedicationOptimizer()
