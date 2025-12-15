"""
Time Series Forecasting Service
Uses ARIMA and trend analysis for sleep metric predictions.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
import warnings

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from sklearn.linear_model import LinearRegression

from models.schemas import (
    SleepMetrics,
    SleepMetricKey,
    ForecastResult,
    ForecastPoint,
)


def forecast_sleep_metric(
    sleep_data: list[SleepMetrics],
    metric: SleepMetricKey,
    forecast_days: int = 7
) -> ForecastResult:
    """
    Forecast future values of a sleep metric.
    
    Uses ARIMA or Exponential Smoothing based on data characteristics.
    Returns predictions with confidence intervals.
    """
    if len(sleep_data) < 14:
        return _create_simple_forecast(sleep_data, metric, forecast_days)
    
    # Convert to time series
    df = pd.DataFrame([s.model_dump() for s in sleep_data])
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")
    
    # Get the target column
    metric_col_map = {
        SleepMetricKey.TOTAL_SLEEP_MINUTES: "total_sleep_minutes",
        SleepMetricKey.DEEP_SLEEP_MINUTES: "deep_sleep_minutes",
        SleepMetricKey.REM_SLEEP_MINUTES: "rem_sleep_minutes",
        SleepMetricKey.LIGHT_SLEEP_MINUTES: "light_sleep_minutes",
        SleepMetricKey.SLEEP_EFFICIENCY: "sleep_efficiency",
        SleepMetricKey.LATENCY_MINUTES: "latency_minutes",
        SleepMetricKey.AVG_HRV: "avg_hrv",
        SleepMetricKey.AVG_HEART_RATE: "avg_heart_rate",
        SleepMetricKey.LOWEST_HEART_RATE: "lowest_heart_rate",
        SleepMetricKey.RESTLESS_PERIODS: "restless_periods",
        SleepMetricKey.SLEEP_SCORE: "sleep_score",
        SleepMetricKey.DEEP_SLEEP_PERCENT: "deep_sleep_percent",
        SleepMetricKey.REM_SLEEP_PERCENT: "rem_sleep_percent",
    }
    
    col_name = metric_col_map.get(metric, metric.value)
    
    if col_name not in df.columns:
        return _create_simple_forecast(sleep_data, metric, forecast_days)
    
    series = df[col_name].dropna()
    
    if len(series) < 14:
        return _create_simple_forecast(sleep_data, metric, forecast_days)
    
    # Fill gaps with interpolation
    series = series.asfreq("D").interpolate(method="linear")
    
    # Try ARIMA first, fall back to Exponential Smoothing
    try:
        result = _fit_arima(series, forecast_days)
        model_used = "ARIMA"
    except Exception:
        try:
            result = _fit_exp_smoothing(series, forecast_days)
            model_used = "Exponential Smoothing"
        except Exception:
            return _create_simple_forecast(sleep_data, metric, forecast_days)
    
    predictions, lower, upper = result
    
    # Calculate trend
    trend, trend_slope = _calculate_trend(series)
    
    # Generate forecast dates
    last_date = series.index[-1]
    forecast_dates = [
        (last_date + timedelta(days=i+1)).strftime("%Y-%m-%d")
        for i in range(forecast_days)
    ]
    
    forecast_points = [
        ForecastPoint(
            date=date,
            predicted=float(predictions[i]),
            lower=float(lower[i]),
            upper=float(upper[i])
        )
        for i, date in enumerate(forecast_dates)
    ]
    
    # Confidence based on model fit and data quantity
    confidence = min(0.95, 0.5 + (len(series) / 100) * 0.3)
    
    return ForecastResult(
        metric=metric,
        predictions=forecast_points,
        trend=trend,
        trend_slope=trend_slope,
        confidence=confidence,
        model_used=model_used
    )


def _fit_arima(series: pd.Series, forecast_days: int) -> tuple:
    """Fit ARIMA model and generate forecasts."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        # Try different ARIMA orders
        best_model = None
        best_aic = float("inf")
        
        for p in [1, 2]:
            for d in [0, 1]:
                for q in [0, 1]:
                    try:
                        model = ARIMA(series, order=(p, d, q))
                        fitted = model.fit()
                        if fitted.aic < best_aic:
                            best_aic = fitted.aic
                            best_model = fitted
                    except Exception:
                        continue
        
        if best_model is None:
            raise ValueError("No ARIMA model converged")
        
        # Forecast
        forecast = best_model.get_forecast(steps=forecast_days)
        predictions = forecast.predicted_mean.values
        conf_int = forecast.conf_int(alpha=0.2)  # 80% confidence
        lower = conf_int.iloc[:, 0].values
        upper = conf_int.iloc[:, 1].values
        
        return predictions, lower, upper


