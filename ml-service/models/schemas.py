"""
Pydantic schemas for ML service request/response models.
These mirror the TypeScript types from the frontend.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class DrugClass(str, Enum):
    SLEEP_AID = "sleep_aid"
    STIMULANT = "stimulant"
    BETA_BLOCKER = "beta_blocker"
    ANTIPSYCHOTIC = "antipsychotic"
    ANXIOLYTIC = "anxiolytic"
    ANTIDEPRESSANT = "antidepressant"
    SUPPLEMENT = "supplement"
    OTHER = "other"


class SleepMetricKey(str, Enum):
    TOTAL_SLEEP_MINUTES = "totalSleepMinutes"
    DEEP_SLEEP_MINUTES = "deepSleepMinutes"
    REM_SLEEP_MINUTES = "remSleepMinutes"
    LIGHT_SLEEP_MINUTES = "lightSleepMinutes"
    SLEEP_EFFICIENCY = "sleepEfficiency"
    LATENCY_MINUTES = "latencyMinutes"
    AVG_HRV = "avgHrv"
    AVG_HEART_RATE = "avgHeartRate"
    LOWEST_HEART_RATE = "lowestHeartRate"
    RESTLESS_PERIODS = "restlessPeriods"
    SLEEP_SCORE = "sleepScore"
    DEEP_SLEEP_PERCENT = "deepSleepPercent"
    REM_SLEEP_PERCENT = "remSleepPercent"


# Request Models

class MedicationData(BaseModel):
    """Medication data for a single entry."""
    name: str
    normalized_name: str
    drug_class: DrugClass
    quantity: float
    dosage_mg: float
    total_mg: float
    time: str  # HH:MM format


class SleepMetrics(BaseModel):
    """Sleep metrics for a single night."""
    date: str
    total_sleep_minutes: float
    deep_sleep_minutes: float
    rem_sleep_minutes: float
    light_sleep_minutes: float
    sleep_efficiency: float
    latency_minutes: float
    avg_hrv: Optional[float] = None
    avg_heart_rate: Optional[float] = None
    lowest_heart_rate: Optional[float] = None
    restless_periods: Optional[int] = None
    sleep_score: Optional[float] = None
    deep_sleep_percent: float
    rem_sleep_percent: float


class AlignedDataPoint(BaseModel):
    """A single aligned data point combining medications and sleep."""
    date: str
    medications: dict[str, dict]  # medication_name -> {taken, total_mg, quantity}
    sleep_metrics: dict[str, Optional[float]]  # metric_key -> value


class AnalysisRequest(BaseModel):
    """Request for ML analysis."""
    aligned_data: list[AlignedDataPoint]
    target_metrics: Optional[list[SleepMetricKey]] = None


class ForecastRequest(BaseModel):
    """Request for time-series forecasting."""
    sleep_data: list[SleepMetrics]
    metric: SleepMetricKey
    forecast_days: int = Field(default=7, ge=1, le=30)


# Response Models

class InteractionResult(BaseModel):
    """Result of multi-drug interaction detection."""
    medications: list[str]
    interaction_score: float = Field(ge=0, le=1)
    interaction_type: Literal["synergistic", "antagonistic", "additive"]
    affected_metrics: list[SleepMetricKey]
    confidence: float = Field(ge=0, le=1)
    shap_values: dict[str, float]
    description: str


class MedicationImportance(BaseModel):
    """Feature importance for a single medication."""
    medication: str
    importance: float
    direction: Literal["positive", "negative", "mixed"]
    shap_value: float


class FeatureImportanceResult(BaseModel):
    """Feature importance analysis result."""
    by_metric: dict[str, list[MedicationImportance]]
    top_medications: list[str]
    model_r2: float


class ForecastPoint(BaseModel):
    """A single forecast point with confidence interval."""
    date: str
    predicted: float
    lower: float
    upper: float


class ForecastResult(BaseModel):
    """Time-series forecast result."""
    metric: SleepMetricKey
    predictions: list[ForecastPoint]
    trend: Literal["improving", "declining", "stable"]
    trend_slope: float
    confidence: float
    model_used: str


class CausalResult(BaseModel):
    """Causal inference analysis result."""
    medication: str
    metric: SleepMetricKey
    causal_effect: float
    confidence_interval: tuple[float, float]
    is_causal: bool
    p_value: float
    refutation_passed: bool
    method: str
    conditional_insight: Optional[str] = None


class ClusterProfile(BaseModel):
    """Profile of a medication cluster."""
    id: int
    medications: list[str]
    avg_outcomes: dict[str, float]
    night_count: int
    description: str


class ClusterResult(BaseModel):
    """Clustering analysis result."""
    clusters: list[ClusterProfile]
    optimal_cluster: int
    silhouette_score: float
    recommendation: str


class ComprehensiveResult(BaseModel):
    """Complete ML analysis result."""
    interactions: list[InteractionResult]
    feature_importance: FeatureImportanceResult
    causal_results: list[CausalResult]
    clusters: ClusterResult
    summary: str
    recommendations: list[str]


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    models_loaded: bool


class OptimizationSuggestion(BaseModel):
    """A single optimization suggestion."""
    medication: str
    dose_mg: float
    time: str  # HH:MM
    predicted_impact: float
    confidence: float


class OptimizationResult(BaseModel):
    """Result of Bayesian Optimization."""
    target_metric: SleepMetricKey
    recommendations: list[OptimizationSuggestion]
    predicted_score: float
    confidence: float


class SimulationRequest(BaseModel):
    """Request to simulate a specific configuration."""
    medications: list[MedicationData]
    # No single target metric, simulate for all available models


class PredictionDetail(BaseModel):
    """Detailed prediction for a single metric."""
    predicted_value: float
    confidence_interval: tuple[float, float]
    percentile: float


class SimulationResult(BaseModel):
    """Result of a simulation."""
    # Map from metric key to prediction detail
    predictions: dict[SleepMetricKey, PredictionDetail]


class ParetoSolution(BaseModel):
    """A single solution on the Pareto frontier."""
    medications: list[OptimizationSuggestion]
    objectives: dict[str, float]  # metric -> predicted value
    trade_off_description: str


class MultiObjectiveResult(BaseModel):
    """Result of multi-objective optimization using NSGA-II."""
    pareto_frontier: list[ParetoSolution]
    objective_names: list[str]
    recommendation: str

