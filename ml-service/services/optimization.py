
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
    MedicationData,
    PredictionDetail,
    SimulationResult
)

class MedicationOptimizer:
    def __init__(self):
        self.feature_scaler = StandardScaler()
        self.target_scalers: Dict[str, StandardScaler] = {}
        # One model per metric
        self.models: Dict[str, GaussianProcessRegressor] = {}
        # List of all known medications in sorting order for vectorization
        self.known_medications: List[str] = []
        self.med_stats = {} # Store min/max dose and timing
        self.is_trained = False
    
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

    def prepare_data_and_train(self, history: List[AlignedDataPoint]):
        """
        Prepare data and train models for ALL available metrics.
        This handles dynamic medication lists from the entire history.
        """
        # 1. Identify ALL unique medications
        all_meds = set()
        all_meds_data = defaultdict(list)
        
        for entry in history:
            for med_name, med_info in entry.medications.items():
                all_meds.add(med_name)
                all_meds_data[med_name].append({
                    'dose': med_info.get('total_mg', 0),
                    'time': self._parse_time_to_minutes(med_info.get('time', '22:00'))
                })
        
        # Sort alphabetically for consistent vectorization
        self.known_medications = sorted(list(all_meds))
        
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

        # 2. Build Feature Matrix X (Shared across all targets)
        X = []
        valid_indices = []
        
        for i, entry in enumerate(history):
            row = []
            has_meds = False
            for med in self.known_medications:
                if med in entry.medications:
                    info = entry.medications[med]
                    row.extend([
                        float(info.get('total_mg', 0)),
                        self._parse_time_to_minutes(info.get('time', '22:00'))
                    ])
                    has_meds = True
                else:
                    # Impute missing meds: 0 dose, average time (neutral)
                    row.extend([0.0, self.med_stats[med]['avg_time']])
            
            # Keep row even if no meds? Yes, baseline.
            X.append(row)
            valid_indices.append(i)
        
        if len(X) < 5:
            print("Not enough data to train models")
            return False

        X_array = np.array(X)
        self.feature_scaler.fit(X_array)
        X_scaled = self.feature_scaler.transform(X_array)

        # 3. Train a model for each metric
        # We iterate over all SleepMetricKey values
        metrics_to_train = [m.value for m in SleepMetricKey]
        
        for metric in metrics_to_train:
            # Extract y for this metric
            y = []
            X_metric = []
            
            for i in valid_indices:
                val = history[i].sleep_metrics.get(metric)
                if val is not None:
                    y.append(val)
                    X_metric.append(X_scaled[i])
            
            if len(y) < 5:
                continue # Skip metrics with sparse data
                
            y_array = np.array(y)
            scaler = StandardScaler()
            y_scaled = scaler.fit_transform(y_array.reshape(-1, 1)).flatten()
            self.target_scalers[metric] = scaler
            
            try:
                # GP Regressor
                model = GaussianProcessRegressor(
                    alpha=1e-2, 
                    n_restarts_optimizer=5, # Reduced for speed since we do multiple models
                    normalize_y=False
                )
                model.fit(np.array(X_metric), y_scaled)
                self.models[metric] = model
            except Exception as e:
                print(f"Failed to train model for {metric}: {e}")

        self.is_trained = True
        return True

    def optimize_next_night(self, target_metric: str) -> OptimizationResult:
        """Find the optimal configuration using Bayesian Optimization."""
        # Ensure model exists for target
        if not self.is_trained or target_metric not in self.models:
            return OptimizationResult(
                target_metric=target_metric,
                recommendations=[],
                predicted_score=0,
                confidence=0
            )

        model = self.models[target_metric]
        scaler = self.target_scalers[target_metric]
        
        # Limit search space to top impact meds to avoid curse of dimensionality in optimization step
        # Or just optimize commonly used meds?
        # Let's stick to full space but with fewer calls if dimension is high
        
        space = []
        for med in self.known_medications:
            stats = self.med_stats[med]
            space.append(Real(0.0, stats['max_dose'] * 1.5, name=f"{med}_dose"))
            space.append(Real(max(0, stats['min_time'] - 60), min(1200, stats['max_time'] + 60), name=f"{med}_time"))

        def objective(x):
            X_in = np.array(x).reshape(1, -1)
            X_scaled = self.feature_scaler.transform(X_in)
            pred_scaled = model.predict(X_scaled)[0]
            # Maximize score (minimize negative)
            return -pred_scaled

        # Reduce iterations for speed if many meds
        n_calls = 20 if len(self.known_medications) > 10 else 30
        
        try:
            res = gp_minimize(
                objective,
                space,
                n_calls=n_calls,
                n_random_starts=10,
                random_state=42
            )
            
            best_x = res.x
            # Transform back
            X_best_scaled = self.feature_scaler.transform(np.array(best_x).reshape(1, -1))
            pred_scaled, sigma_scaled = model.predict(X_best_scaled, return_std=True)
            
            predicted_val = scaler.inverse_transform(pred_scaled.reshape(-1, 1))[0][0]
            confidence = max(0, 1 - float(sigma_scaled[0]))

            # Suggestions logic (similar as before)
            suggestions = []
            for i, med in enumerate(self.known_medications):
                dose = best_x[2*i]
                time_mins = best_x[2*i + 1]
                
                if dose > self.med_stats[med]['avg_dose'] * 0.1:
                    # Marginal impact
                    baseline_x = list(best_x)
                    baseline_x[2*i] = 0
                    X_base_scaled = self.feature_scaler.transform(np.array(baseline_x).reshape(1, -1))
                    base_pred_scaled = model.predict(X_base_scaled)[0]
                    base_pred = scaler.inverse_transform(base_pred_scaled.reshape(-1, 1))[0][0]
                    impact = predicted_val - base_pred
                    
                    suggestions.append(OptimizationSuggestion(
                        medication=med,
                        dose_mg=round(dose, 1),
                        time=self._minutes_to_time(time_mins),
                        predicted_impact=round(impact, 2),
                        confidence=round(confidence, 2)
                    ))
            
            suggestions.sort(key=lambda x: x.predicted_impact, reverse=True)
            
            return OptimizationResult(
                target_metric=target_metric,
                recommendations=suggestions,
                predicted_score=round(predicted_val, 1),
                confidence=round(confidence, 2)
            )
            
        except Exception as e:
            print(f"Optimization loop failed: {e}")
            return OptimizationResult(target_metric=target_metric, recommendations=[], predicted_score=0, confidence=0)

    def simulate_configuration(self, meds: List[MedicationData]) -> SimulationResult:
        """
        Predict ALL metrics for a specific configuration.
        """
        if not self.is_trained:
            return SimulationResult(predictions={})

        # Construct vector
        row = []
        med_map = {m.normalized_name: m for m in meds}
        
        # Must align with self.known_medications order
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
        
        predictions = {}
        
        for metric, model in self.models.items():
            scaler = self.target_scalers[metric]
            pred_scaled, sigma_scaled = model.predict(X_scaled, return_std=True)
            
            pred = scaler.inverse_transform(pred_scaled.reshape(-1, 1))[0][0]
            # Standard Deviation in real units
            sigma = sigma_scaled[0] * scaler.scale_[0]
            
            # Simplified percentile (assume 50 for now)
            percentile = 50.0
            
            predictions[metric] = PredictionDetail(
                predicted_value=float(pred),
                confidence_interval=(float(pred - 1.96 * sigma), float(pred + 1.96 * sigma)),
                percentile=percentile
            )
            
        return SimulationResult(predictions=predictions)

# Global instance
optimizer_instance = MedicationOptimizer()
