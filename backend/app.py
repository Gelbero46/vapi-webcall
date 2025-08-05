from flask import Flask, request, jsonify
from flask_cors import CORS
from vapi import Vapi
import os
import logging
from datetime import datetime

app = Flask(__name__)
# CORS(app, origins=["http://localhost:3000"])  # Restrict origins in production
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Vapi configs with validation
VAPI_API_KEY = os.getenv("VAPI_API_KEY")
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID")

if not all([VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID]):
    logger.error("Missing required environment variables")
    raise ValueError("Missing Vapi configuration")

# Initialize Vapi client
vapi = Vapi(token=VAPI_API_KEY)

@app.route("/api/vapi_call", methods=["POST"])
def vapi_call():
    try:
        data = request.get_json() or {}
        customer_number = data.get("number", "").strip()
        
        # Input validation
        if not customer_number:
            return jsonify({"error": "Phone number is required"}), 400
            
        if not customer_number.startswith('+'):
            return jsonify({"error": "Phone number must include country code (e.g., +1234567890)"}), 400

        logger.info(f"Creating call to {customer_number}")
        
        # Create call with enhanced configuration
        call = vapi.calls.create(
            assistant_id=VAPI_ASSISTANT_ID,
            phone_number_id=VAPI_PHONE_NUMBER_ID,
            customer={"number": customer_number},
            monitor={
                "listen": True,
                "listenUrl": True  # Ensure listen URL is generated
            }
        )
        
        if not call or not hasattr(call, 'id'):
            logger.error("Invalid call response from Vapi")
            return jsonify({"error": "Failed to create call"}), 500
            
        if not hasattr(call, 'monitor') or not call.monitor or not call.monitor.listenUrl:
            logger.error("No listen URL in call response")
            return jsonify({"error": "Listen URL not available"}), 500

        logger.info(f"Call created successfully: {call.id}")
        
        return jsonify({
            "callId": call.id,
            "listenUrl": call.monitor.listenUrl,
            "status": "created",
            "timestamp": datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Vapi call creation failed: {str(e)}")
        return jsonify({
            "error": "Failed to create call", 
            "details": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500

@app.route("/api/call_status/<call_id>", methods=["GET"])
def get_call_status(call_id):
    """Optional: Get call status"""
    try:
        call = vapi.calls.get(call_id)
        return jsonify({
            "callId": call_id,
            "status": call.status if call else "unknown"
        })
    except Exception as e:
        logger.error(f"Failed to get call status: {str(e)}")
        return jsonify({"error": "Failed to get call status"}), 500

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)