def _fit_exp_smoothing(series: pd.Series, forecast_days: int) -> tuple:
    """Fit Exponential Smoothing model and generate forecasts."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        model = ExponentialSmoothing(
            series,
            trend="add",
            seasonal=None,
            damped_trend=True
        )
        fitted = model.fit()
        
        # Forecast
        predictions = fitted.forecast(forecast_days).values
        
        # Approximate confidence intervals using residual std
        residuals = fitted.resid.dropna()
        std = residuals.std() if len(residuals) > 0 else series.std()
        
        lower = predictions - 1.28 * std  # 80% CI
        upper = predictions + 1.28 * std
        
        return predictions, lower, upper


def _calculate_trend(series: pd.Series) -> tuple[str, float]:
    """Calculate the trend direction and slope."""
    if len(series) < 7:
        return "stable", 0.0
    
    # Use last 14 days for trend
    recent = series[-14:] if len(series) >= 14 else series
    
    X = np.arange(len(recent)).reshape(-1, 1)
    y = recent.values
    
    model = LinearRegression()
    model.fit(X, y)
    
    slope = model.coef_[0]
    
    # Normalize slope by mean value
    mean_val = recent.mean()
    if mean_val != 0:
        normalized_slope = slope / mean_val
    else:
        normalized_slope = slope
    
    # Determine trend direction
    if normalized_slope > 0.01:
        trend = "improving"
    elif normalized_slope < -0.01:
        trend = "declining"
    else:
        trend = "stable"
    
    return trend, float(slope)


def _create_simple_forecast(
    sleep_data: list[SleepMetrics],
    metric: SleepMetricKey,
    forecast_days: int
) -> ForecastResult:
    """Create a simple mean-based forecast when not enough data."""
    # Extract metric values
    metric_col_map = {
        SleepMetricKey.TOTAL_SLEEP_MINUTES: "total_sleep_minutes",
        SleepMetricKey.DEEP_SLEEP_MINUTES: "deep_sleep_minutes",
        SleepMetricKey.REM_SLEEP_MINUTES: "rem_sleep_minutes",
        SleepMetricKey.SLEEP_EFFICIENCY: "sleep_efficiency",
        SleepMetricKey.AVG_HRV: "avg_hrv",
        SleepMetricKey.SLEEP_SCORE: "sleep_score",
    }
    
    col = metric_col_map.get(metric, metric.value)
    
    values = []
    for s in sleep_data:
        val = getattr(s, col, None)
        if val is not None:
            values.append(val)
    
    if not values:
        values = [0]
    
    mean_val = np.mean(values)
    std_val = np.std(values) if len(values) > 1 else mean_val * 0.1
    
    # Generate dates
    if sleep_data:
        last_date = datetime.strptime(sleep_data[-1].date, "%Y-%m-%d")
    else:
        last_date = datetime.now()
    
    predictions = [
        ForecastPoint(
            date=(last_date + timedelta(days=i+1)).strftime("%Y-%m-%d"),
            predicted=float(mean_val),
            lower=float(mean_val - std_val),
            upper=float(mean_val + std_val)
        )
        for i in range(forecast_days)
    ]
    
    return ForecastResult(
        metric=metric,
        predictions=predictions,
        trend="stable",
        trend_slope=0.0,
        confidence=0.3,
        model_used="Simple Mean"
    )
