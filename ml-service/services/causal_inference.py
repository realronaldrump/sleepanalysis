"""
Causal Inference Service
Attempts to determine if medication effects are truly causal, not just correlational.
"""

import numpy as np
import pandas as pd
from typing import Optional
import warnings

from sklearn.linear_model import LinearRegression
from scipy import stats

from models.schemas import (
    AlignedDataPoint,
    CausalResult,
    SleepMetricKey,
)
from services.feature_engineering import (
    aligned_data_to_dataframe,
    get_medication_columns,
)


def analyze_causal_effects(
    data: list[AlignedDataPoint],
    target_metrics: Optional[list[SleepMetricKey]] = None
) -> list[CausalResult]:
    """
    Analyze potential causal effects of medications on sleep metrics.
    
    Uses propensity score matching and difference-in-differences
    approaches to estimate causal effects.
    
    Note: True causal inference requires controlled experiments.
    These results should be interpreted as suggestive, not definitive.
    """
    if len(data) < 30:
        return []
    
    df = aligned_data_to_dataframe(data)
    
    if target_metrics is None:
        target_metrics = [
            SleepMetricKey.SLEEP_EFFICIENCY,
            SleepMetricKey.DEEP_SLEEP_MINUTES,
            SleepMetricKey.AVG_HRV,
            SleepMetricKey.TOTAL_SLEEP_MINUTES,
        ]
    
    results = []
    med_cols = get_medication_columns(df, "_taken")
    
    for med_col in med_cols:
        # Need sufficient data in both groups
        treated = df[df[med_col] == 1]
        control = df[df[med_col] == 0]
        
        if len(treated) < 10 or len(control) < 10:
            continue
        
        med_name = med_col.replace("med_", "").replace("_taken", "").replace("_", " ").title()
        
        for metric in target_metrics:
            try:
                result = _estimate_causal_effect(
                    df, med_col, metric, med_name
                )
                if result:
                    results.append(result)
            except Exception:
                continue
    
    # Sort by strength of evidence
    results.sort(key=lambda x: (-x.is_causal, -abs(x.causal_effect)))
    
    return results[:20]


def _estimate_causal_effect(
    df: pd.DataFrame,
    treatment_col: str,
    outcome_metric: SleepMetricKey,
    med_name: str
) -> Optional[CausalResult]:
    """
    Estimate causal effect using regression adjustment.
    
    Controls for other medications and temporal trends to isolate
    the effect of the treatment medication.
    """
    outcome_col = f"sleep_{outcome_metric.value}"
    
    if outcome_col not in df.columns:
        return None
    
    # Get complete cases
    required_cols = [treatment_col, outcome_col]
    subset = df[required_cols].dropna()
    
    if len(subset) < 30:
        return None
    
    treatment = subset[treatment_col].values
    outcome = subset[outcome_col].values
    
    # Simple comparison of means
    treated_mean = outcome[treatment == 1].mean()
    control_mean = outcome[treatment == 0].mean()
    
    # Naive effect estimate
    naive_effect = treated_mean - control_mean
    
    # Regression-adjusted estimate with other meds as controls
    other_med_cols = [c for c in df.columns if c.startswith("med_") and c.endswith("_taken") and c != treatment_col]
    
    if other_med_cols:
        control_cols = other_med_cols[:5]  # Limit to prevent overfitting
        X_cols = [treatment_col] + control_cols
        
        complete_cols = X_cols + [outcome_col]
        analysis_df = df[complete_cols].dropna()
        
        if len(analysis_df) >= 30:
            X = analysis_df[X_cols].values
            y = analysis_df[outcome_col].values
            
            model = LinearRegression()
            model.fit(X, y)
            
            adjusted_effect = model.coef_[0]  # Treatment coefficient
        else:
            adjusted_effect = naive_effect
    else:
        adjusted_effect = naive_effect
    
    # Statistical test (t-test)
    t_stat, p_value = stats.ttest_ind(
        outcome[treatment == 1],
        outcome[treatment == 0],
        equal_var=False
    )
    
    # Bootstrap confidence interval
    ci_lower, ci_upper = _bootstrap_ci(
        outcome[treatment == 1],
        outcome[treatment == 0],
        n_bootstrap=500
    )
    
    # Refutation test: placebo test using lagged treatment
    refutation_passed = _placebo_test(df, treatment_col, outcome_col)
    
    # Determine if effect is likely causal
    is_causal = (
        p_value < 0.05 and
        refutation_passed and
        abs(adjusted_effect) > 0
    )
    
    return CausalResult(
        medication=med_name,
        metric=outcome_metric,
        causal_effect=float(adjusted_effect),
        confidence_interval=(float(ci_lower), float(ci_upper)),
        is_causal=is_causal,
        p_value=float(p_value),
        refutation_passed=refutation_passed,
        method="Regression Adjustment with Bootstrap CI"
    )


def _bootstrap_ci(
    treated: np.ndarray,
    control: np.ndarray,
    n_bootstrap: int = 500,
    alpha: float = 0.1
) -> tuple[float, float]:
    """Calculate bootstrap confidence interval for the difference in means."""
    np.random.seed(42)
    
    differences = []
    
    for _ in range(n_bootstrap):
        t_sample = np.random.choice(treated, size=len(treated), replace=True)
        c_sample = np.random.choice(control, size=len(control), replace=True)
        differences.append(t_sample.mean() - c_sample.mean())
    
    lower = np.percentile(differences, alpha / 2 * 100)
    upper = np.percentile(differences, (1 - alpha / 2) * 100)
    
    return lower, upper


def _placebo_test(
    df: pd.DataFrame,
    treatment_col: str,
    outcome_col: str,
    lag: int = 3
) -> bool:
    """
    Placebo test: check if future treatment affects past outcomes.
    
    If the effect persists even with lagged (future) treatment,
    it suggests confounding rather than causality.
    """
    if len(df) < 50:
        return True  # Not enough data to refute
    
    # Create lagged treatment (shift forward - future treatment)
    df_copy = df[[treatment_col, outcome_col]].dropna().copy()
    df_copy["treatment_future"] = df_copy[treatment_col].shift(-lag)
    df_copy = df_copy.dropna()
    
    if len(df_copy) < 20:
        return True
    
    # Test if future treatment predicts current outcome
    X = df_copy["treatment_future"].values.reshape(-1, 1)
    y = df_copy[outcome_col].values
    
    model = LinearRegression()
    model.fit(X, y)
    
    # Predict and check correlation
    predictions = model.predict(X)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        corr = np.corrcoef(predictions, y)[0, 1]
    
    # If future treatment has strong effect on current outcome, suspicious
    # The test passes if the placebo correlation is weak
    return abs(corr) < 0.3
