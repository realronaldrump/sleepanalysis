"""
Clustering Service
Identifies distinct medication regimen patterns and their sleep outcomes.
"""

import numpy as np
import pandas as pd
from typing import Optional
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from collections import Counter

from models.schemas import (
    AlignedDataPoint,
    ClusterResult,
    ClusterProfile,
    SleepMetricKey,
)
from services.feature_engineering import (
    aligned_data_to_dataframe,
    get_medication_columns,
    get_sleep_columns,
)


def cluster_medication_regimens(
    data: list[AlignedDataPoint],
    n_clusters: Optional[int] = None
) -> ClusterResult:
    """
    Cluster nights by medication regimen and analyze sleep outcomes.
    
    Identifies distinct patterns of medication usage and compares
    their average sleep outcomes to find optimal regimens.
    """
    if len(data) < 20:
        return _create_empty_result("Not enough data for clustering")
    
    df = aligned_data_to_dataframe(data)
    
    # Get medication columns (binary taken/not taken)
    med_cols = get_medication_columns(df, "_taken")
    
    if len(med_cols) < 2:
        return _create_empty_result("Not enough medications for clustering")
    
    # Prepare features for clustering
    X = df[med_cols].fillna(0).values
    
    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Determine optimal number of clusters if not specified
    if n_clusters is None:
        n_clusters = _find_optimal_clusters(X_scaled)
    
    # Fit KMeans
    kmeans = KMeans(
        n_clusters=n_clusters,
        random_state=42,
        n_init=10
    )
    
    cluster_labels = kmeans.fit_predict(X_scaled)
    df["cluster"] = cluster_labels
    
    # Calculate silhouette score
    if n_clusters > 1 and len(set(cluster_labels)) > 1:
        sil_score = silhouette_score(X_scaled, cluster_labels)
    else:
        sil_score = 0.0
    
    # Analyze each cluster
    sleep_cols = get_sleep_columns(df)
    clusters = []
    best_cluster = 0
    best_score = float("-inf")
    
    for cluster_id in range(n_clusters):
        cluster_data = df[df["cluster"] == cluster_id]
        
        if len(cluster_data) < 3:
            continue
        
        # Find common medications in this cluster
        common_meds = []
        for col in med_cols:
            usage_rate = cluster_data[col].mean()
            if usage_rate > 0.5:  # Medication used in >50% of nights
                med_name = col.replace("med_", "").replace("_taken", "").replace("_", " ").title()
                common_meds.append(med_name)
        
        if not common_meds:
            common_meds = ["No specific medications"]
        
        # Calculate average outcomes
        avg_outcomes = {}
        for col in sleep_cols:
            if col in cluster_data.columns:
                avg_val = cluster_data[col].mean()
                if not np.isnan(avg_val):
                    metric_key = col.replace("sleep_", "")
                    avg_outcomes[metric_key] = round(float(avg_val), 2)
        
        # Calculate cluster quality score (higher is better)
        # Weight: efficiency + deep sleep % + HRV - latency
        score = 0
        if "sleepEfficiency" in avg_outcomes:
            score += avg_outcomes["sleepEfficiency"]
        if "deepSleepPercent" in avg_outcomes:
            score += avg_outcomes["deepSleepPercent"] * 2
        if "avgHrv" in avg_outcomes:
            score += avg_outcomes["avgHrv"]
        if "latencyMinutes" in avg_outcomes:
            score -= avg_outcomes["latencyMinutes"] * 0.5
        
        if score > best_score:
            best_score = score
            best_cluster = cluster_id
        
        # Generate description
        description = _generate_cluster_description(common_meds, avg_outcomes)
        
        clusters.append(ClusterProfile(
            id=cluster_id,
            medications=common_meds,
            avg_outcomes=avg_outcomes,
            night_count=len(cluster_data),
            description=description
        ))
    
    # Generate recommendation
    recommendation = _generate_recommendation(clusters, best_cluster)
    
    return ClusterResult(
        clusters=clusters,
        optimal_cluster=best_cluster,
        silhouette_score=float(sil_score),
        recommendation=recommendation
    )


def _find_optimal_clusters(X: np.ndarray, max_clusters: int = 6) -> int:
    """Find optimal number of clusters using silhouette score."""
    n_samples = X.shape[0]
    max_k = min(max_clusters, n_samples // 5)  # At least 5 samples per cluster
    
    if max_k < 2:
        return 2
    
    best_k = 2
    best_score = -1
    
    for k in range(2, max_k + 1):
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X)
        
        if len(set(labels)) < 2:
            continue
        
        score = silhouette_score(X, labels)
        if score > best_score:
            best_score = score
            best_k = k
    
    return best_k


def _generate_cluster_description(meds: list[str], outcomes: dict) -> str:
    """Generate a human-readable description of a cluster."""
    if meds[0] == "No specific medications":
        med_part = "Nights with varied or minimal medication use"
    elif len(meds) == 1:
        med_part = f"Nights primarily using {meds[0]}"
    else:
        med_part = f"Nights using {', '.join(meds[:-1])} and {meds[-1]}"
    
    # Add outcome summary
    outcome_parts = []
    if "sleepEfficiency" in outcomes:
        outcome_parts.append(f"{outcomes['sleepEfficiency']:.0f}% efficiency")
    if "deepSleepPercent" in outcomes:
        outcome_parts.append(f"{outcomes['deepSleepPercent']:.0f}% deep sleep")
    if "avgHrv" in outcomes:
        outcome_parts.append(f"{outcomes['avgHrv']:.0f}ms HRV")
    
    if outcome_parts:
        return f"{med_part}. Average: {', '.join(outcome_parts)}."
    return med_part


def _generate_recommendation(clusters: list[ClusterProfile], best_cluster: int) -> str:
    """Generate a recommendation based on cluster analysis."""
    if not clusters:
        return "Insufficient data for recommendations."
    
    best = next((c for c in clusters if c.id == best_cluster), clusters[0])
    
    if best.medications[0] == "No specific medications":
        return "The best sleep outcomes occurred on nights with minimal medication use."
    
    meds = ", ".join(best.medications[:3])
    return f"Best sleep outcomes associated with: {meds}. Consider this regimen for optimal sleep quality."


def _create_empty_result(message: str) -> ClusterResult:
    """Create an empty result when clustering isn't possible."""
    return ClusterResult(
        clusters=[],
        optimal_cluster=0,
        silhouette_score=0.0,
        recommendation=message
    )
