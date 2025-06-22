from flask import Flask, request, jsonify
from flask_cors import CORS
from vapi import Vapi
import os

app = Flask(__name__)
CORS(app)

# Load Vapi and Twilio configs from environment
VAPI_API_KEY = os.getenv("VAPI_API_KEY")
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID")  # Configured in Vapi Dashboard

# Initialize Vapi client
vapi = Vapi(token=VAPI_API_KEY)

@app.route("/api/vapi_call", methods=["POST"])
def vapi_call():
    data = request.get_json() or {}
    customer_number = data.get("number")
    if not customer_number:
        return jsonify({"error": "Missing 'number' in request"}), 400

    try:
        call = vapi.calls.create(
            assistant_id=VAPI_ASSISTANT_ID,
            phone_number_id=VAPI_PHONE_NUMBER_ID,
            customer={"number": customer_number},
            monitor={"listen": True}
        )
    except Exception as e:
        return jsonify({"error": "Vapi call creation failed", "details": str(e)}), 500

    return jsonify({
        "callId": call.id,
        "listenUrl": call.monitor.listenUrl
    })

