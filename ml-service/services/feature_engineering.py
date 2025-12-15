"""
Feature Engineering Service
Transforms raw medication and sleep data into ML-ready features.
"""

import numpy as np
import pandas as pd
from typing import Optional
from models.schemas import AlignedDataPoint, SleepMetricKey
from datetime import datetime, timedelta

# Biological half-lives in hours
HALF_LIFE_HOURS = {
    "caffeine": 5.0,
    "coffee": 5.0,
    "espresso": 5.0,
    "melatonin": 0.8,
    "magnesium": 24.0,  # Accumulates
    "ashwagandha": 4.0,
    "l-theanine": 3.0,
    "cbd": 24.0,
    "alcohol": 1.0,     # Zero-order kinetics in reality, but simple decay approx
    "valerian": 4.0,
    "benadryl": 9.0,
    "diphenhydramine": 9.0,
    "glycine": 4.0,
    "apigenin": 91.0,   # Very long
    "zinc": 24.0,
}

DEFAULT_BEDTIME_HOUR = 22  # 10 PM


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
            col_name = _sanitize_col_name(med_name)
            
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

        # --- PK Decay Features ---
        # Calculate active concentration at bedtime
        bedtime = _estimate_bedtime(point)
        
        for med_name, med_data in point.medications.items():
            col_name = _sanitize_col_name(med_name)
            half_life = HALF_LIFE_HOURS.get(col_name.split("_")[0], 4.0) # Default 4h
            
            # Handle list of doses if present, else fallback to single dose
            doses = med_data.get("doses", [])
            if not doses and med_data.get("taken"):
                # Construct single dose from aggregate
                doses = [{
                    "mg": med_data.get("total_mg", 0),
                    "time": med_data.get("time", "08:00") # Default to morning if missing
                }]
            
            total_concentration = 0.0
            
            for dose in doses:
                mg = dose.get("mg", 0)
                time_str = dose.get("time", "08:00")
                
                try:
                    taken_dt = datetime.strptime(f"{point.date} {time_str}", "%Y-%m-%d %H:%M")
                    # If taken after bedtime (e.g. 1 AM), assumes it belongs to this sleep session
                    # But if time is small (01:00), it might be next day? 
                    # We'll assume times are 00:00-23:59 on the 'date' of the entry.
                    
                    concentration = _calculate_decay(
                        dose_mg=mg,
                        taken_time=taken_dt,
                        query_time=bedtime,
                        half_life_hours=half_life
                    )
                    total_concentration += concentration
                except (ValueError, TypeError):
                    continue
            
            record[f"med_{col_name}_concentration"] = total_concentration

        records.append(record)
    
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    
    return df


def get_medication_columns(df: pd.DataFrame, suffix: str = "_taken") -> list[str]:
    """Get all medication feature columns with given suffix."""
    return [col for col in df.columns if col.startswith("med_") and col.endswith(suffix)]


def _sanitize_col_name(name: str) -> str:
    return name.lower().replace(" ", "_").replace("-", "_")


def _estimate_bedtime(point: AlignedDataPoint) -> datetime:
    """Estimate bedtime for concentration calculation."""
    date_str = point.date
    # Ideally use 'sleep_start' if available in metrics, but currently not in schema
    # Fallback to default
    return datetime.strptime(f"{date_str} {DEFAULT_BEDTIME_HOUR}:00", "%Y-%m-%d %H:%M")


def _calculate_decay(
    dose_mg: float,
    taken_time: datetime,
    query_time: datetime,
    half_life_hours: float
) -> float:
    """Calculate remaining concentration using exponential decay."""
    if query_time <= taken_time:
        return dose_mg # Assume full absorption/peak immediately for simplicity
        
    elapsed_hours = (query_time - taken_time).total_seconds() / 3600
    if elapsed_hours < 0:
        return 0.0
        
    # Formula: C(t) = C0 * (1/2)^(t / t_1/2)
    concentration = dose_mg * (0.5) ** (elapsed_hours / half_life_hours)
    return concentration


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
    
    # Get medication columns (binary, dosage, and concentration)
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
