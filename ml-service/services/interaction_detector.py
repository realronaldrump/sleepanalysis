"""
Multi-Drug Interaction Detection Service
Uses ensemble ML (XGBoost, Random Forest) to detect non-linear medication interactions.
"""

import numpy as np
import pandas as pd
from typing import Optional
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
import warnings

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

try:
    import shap
    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False

from models.schemas import (
    InteractionResult,
    SleepMetricKey,
    AlignedDataPoint,
)
from services.feature_engineering import (
    aligned_data_to_dataframe,
    create_interaction_features,
    get_medication_columns,
    prepare_features_for_metric,
    extract_medication_names,
)


def detect_interactions(
    data: list[AlignedDataPoint],
    target_metrics: Optional[list[SleepMetricKey]] = None
) -> list[InteractionResult]:
    """
    Detect multi-drug interactions affecting sleep metrics.
    
    Uses ensemble methods to identify medication combinations that have
    non-additive effects on sleep quality.
    """
    if len(data) < 20:
        return []  # Not enough data for meaningful analysis
    
    # Convert to DataFrame
    df = aligned_data_to_dataframe(data)
    df = create_interaction_features(df, top_n=8)
    
    # Default to key sleep metrics
    if target_metrics is None:
        target_metrics = [
            SleepMetricKey.SLEEP_EFFICIENCY,
            SleepMetricKey.DEEP_SLEEP_MINUTES,
            SleepMetricKey.AVG_HRV,
            SleepMetricKey.SLEEP_SCORE,
        ]
    
    interactions = []
    med_names = extract_medication_names(df)
    
    for metric in target_metrics:
        try:
            metric_interactions = _analyze_metric_interactions(df, metric, med_names)
            interactions.extend(metric_interactions)
        except Exception as e:
            warnings.warn(f"Failed to analyze {metric}: {e}")
            continue
    
    # Sort by interaction score
    interactions.sort(key=lambda x: -x.interaction_score)
    
    return interactions[:20]  # Return top 20


def _analyze_metric_interactions(
    df: pd.DataFrame,
    metric: SleepMetricKey,
    med_names: dict[str, str]
) -> list[InteractionResult]:
    """Analyze interactions for a single sleep metric."""
    try:
        X, y, feature_names = prepare_features_for_metric(
            df, metric, include_lags=False, include_rolling=False
        )
    except ValueError:
        return []
    
    if len(X) < 20 or X.shape[1] < 2:
        return []
    
    # Train model
    if HAS_XGBOOST:
        model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
            verbosity=0
        )
    else:
        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            random_state=42
        )
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(X, y)
    
    # Get feature importances
    importances = model.feature_importances_
    importance_df = pd.DataFrame({
        "feature": feature_names,
        "importance": importances
    }).sort_values("importance", ascending=False)
    
    # Calculate SHAP values if available
    shap_values = {}
    if HAS_SHAP and len(X) > 10:
        try:
            explainer = shap.TreeExplainer(model)
            shap_vals = explainer.shap_values(X)
            mean_shap = np.abs(shap_vals).mean(axis=0)
            shap_values = dict(zip(feature_names, mean_shap.tolist()))
        except Exception:
            pass
    
    # Find interaction features with high importance
    interactions = []
    interaction_features = [f for f in feature_names if f.startswith("interaction_")]
    
    for feat in interaction_features:
        imp = importance_df[importance_df["feature"] == feat]["importance"].values
        if len(imp) == 0:
            continue
        
        imp_val = float(imp[0])
        if imp_val < 0.01:  # Skip low importance
            continue
        
        # Parse medication names from interaction feature
        # interaction_temazepam_quetiapine -> ["temazepam", "quetiapine"]
        parts = feat.replace("interaction_", "").split("_")
        
        # Try to reconstruct medication names (this is simplified)
        meds = []
        for part in parts:
            for col, name in med_names.items():
                if part.lower() in col.lower():
                    meds.append(name)
                    break
        
        if len(meds) < 2:
            meds = [p.title() for p in parts[:2]]
        
        # Determine interaction type based on correlation with target
        try:
            interaction_col = df[df.columns[df.columns.str.contains(feat, regex=False)]].iloc[:, 0] if feat in df.columns else None
            if interaction_col is not None:
                target_col = f"sleep_{metric.value}"
                if target_col in df.columns:
                    corr = df[[feat, target_col]].dropna().corr().iloc[0, 1]
                    if corr > 0.1:
                        interaction_type = "synergistic"
                    elif corr < -0.1:
                        interaction_type = "antagonistic"
                    else:
                        interaction_type = "additive"
                else:
                    interaction_type = "additive"
            else:
                interaction_type = "additive"
        except Exception:
            interaction_type = "additive"
        
        # Create description
        if interaction_type == "synergistic":
            desc = f"Taking {meds[0]} with {meds[1]} may enhance {metric.value.replace('_', ' ')}"
        elif interaction_type == "antagonistic":
            desc = f"Taking {meds[0]} with {meds[1]} may reduce {metric.value.replace('_', ' ')}"
        else:
            desc = f"{meds[0]} and {meds[1]} show combined effects on {metric.value.replace('_', ' ')}"
        
        interactions.append(InteractionResult(
            medications=meds[:2],
            interaction_score=min(1.0, imp_val * 10),  # Scale to 0-1
            interaction_type=interaction_type,
            affected_metrics=[metric],
            confidence=min(1.0, len(df) / 100),  # Higher with more data
            shap_values=shap_values,
            description=desc
        ))
    
    return interactions


