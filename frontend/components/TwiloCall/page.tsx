"use client";
import { useState, useRef } from "react";

export default function VapiCall() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState("Idle");
  const [listenStatus, setListenStatus] = useState("Not listening");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startCall = async () => {
    try {
      setCallStatus("Starting call...");
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/vapi_call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: phoneNumber }),
      });

      if (!res.ok) throw new Error("Failed to start call");

      const { listenUrl } = await res.json();
      if (!listenUrl) throw new Error("Listen URL not received");

      startListening(listenUrl);
      setCallStatus("Call in progress...");
    } catch (err) {
      console.error("Error starting call:", err);
      setCallStatus("Call failed");
    }
  };

  const startListening = (listenUrl: string) => {
    const socket = new WebSocket(listenUrl);
    socket.binaryType = "arraybuffer";

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    socket.onopen = () => setListenStatus("Listening...");
    socket.onclose = () => setListenStatus("Closed");
    socket.onerror = () => setListenStatus("Error");

    socket.onmessage = (evt) => {
      const arrayBuffer = evt.data;
      const pcmData = new Int16Array(arrayBuffer);
      const float32Data = new Float32Array(pcmData.length);

      // Convert PCM to Float32
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768;
      }

      // Create AudioBuffer
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 8000);
      audioBuffer.getChannelData(0).set(float32Data);

      // Play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    };

    setWs(socket);
  };

  const stopListening = () => {
    ws?.close();
    setWs(null);
    setListenStatus("Stopped");
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-400 mb-6">Vapi Browser Call</h1>

        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Phone Number:</label>
          <input
            type="tel"
            placeholder="+1234567890"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full border text-gray-400 border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-between mb-6">
          <button
            onClick={startCall}
            disabled={!phoneNumber || ws !== null}
            className={`px-4 py-2 rounded text-white ${(!phoneNumber || ws !== null) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}
          >
            Start Call
          </button>
          <button
            onClick={stopListening}
            disabled={!ws}
            className={`px-4 py-2 rounded text-white ${!ws ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 cursor-pointer'}`}
          >
            Stop Listening
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Call Status:</label>
          <div className={`p-2 rounded ${callStatus.includes("failed") ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {callStatus}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 mb-2">Listen Status:</label>
          <div className={`p-2 rounded ${listenStatus === "Listening..." ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {listenStatus}
          </div>
        </div>
      </div>
    </main>
  );
}
