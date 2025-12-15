from fastapi import FastAPI
import sys
import os

# Add the project root to the python path to find ml-service
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../ml-service'))

try:
    from main import app as ml_app
except ImportError as e:
    print(f"Import error: {e}")
    # Create dummy app to show error
    ml_app = FastAPI()
    @ml_app.get("/{path:path}")
    def error_handler(path: str):
         return {"error": "Failed to load ML service", "detail": str(e)}

# Wrapper app to handle the /api/ml prefix
# When rewriting /api/ml/* to this function, FastAPI needs to know about the prefix
# or we just mount the app logic under that path.
app = FastAPI()

# Mount the original app under /api/ml so that the routes match
# e.g. request to /api/ml/health matches mounted app's /health
app.mount("/api/ml", ml_app)

# Also support direct access if paths are stripped (just in case)
app.mount("/", ml_app)