def get_feature_importance(
    data: list[AlignedDataPoint],
    target_metrics: Optional[list[SleepMetricKey]] = None
) -> dict:
    """
    Calculate feature importance for all medications across sleep metrics.
    
    Uses SHAP values when available for interpretable importance scores.
    """
    if len(data) < 15:
        return {"by_metric": {}, "top_medications": [], "model_r2": 0.0}
    
    df = aligned_data_to_dataframe(data)
    
    if target_metrics is None:
        target_metrics = [
            SleepMetricKey.SLEEP_EFFICIENCY,
            SleepMetricKey.DEEP_SLEEP_MINUTES,
            SleepMetricKey.TOTAL_SLEEP_MINUTES,
            SleepMetricKey.AVG_HRV,
        ]
    
    by_metric = {}
    all_importances = {}
    best_r2 = 0.0
    
    for metric in target_metrics:
        try:
            X, y, feature_names = prepare_features_for_metric(
                df, metric, include_lags=False, include_rolling=False
            )
        except ValueError:
            continue
        
        if len(X) < 15:
            continue
        
        # Use only medication columns for interpretability
        med_cols = [c for c in feature_names if c.startswith("med_") and c.endswith("_taken")]
        if len(med_cols) < 2:
            continue
        
        X_med = X[med_cols]
        
        # Train Random Forest for interpretability
        model = RandomForestRegressor(
            n_estimators=50,
            max_depth=4,
            random_state=42,
            n_jobs=-1
        )
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model.fit(X_med, y)
            
            # Cross-validation R2
            cv_scores = cross_val_score(model, X_med, y, cv=min(5, len(X_med)//5 + 1), scoring='r2')
            r2 = max(0, cv_scores.mean())
            best_r2 = max(best_r2, r2)
        
        # Feature importances
        importances = model.feature_importances_
        
        # SHAP values if available
        shap_vals = np.zeros(len(med_cols))
        if HAS_SHAP:
            try:
                explainer = shap.TreeExplainer(model)
                shap_matrix = explainer.shap_values(X_med)
                shap_vals = shap_matrix.mean(axis=0)  # Mean SHAP (signed)
            except Exception:
                pass
        
        metric_importance = []
        for i, col in enumerate(med_cols):
            med_name = col.replace("med_", "").replace("_taken", "").replace("_", " ").title()
            
            # Determine direction from SHAP sign
            if abs(shap_vals[i]) > 0.01:
                direction = "positive" if shap_vals[i] > 0 else "negative"
            else:
                direction = "mixed"
            
            metric_importance.append({
                "medication": med_name,
                "importance": float(importances[i]),
                "direction": direction,
                "shap_value": float(shap_vals[i]) if len(shap_vals) > i else 0.0
            })
            
            # Aggregate across metrics
            if med_name not in all_importances:
                all_importances[med_name] = 0.0
            all_importances[med_name] += importances[i]
        
        # Sort by importance
        metric_importance.sort(key=lambda x: -x["importance"])
        by_metric[metric.value] = metric_importance[:10]
    
    # Top medications overall
    top_meds = sorted(all_importances.items(), key=lambda x: -x[1])[:10]
    top_medications = [m[0] for m in top_meds]
    
    return {
        "by_metric": by_metric,
        "top_medications": top_medications,
        "model_r2": best_r2
    }
