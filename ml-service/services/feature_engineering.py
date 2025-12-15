"""
Feature Engineering Service
Transforms raw medication and sleep data into ML-ready features.
"""

import numpy as np
import pandas as pd
from typing import Optional
from models.schemas import AlignedDataPoint, SleepMetricKey


def aligned_data_to_dataframe(data: list[AlignedDataPoint]) -> pd.DataFrame:
    """
    Convert aligned data points to a pandas DataFrame suitable for ML.
    
    Creates columns for:
    - Each unique medication (binary and dosage features)
    - Each sleep metric
    - Derived features (medication counts, total dosages by class, etc.)
    """
    records = []
    
    for point in data:
        record = {"date": point.date}
        
        # Medication features
        med_count = 0
        total_dosage = 0.0
        
        for med_name, med_data in point.medications.items():
            # Normalize medication name for column
            col_name = med_name.lower().replace(" ", "_").replace("-", "_")
            
            # Binary: was medication taken?
            record[f"med_{col_name}_taken"] = 1 if med_data.get("taken", False) else 0
            
            # Continuous: dosage in mg
            dosage = med_data.get("total_mg", 0) or 0
            record[f"med_{col_name}_mg"] = dosage
            
            # Quantity
            qty = med_data.get("quantity", 0) or 0
            record[f"med_{col_name}_qty"] = qty
            
            if med_data.get("taken", False):
                med_count += 1
                total_dosage += dosage
        
        record["total_medications"] = med_count
        record["total_dosage_mg"] = total_dosage
        
        # Sleep metric features
        for metric_key, value in point.sleep_metrics.items():
            record[f"sleep_{metric_key}"] = value
        
        records.append(record)
    
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    
    return df


def get_medication_columns(df: pd.DataFrame, suffix: str = "_taken") -> list[str]:
    """Get all medication feature columns with given suffix."""
    return [col for col in df.columns if col.startswith("med_") and col.endswith(suffix)]


def get_sleep_columns(df: pd.DataFrame) -> list[str]:
    """Get all sleep metric columns."""
    return [col for col in df.columns if col.startswith("sleep_")]


def create_interaction_features(df: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
    """
    Create interaction features for medication combinations.
    
    For the top N most common medications, create pairwise interaction features
    representing when both medications were taken together.
    """
    med_cols = get_medication_columns(df, "_taken")
    
    # Find most common medications
    med_frequencies = {col: df[col].sum() for col in med_cols}
    top_meds = sorted(med_frequencies.items(), key=lambda x: -x[1])[:top_n]
    top_med_cols = [col for col, _ in top_meds]
    
    # Create pairwise interactions
    for i, col1 in enumerate(top_med_cols):
        for col2 in top_med_cols[i+1:]:
            interaction_name = f"interaction_{col1}_{col2}".replace("med_", "").replace("_taken", "")
            df[interaction_name] = df[col1] * df[col2]
    
    return df


def create_lag_features(
    df: pd.DataFrame, 
    target_cols: list[str], 
    lags: list[int] = [1, 2, 3]
) -> pd.DataFrame:
    """
    Create lagged features for time-series analysis.
    
    For each target column, create features representing values from
    previous days (lag 1 = yesterday, lag 2 = 2 days ago, etc.)
    """
    for col in target_cols:
        if col in df.columns:
            for lag in lags:
                df[f"{col}_lag{lag}"] = df[col].shift(lag)
    
    return df


def create_rolling_features(
    df: pd.DataFrame,
    target_cols: list[str],
    windows: list[int] = [3, 7]
) -> pd.DataFrame:
    """
    Create rolling window features (moving averages, etc.)
    
    Useful for capturing medication usage patterns over time.
    """
    for col in target_cols:
        if col in df.columns:
            for window in windows:
                df[f"{col}_rolling_mean_{window}d"] = df[col].rolling(window=window, min_periods=1).mean()
                df[f"{col}_rolling_sum_{window}d"] = df[col].rolling(window=window, min_periods=1).sum()
    
    return df


def prepare_features_for_metric(
    df: pd.DataFrame,
    target_metric: SleepMetricKey,
    include_lags: bool = True,
    include_rolling: bool = True
) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    """
    Prepare feature matrix X and target vector y for predicting a sleep metric.
    
    Returns:
        - X: Feature DataFrame
        - y: Target Series
        - feature_names: List of feature column names
    """
    target_col = f"sleep_{target_metric.value}"
    
    if target_col not in df.columns:
        raise ValueError(f"Target metric {target_metric} not found in data")
    
    # Get medication columns (both binary and dosage)
    feature_cols = [col for col in df.columns if col.startswith("med_")]
    feature_cols.extend(["total_medications", "total_dosage_mg"])
    
    # Add interaction features
    interaction_cols = [col for col in df.columns if col.startswith("interaction_")]
    feature_cols.extend(interaction_cols)
    
    # Optionally add lag features
    if include_lags:
        lag_cols = [col for col in df.columns if "_lag" in col]
        feature_cols.extend(lag_cols)
    
    # Optionally add rolling features
    if include_rolling:
        rolling_cols = [col for col in df.columns if "_rolling_" in col]
        feature_cols.extend(rolling_cols)
    
    # Filter to existing columns
    feature_cols = [col for col in feature_cols if col in df.columns]
    
    # Create X and y, dropping rows with NaN in target
    mask = df[target_col].notna()
    X = df.loc[mask, feature_cols].fillna(0)
    y = df.loc[mask, target_col]
    
    return X, y, feature_cols


def extract_medication_names(df: pd.DataFrame) -> dict[str, str]:
    """
    Extract medication names from column names.
    
    Returns a mapping from column name to display name.
    """
    med_cols = get_medication_columns(df, "_taken")
    
    names = {}
    for col in med_cols:
        # Convert med_temazepam_taken -> Temazepam
        name = col.replace("med_", "").replace("_taken", "")
        display_name = name.replace("_", " ").title()
        names[col] = display_name
    
    return names
