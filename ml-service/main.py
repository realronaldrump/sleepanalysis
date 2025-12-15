"""
Sleep Analysis ML Service
FastAPI application for advanced machine learning analytics.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging

from models.schemas import (
    AnalysisRequest,
    ForecastRequest,
    InteractionResult,
    FeatureImportanceResult,
    ForecastResult,
    CausalResult,
    ClusterResult,
    ComprehensiveResult,
    HealthResponse,
    SleepMetricKey,
)
from services.interaction_detector import detect_interactions, get_feature_importance
from services.time_series import forecast_sleep_metric
from services.clustering import cluster_medication_regimens
from services.causal_inference import analyze_causal_effects

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Sleep Analysis ML Service",
    description="Advanced ML analytics for medication-sleep correlation analysis",
    version="1.0.0",
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        models_loaded=True
    )


@app.post("/analyze/interactions", response_model=list[InteractionResult])
async def analyze_interactions(request: AnalysisRequest):
    """
    Detect multi-drug interactions affecting sleep metrics.
    
    Uses ensemble ML (XGBoost/RandomForest) to identify medication
    combinations that have synergistic or antagonistic effects.
    """
    try:
        logger.info(f"Analyzing interactions for {len(request.aligned_data)} data points")
        
        interactions = detect_interactions(
            request.aligned_data,
            request.target_metrics
        )
        
        logger.info(f"Found {len(interactions)} interactions")
        return interactions
        
    except Exception as e:
        logger.error(f"Interaction analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/feature-importance", response_model=FeatureImportanceResult)
async def analyze_feature_importance(request: AnalysisRequest):
    """
    Calculate feature importance for medications across sleep metrics.
    
    Uses SHAP values for interpretable importance scores showing
    which medications have the strongest impact.
    """
    try:
        logger.info(f"Calculating feature importance for {len(request.aligned_data)} data points")
        
        result = get_feature_importance(
            request.aligned_data,
            request.target_metrics
        )
        
        return FeatureImportanceResult(**result)
        
    except Exception as e:
        logger.error(f"Feature importance analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/forecast", response_model=ForecastResult)
async def analyze_forecast(request: ForecastRequest):
    """
    Forecast future sleep metric values.
    
    Uses ARIMA or Exponential Smoothing for time-series prediction
    with confidence intervals.
    """
    try:
        logger.info(f"Forecasting {request.metric} for {request.forecast_days} days")
        
        result = forecast_sleep_metric(
            request.sleep_data,
            request.metric,
            request.forecast_days
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Forecast failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/causal", response_model=list[CausalResult])
async def analyze_causal(request: AnalysisRequest):
    """
    Analyze potential causal effects of medications on sleep.
    
    Uses regression adjustment with bootstrap confidence intervals
    and placebo tests to distinguish correlation from causation.
    """
    try:
        logger.info(f"Analyzing causal effects for {len(request.aligned_data)} data points")
        
        results = analyze_causal_effects(
            request.aligned_data,
            request.target_metrics
        )
        
        logger.info(f"Found {len(results)} potential causal effects")
        return results
        
    except Exception as e:
        logger.error(f"Causal analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/clusters", response_model=ClusterResult)
async def analyze_clusters(request: AnalysisRequest):
    """
    Cluster medication regimens by sleep outcomes.
    
    Uses KMeans clustering to identify distinct medication patterns
    and compare their average sleep quality.
    """
    try:
        logger.info(f"Clustering {len(request.aligned_data)} nights")
        
        result = cluster_medication_regimens(request.aligned_data)
        
        logger.info(f"Found {len(result.clusters)} clusters")
        return result
        
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/comprehensive", response_model=ComprehensiveResult)
async def analyze_comprehensive(request: AnalysisRequest):
    """
    Run all ML analyses and return combined insights.
    
    This is the main entry point for the frontend to get a complete
    ML-powered analysis of medication-sleep relationships.
    """
    try:
        logger.info(f"Running comprehensive analysis on {len(request.aligned_data)} data points")
        
        # Run all analyses
        interactions = detect_interactions(request.aligned_data, request.target_metrics)
        feature_result = get_feature_importance(request.aligned_data, request.target_metrics)
        feature_importance = FeatureImportanceResult(**feature_result)
        causal_results = analyze_causal_effects(request.aligned_data, request.target_metrics)
        clusters = cluster_medication_regimens(request.aligned_data)
        
        # Generate summary
        summary = _generate_summary(interactions, feature_importance, causal_results, clusters)
        
        # Generate recommendations
        recommendations = _generate_recommendations(
            interactions, feature_importance, causal_results, clusters
        )
        
        return ComprehensiveResult(
            interactions=interactions,
            feature_importance=feature_importance,
            causal_results=causal_results,
            clusters=clusters,
            summary=summary,
            recommendations=recommendations
        )
        
    except Exception as e:
        logger.error(f"Comprehensive analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_summary(
    interactions: list[InteractionResult],
    feature_importance: FeatureImportanceResult,
    causal_results: list[CausalResult],
    clusters: ClusterResult
) -> str:
    """Generate a human-readable summary of all analyses."""
    parts = []
    
    # Interactions summary
    if interactions:
        synergistic = [i for i in interactions if i.interaction_type == "synergistic"]
        antagonistic = [i for i in interactions if i.interaction_type == "antagonistic"]
        
        if synergistic:
            parts.append(f"Found {len(synergistic)} synergistic medication combinations")
        if antagonistic:
            parts.append(f"Found {len(antagonistic)} antagonistic combinations to avoid")
    
    # Top medications
    if feature_importance.top_medications:
        top_3 = feature_importance.top_medications[:3]
        parts.append(f"Most impactful medications: {', '.join(top_3)}")
    
    # Causal effects
    causal_effects = [c for c in causal_results if c.is_causal]
    if causal_effects:
        parts.append(f"Identified {len(causal_effects)} medications with likely causal effects")
    
    # Clusters
    if clusters.clusters:
        parts.append(f"Identified {len(clusters.clusters)} distinct medication patterns")
    
    if parts:
        return ". ".join(parts) + "."
    return "Analysis complete. Review individual sections for detailed insights."


def _generate_recommendations(
    interactions: list[InteractionResult],
    feature_importance: FeatureImportanceResult,
    causal_results: list[CausalResult],
    clusters: ClusterResult
) -> list[str]:
    """Generate actionable recommendations from all analyses."""
    recommendations = []
    
    # From interactions
    synergistic = [i for i in interactions if i.interaction_type == "synergistic" and i.interaction_score > 0.3]
    if synergistic:
        best = synergistic[0]
        recommendations.append(
            f"Consider combining {best.medications[0]} with {best.medications[1]} - showed positive synergy"
        )
    
    antagonistic = [i for i in interactions if i.interaction_type == "antagonistic" and i.interaction_score > 0.3]
    if antagonistic:
        worst = antagonistic[0]
        recommendations.append(
            f"Avoid combining {worst.medications[0]} with {worst.medications[1]} on the same night"
        )
    
    # From causal analysis
    positive_causal = [c for c in causal_results if c.is_causal and c.causal_effect > 0]
    if positive_causal:
        best_causal = max(positive_causal, key=lambda x: x.causal_effect)
        recommendations.append(
            f"{best_causal.medication} shows evidence of improving {best_causal.metric.value.replace('_', ' ')}"
        )
    
    negative_causal = [c for c in causal_results if c.is_causal and c.causal_effect < 0]
    if negative_causal:
        worst_causal = min(negative_causal, key=lambda x: x.causal_effect)
        recommendations.append(
            f"Consider reducing {worst_causal.medication} - may negatively affect sleep"
        )
    
    # From clusters
    if clusters.recommendation:
        recommendations.append(clusters.recommendation)
    
    # Default if no specific recommendations
    if not recommendations:
        recommendations.append("Continue tracking to build more data for personalized insights")
    
    return recommendations[:5]  # Limit to top 5


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
