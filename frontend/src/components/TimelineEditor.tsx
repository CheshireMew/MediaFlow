import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

interface TimelineEditorProps {
  mediaUrl: string;
  initialRegions?: { start: number; end: number; content: string; id: string }[];
  peaks?: unknown;
  onPeaksGenerated?: (peaks: ReturnType<WaveSurfer["exportPeaks"]>) => void;
}

export function TimelineEditor({ mediaUrl, initialRegions = [], peaks, onPeaksGenerated }: TimelineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const checkContainerRef = useRef<HTMLDivElement>(null); 
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Regions Plugin
    const wsRegions = RegionsPlugin.create();
    regionsPluginRef.current = wsRegions;

    // Initialize WaveSurfer
    const options: Parameters<typeof WaveSurfer.create>[0] = {
      container: containerRef.current,
      waveColor: "#4F46E5",
      progressColor: "#818cf8",
      url: mediaUrl,
      cursorColor: "#ddd",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
      minPxPerSec: 100, 
      plugins: [wsRegions],
    };

    // If peaks are provided, use them to skip decoding
    if (peaks) {
        options.backend = 'MediaElement'; // Faster for large files if we have peaks? Or just default with peaks.
        options.peaks = peaks;
    }

    const ws = WaveSurfer.create(options);
    wavesurferRef.current = ws;
    
    ws.on("decode", () => {
        setIsReady(true);
        // Export peaks if we didn't have them
        if (!peaks && onPeaksGenerated) {
            const exported = ws.exportPeaks(); 
            // WaveSurfer v7 exportPeaks returns (available in some versions), or we map backend.
            // Actually v7 has ws.exportPeaks() returning Array<Float32Array> or so.
            // Let's check docs or safe check.
            if (exported && exported.length > 0) {
                 onPeaksGenerated(exported);
            }
        }
    });

    // Handle pre-decoded ready state (peaks provided)
    ws.on("ready", () => {
        setIsReady(true);
        if (!peaks && onPeaksGenerated) {
             const exported = ws.exportPeaks();
             if (exported && exported.length > 0) onPeaksGenerated(exported);
        }
    });

    ws.on("interaction", () => {
      ws.play();
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("error", (e) => console.error("WaveSurfer Error:", e));

    // Regions setup
    wsRegions.clearRegions();
    initialRegions.forEach((region) => {
        wsRegions.addRegion({
            start: region.start,
            end: region.end,
            content: region.content,
            color: "rgba(0, 255, 0, 0.1)",
            drag: true,
            resize: true,
            id: region.id
        });
    });
    
    return () => {
      ws.destroy();
    };
  }, [mediaUrl, initialRegions, onPeaksGenerated, peaks]);

  // Zoom Handler
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
        wavesurferRef.current.zoom(zoom);
    }
  }, [zoom, isReady]);

  const togglePlay = () => {
    wavesurferRef.current?.playPause();
  };

  return (
    <div style={{ padding: 20, background: "#1e1e1e", borderRadius: 8, color: "white" }}>
      <div style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={togglePlay} style={{ cursor: "pointer", padding: "5px 15px" }}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <label>
            Zoom: 
            <input 
                type="range" 
                min="10" 
                max="500" 
                value={zoom} 
                onChange={(e) => setZoom(Number(e.target.value))} 
            />
        </label>
      </div>

      <div 
        ref={containerRef} 
        style={{ width: "100%", border: "1px solid #333", borderRadius: 4 }} 
      />
      
      <div ref={checkContainerRef} style={{marginTop: 5, fontSize: 12, color: '#666'}}>
        Drag regions to adjust timing.
      </div>
    </div>
  );
}
