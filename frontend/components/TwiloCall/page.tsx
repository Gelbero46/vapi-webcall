"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface AudioQueueItem {
  data: Float32Array;
  timestamp: number;
}

export default function VapiCall() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState("Idle");
  const [listenStatus, setListenStatus] = useState("Not listening");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueueItem[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsUrlRef = useRef<string>("");

  // Initialize Audio Context
  const initAudioContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'running') return;
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
      console.log('Audio context initialized:', audioContextRef.current.sampleRate);
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      setListenStatus("Audio Error");
    }
  }, []);

  // Extra valiation
  const validateAudioData = (data: ArrayBuffer): boolean => {
    // Check if ArrayBuffer exists and has content
    if (!data || data.byteLength === 0) {
      console.warn('Invalid or empty ArrayBuffer');
      return false;
    }
  
    // Check if it's divisible by 2 (valid 16-bit PCM)
    if (data.byteLength % 2 !== 0) {
      console.warn('Invalid PCM data: odd byte length');
      return false;
    }
  
    // Check minimum size (avoid Web Audio API edge cases)
    const sampleCount = data.byteLength / 2;
    if (sampleCount < 128) {
      console.warn(`PCM data too small: ${sampleCount} samples`);
      return false;
    }
  
    return true;
  };
  


  // Process audio queue with proper timing
  const processAudioQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) return;

    const audioContext = audioContextRef.current;
    const currentTime = audioContext.currentTime;
    
    // Process multiple queued items to catch up if needed
    while (audioQueueRef.current.length > 0) {
      const item = audioQueueRef.current.shift()!;
      
      try {
        // 🛡️ CRITICAL: Validate buffer size before creating AudioBuffer
        if (item.data.length === 0) {
          console.warn('Skipping empty audio data in queue');
          continue;
        }

        // 🛡️ CRITICAL: Minimum buffer size check (avoid Web Audio API limits)
        if (item.data.length < 128) {
          console.warn(`Audio chunk too small (${item.data.length} samples), skipping`);
          continue;
        }

        // Create audio buffer - now guaranteed to be valid
        const audioBuffer = audioContext.createBuffer(1, item.data.length, audioContext.sampleRate);
        audioBuffer.getChannelData(0).set(item.data);

        // Create and schedule source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        // Schedule playback to maintain continuity
        const playTime = Math.max(currentTime, nextPlayTimeRef.current);
        source.start(playTime);
        
        // Update next play time
        nextPlayTimeRef.current = playTime + audioBuffer.duration;

        // Remove old items if queue gets too large (avoid memory buildup)
        if (audioQueueRef.current.length > 50) {
          console.warn('Audio queue overflow, dropping old samples');
          audioQueueRef.current = audioQueueRef.current.slice(-25);
        }
        
      } catch (error) {
        console.error('Error playing audio buffer:', error);
        // Continue processing other items even if one fails
      }
    }
  }, []);

  // Enhanced WebSocket connection with reconnection
  const connectWebSocket = useCallback((listenUrl: string) => {
    wsUrlRef.current = listenUrl;
    
    const socket = new WebSocket(listenUrl);
    socket.binaryType = "arraybuffer";

    socket.onopen = async () => {
      console.log('WebSocket connected');
      setListenStatus("Listening...");
      await initAudioContext();
      setIsPlaying(true);
      
      // Clear any reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (evt) => {
      if (!audioContextRef.current) return;

      try {
        if (evt.data instanceof ArrayBuffer) {

          if (!validateAudioData(evt.data)) return;

          // Handle binary audio data
          const arrayBuffer = evt.data;
          
          // 🛡️ CRITICAL: Check for empty buffer first
          if (arrayBuffer.byteLength === 0) {
            console.warn('Received empty audio buffer, skipping');
            return;
          }

          const pcmData = new Int16Array(arrayBuffer);
          
          // 🛡️ CRITICAL: Double-check PCM data length
          if (pcmData.length === 0) {
            console.warn('PCM data has zero length, skipping');
            return;
          }

          const float32Data = new Float32Array(pcmData.length);

          // Convert PCM to Float32 with proper scaling
          for (let i = 0; i < pcmData.length; i++) {
            float32Data[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768));
          }

          // 🛡️ CRITICAL: Final validation before queuing
          if (float32Data.length === 0) {
            console.warn('Float32 data has zero length, skipping');
            return;
          }

          // Add to queue instead of playing immediately
          audioQueueRef.current.push({
            data: float32Data,
            timestamp: Date.now()
          });

          // Process queue
          processAudioQueue();
          
        } else {
          // Handle JSON messages
          try {
            const message = JSON.parse(evt.data);
            console.log('Received message:', message);
            
            // Handle different message types
            if (message.type === 'call-ended') {
              setCallStatus("Call ended");
              stopListening();
            }
          } catch (jsonError) {
            console.warn('Non-JSON message received:', evt.data);
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    socket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setListenStatus("Connection closed");
      setIsPlaying(false);
      
      // Attempt reconnection if it wasn't a clean close
      if (event.code !== 1000 && event.code !== 1001 && wsUrlRef.current) {
        console.log('Attempting to reconnect...');
        setListenStatus("Reconnecting...");
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(wsUrlRef.current);
        }, 2000);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setListenStatus("Connection error");
      setIsPlaying(false);
    };

    setWs(socket);
  }, [initAudioContext, processAudioQueue]);

  const startCall = async () => {
    try {
      setCallStatus("Starting call...");
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/vapi_call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: phoneNumber }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const { listenUrl, callId } = await res.json();
      if (!listenUrl) throw new Error("Listen URL not received");

      console.log('Call created:', callId);
      connectWebSocket(listenUrl);
      setCallStatus("Call in progress...");
      
    } catch (err) {
      console.error("Error starting call:", err);
      setCallStatus(`Call failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const stopListening = useCallback(() => {
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close WebSocket
    if (ws) {
      ws.close(1000, 'User stopped listening');
      setWs(null);
    }
    
    // Clear audio queue
    audioQueueRef.current = [];
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setListenStatus("Stopped");
    setIsPlaying(false);
    setCallStatus("Idle");
    wsUrlRef.current = "";
  }, [ws]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  // Audio context state management
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && audioContextRef.current) {
        audioContextRef.current.suspend();
      } else if (!document.hidden && audioContextRef.current && isPlaying) {
        audioContextRef.current.resume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Enhanced Vapi Call
        </h1>

        <div className="mb-4">
          <label className="block text-gray-700 mb-2 font-medium">Phone Number:</label>
          <input
            type="tel"
            placeholder="+1234567890"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full border text-gray-700 border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={startCall}
            disabled={!phoneNumber || ws !== null}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              (!phoneNumber || ws !== null) 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {ws ? 'Call Active' : 'Start Call'}
          </button>
          
          <button
            onClick={stopListening}
            disabled={!ws}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              !ws 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-700 active:bg-red-800'
            }`}
          >
            End Call
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-2 font-medium">Call Status:</label>
            <div className={`p-3 rounded-lg border ${
              callStatus.includes("failed") || callStatus.includes("Error")
                ? 'bg-red-50 text-red-700 border-red-200'
                : callStatus.includes("progress") || callStatus.includes("ended")
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}>
              {callStatus}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 mb-2 font-medium">Audio Status:</label>
            <div className={`p-3 rounded-lg border flex items-center justify-between ${
              listenStatus === "Listening..." 
                ? 'bg-green-50 text-green-700 border-green-200'
                : listenStatus.includes("Error")
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
            }`}>
              <span>{listenStatus}</span>
              {isPlaying && (
                <div className="flex space-x-1">
                  <div className="w-1 h-4 bg-green-500 rounded animate-pulse"></div>
                  <div className="w-1 h-4 bg-green-500 rounded animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-1 h-4 bg-green-500 rounded animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
              )}
            </div>
          </div>

          {audioQueueRef.current.length > 0 && (
            <div className="text-sm text-gray-500">
              Audio buffer: {audioQueueRef.current.length} chunks
            </div>
          )}
        </div>
      </div>
    </main>
  );
}