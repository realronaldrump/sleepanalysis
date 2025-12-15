"""
Medication Optimization Service
Uses CatBoost for prediction and NSGA-II for multi-objective optimization.
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Optional
from collections import defaultdict
import warnings

from catboost import CatBoostRegressor
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import Problem
from pymoo.optimize import minimize as pymoo_minimize
from pymoo.termination import get_termination
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

from models.schemas import (
    AlignedDataPoint,
    SleepMetricKey,
    OptimizationResult,
    OptimizationSuggestion,
    MedicationData,
    PredictionDetail,
    SimulationResult,
    ParetoSolution,
    MultiObjectiveResult,
)


class MedicationOptimizer:
    """
    Medication stack optimizer using CatBoost for predictions
    and NSGA-II for multi-objective optimization.
    """
    
    def __init__(self):
        self.feature_scaler = StandardScaler()
        # Models per metric: {metric: {quantile: model}}
        self.models: Dict[str, Dict[int, CatBoostRegressor]] = {}
        self.known_medications: List[str] = []
        self.med_stats: Dict[str, dict] = {}
        self.is_trained = False
    
    def _parse_time_to_minutes(self, time_str: str) -> float:
        """Convert HH:MM to minutes from noon (12:00)."""
        if not time_str:
            return 0.0
        try:
            h, m = map(int, time_str.split(':'))
            minutes = h * 60 + m
            if h < 12:
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

    def prepare_data_and_train(self, history: List[AlignedDataPoint]) -> bool:
        """
        Prepare data and train CatBoost quantile models for ALL metrics.
        Uses quantile regression for 10th, 50th, 90th percentiles.
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
                'min_time': min(times) if times else 600,
                'max_time': max(times) if times else 840,
                'avg_time': np.mean(times) if times else 720
            }

        # 2. Build Feature Matrix X (dose only, no timing for simplicity)
        X = []
        valid_indices = []
        
        for i, entry in enumerate(history):
            row = []
            for med in self.known_medications:
                if med in entry.medications:
                    info = entry.medications[med]
                    row.append(float(info.get('total_mg', 0)))
                else:
                    row.append(0.0)
            
            X.append(row)
            valid_indices.append(i)
        
        if len(X) < 10:
            print("Not enough data to train models (need at least 10 samples)")
            return False

        X_array = np.array(X)
        self.feature_scaler.fit(X_array)
        X_scaled = self.feature_scaler.transform(X_array)

        # 3. Train CatBoost quantile models for each metric
        metrics_to_train = [m.value for m in SleepMetricKey]
        quantiles = [10, 50, 90]
        
        for metric in metrics_to_train:
            y = []
            X_metric = []
            
            for i in valid_indices:
                val = history[i].sleep_metrics.get(metric)
                if val is not None:
                    y.append(val)
                    X_metric.append(X_scaled[i])
            
            if len(y) < 10:
                continue
                
            y_array = np.array(y)
            X_metric_array = np.array(X_metric)
            
            self.models[metric] = {}
            
            for q in quantiles:
                try:
                    model = CatBoostRegressor(
                        loss_function=f'Quantile:alpha={q/100}',
                        iterations=200,
                        depth=4,
                        learning_rate=0.1,
                        verbose=0,
                        random_seed=42
                    )
                    model.fit(X_metric_array, y_array)
                    self.models[metric][q] = model
                except Exception as e:
                    print(f"Failed to train {metric} q{q}: {e}")

        self.is_trained = len(self.models) > 0
        print(f"Trained models for {len(self.models)} metrics")
        return self.is_trained

    def optimize_multi_objective(self) -> MultiObjectiveResult:
        """
        Multi-objective optimization using NSGA-II.
        Objectives: Maximize Deep Sleep, Maximize REM, Minimize Latency.
        Returns Pareto frontier of optimal trade-offs.
        """
        if not self.is_trained:
            return MultiObjectiveResult(
                pareto_frontier=[],
                objective_names=[],
                recommendation="Not enough data to optimize."
            )
        
        # Define objectives (metrics we care about)
        objective_metrics = ['deepSleepMinutes', 'remSleepMinutes', 'latencyMinutes']
        available_objectives = [m for m in objective_metrics if m in self.models]
        
        if len(available_objectives) < 2:
            return MultiObjectiveResult(
                pareto_frontier=[],
                objective_names=available_objectives,
                recommendation="Need at least 2 metrics with trained models for multi-objective optimization."
            )
        
        n_meds = len(self.known_medications)
        optimizer_self = self
        
        class SleepProblem(Problem):
            def __init__(self):
                # Bounds: 0 to max_dose for each medication
                xl = np.zeros(n_meds)
                xu = np.array([optimizer_self.med_stats[m]['max_dose'] * 1.2 for m in optimizer_self.known_medications])
                super().__init__(n_var=n_meds, n_obj=len(available_objectives), xl=xl, xu=xu)
            
            def _evaluate(self, X_pop, out, *args, **kwargs):
                F = []
                for x in X_pop:
                    X_scaled = optimizer_self.feature_scaler.transform(x.reshape(1, -1))
                    objectives = []
                    
                    for metric in available_objectives:
                        pred = optimizer_self.models[metric][50].predict(X_scaled)[0]
                        # Minimize: negate things we want to maximize
                        if metric in ['deepSleepMinutes', 'remSleepMinutes', 'sleepEfficiency']:
                            objectives.append(-pred)  # Maximize -> minimize negative
                        else:
                            objectives.append(pred)  # Minimize as-is (latency)
                    
                    F.append(objectives)
                
                out["F"] = np.array(F)
        
        problem = SleepProblem()
        algorithm = NSGA2(pop_size=40)
        termination = get_termination("n_gen", 30)
        
        try:
            res = pymoo_minimize(problem, algorithm, termination, seed=42, verbose=False)
            
            if res.X is None or len(res.X) == 0:
                return MultiObjectiveResult(
                    pareto_frontier=[],
                    objective_names=available_objectives,
                    recommendation="Optimization did not converge."
                )
            
            # Build Pareto frontier
            pareto_solutions = []
            
            # Handle both single solution and population
            solutions = res.X if res.X.ndim > 1 else [res.X]
            
            for idx, x in enumerate(solutions[:10]):  # Limit to top 10 solutions
                X_scaled = self.feature_scaler.transform(x.reshape(1, -1))
                
                # Get predictions for all objectives
                obj_values = {}
                for metric in available_objectives:
                    pred = self.models[metric][50].predict(X_scaled)[0]
                    obj_values[metric] = round(float(pred), 1)
                
                # Build medication suggestions
                suggestions = []
                for i, med in enumerate(self.known_medications):
                    dose = x[i]
                    if dose > self.med_stats[med]['avg_dose'] * 0.1:
                        suggestions.append(OptimizationSuggestion(
                            medication=med,
                            dose_mg=round(float(dose), 1),
                            time="22:00",  # Default time
                            predicted_impact=0.0,  # Not computing individual impact for Pareto
                            confidence=0.8
                        ))
                
                # Generate trade-off description
                deep = obj_values.get('deepSleepMinutes', 0)
                rem = obj_values.get('remSleepMinutes', 0)
                latency = obj_values.get('latencyMinutes', 0)
                
                if deep > rem:
                    desc = f"Deep sleep focused: {deep:.0f}m deep, {rem:.0f}m REM"
                elif rem > deep:
                    desc = f"REM focused: {rem:.0f}m REM, {deep:.0f}m deep"
                else:
                    desc = f"Balanced: {deep:.0f}m deep, {rem:.0f}m REM"
                
                if latency < 15:
                    desc += ", fast onset"
                elif latency > 30:
                    desc += ", slower onset"
                
                pareto_solutions.append(ParetoSolution(
                    medications=suggestions,
                    objectives=obj_values,
                    trade_off_description=desc
                ))
            
            # Sort by deep sleep (primary)
            pareto_solutions.sort(key=lambda s: -s.objectives.get('deepSleepMinutes', 0))
            
            recommendation = self._generate_pareto_recommendation(pareto_solutions, available_objectives)
            
            return MultiObjectiveResult(
                pareto_frontier=pareto_solutions,
                objective_names=available_objectives,
                recommendation=recommendation
            )
            
        except Exception as e:
            print(f"NSGA-II optimization failed: {e}")
            return MultiObjectiveResult(
                pareto_frontier=[],
                objective_names=available_objectives,
                recommendation=f"Optimization failed: {str(e)}"
            )

    def _generate_pareto_recommendation(self, solutions: List[ParetoSolution], objectives: List[str]) -> str:
        """Generate a human-readable recommendation from Pareto frontier."""
        if not solutions:
            return "No optimal solutions found."
        
        if len(solutions) == 1:
            return f"Found one optimal configuration: {solutions[0].trade_off_description}"
        
        # Find extremes
        best_deep = max(solutions, key=lambda s: s.objectives.get('deepSleepMinutes', 0))
        best_rem = max(solutions, key=lambda s: s.objectives.get('remSleepMinutes', 0))
        
        deep_val = best_deep.objectives.get('deepSleepMinutes', 0)
        rem_val = best_rem.objectives.get('remSleepMinutes', 0)
        
        return (
            f"Found {len(solutions)} optimal trade-offs. "
            f"Best deep sleep: {deep_val:.0f}m. Best REM: {rem_val:.0f}m. "
            f"Choose based on your priority."
        )

    def optimize_next_night(self, target_metric: str) -> OptimizationResult:
        """
        Single-objective optimization for backward compatibility.
        Uses the multi-objective result but returns the best solution for target metric.
        """
        if not self.is_trained or target_metric not in self.models:
            return OptimizationResult(
                target_metric=target_metric,
                recommendations=[],
                predicted_score=0,
                confidence=0
            )
        
        # Simple grid search for single objective
        best_x = None
        best_score = float('-inf') if target_metric not in ['latencyMinutes'] else float('inf')
        
        # Generate candidates
        n_samples = 100
        candidates = []
        for _ in range(n_samples):
            x = []
            for med in self.known_medications:
                stats = self.med_stats[med]
                # Random dose between 0 and max
                dose = np.random.uniform(0, stats['max_dose'])
                # 50% chance of being 0 (not taken)
                if np.random.random() < 0.5:
                    dose = 0
                x.append(dose)
            candidates.append(x)
        
        X_candidates = np.array(candidates)
        X_scaled = self.feature_scaler.transform(X_candidates)
        
        predictions = self.models[target_metric][50].predict(X_scaled)
        
        if target_metric in ['latencyMinutes', 'restlessPeriods', 'avgHeartRate']:
            # Minimize
            best_idx = np.argmin(predictions)
        else:
            # Maximize
            best_idx = np.argmax(predictions)
        
        best_x = X_candidates[best_idx]
        best_pred = predictions[best_idx]
        
        # Get confidence interval
        p10 = self.models[target_metric][10].predict(X_scaled[best_idx:best_idx+1])[0]
        p90 = self.models[target_metric][90].predict(X_scaled[best_idx:best_idx+1])[0]
        
        # Build suggestions
        suggestions = []
        for i, med in enumerate(self.known_medications):
            dose = best_x[i]
            if dose > self.med_stats[med]['avg_dose'] * 0.1:
                # Calculate marginal impact
                baseline_x = best_x.copy()
                baseline_x[i] = 0
                baseline_pred = self.models[target_metric][50].predict(
                    self.feature_scaler.transform(baseline_x.reshape(1, -1))
                )[0]
                impact = best_pred - baseline_pred
                
                suggestions.append(OptimizationSuggestion(
                    medication=med,
                    dose_mg=round(float(dose), 1),
                    time="22:00",
                    predicted_impact=round(float(impact), 2),
                    confidence=0.8
                ))
        
        suggestions.sort(key=lambda x: abs(x.predicted_impact), reverse=True)
        
        # Confidence based on interval width relative to prediction
        interval_width = abs(p90 - p10)
        confidence = max(0.3, min(0.95, 1 - (interval_width / (abs(best_pred) + 1))))
        
        return OptimizationResult(
            target_metric=target_metric,
            recommendations=suggestions[:10],
            predicted_score=round(float(best_pred), 1),
            confidence=round(float(confidence), 2)
        )

    def simulate_configuration(self, meds: List[MedicationData]) -> SimulationResult:
        """
        Predict ALL metrics for a specific medication configuration.
        Uses quantile regression for accurate confidence intervals.
        """
        if not self.is_trained:
            return SimulationResult(predictions={})

        # Construct feature vector
        row = []
        med_map = {m.normalized_name: m for m in meds}
        
        for med in self.known_medications:
            if med in med_map:
                row.append(med_map[med].total_mg)
            else:
                row.append(0.0)
        
        X_in = np.array(row).reshape(1, -1)
        X_scaled = self.feature_scaler.transform(X_in)
        
        predictions = {}
        
        for metric, quantile_models in self.models.items():
            if 10 in quantile_models and 50 in quantile_models and 90 in quantile_models:
                p10 = float(quantile_models[10].predict(X_scaled)[0])
                p50 = float(quantile_models[50].predict(X_scaled)[0])
                p90 = float(quantile_models[90].predict(X_scaled)[0])
                
                # Calculate percentile relative to historical data
                # (simplified: use 50 as the prediction)
                predictions[metric] = PredictionDetail(
                    predicted_value=p50,
                    confidence_interval=(p10, p90),
                    percentile=50.0
                )
        
        return SimulationResult(predictions=predictions)


# Global instance
optimizer_instance = MedicationOptimizer()
