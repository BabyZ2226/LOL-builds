/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Play, 
  Square, 
  Shield, 
  Sword, 
  Zap, 
  MessageSquare, 
  Loader2,
  Monitor,
  Trophy,
  AlertCircle,
  Clock,
  Target,
  Eye,
  TrendingUp,
  RefreshCw,
  History,
  EyeOff,
  Users,
  Gamepad2,
  Settings,
  ExternalLink,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini inside the function to ensure it gets the latest key
// const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AnalysisResult {
  gameMode: string;
  playerChampion: string;
  enemyTeam: string[];
  primaryThreat: string;
  items: string[];
  strategy: string;
  plays: string[];
  alerts: string[];
  objectives: string;
  minimapAnalysis: string;
  jungleTracking: string;
  objectiveTimers: string;
  threatLevel: number; // 0-100
  powerSpike: string;
  winProbability: number; // 0-100
  teamComp: string;
  gamePhase: string;
  timestamp: number;
}

const PipContent = ({ analysis, isAnalyzing }: { analysis: any, isAnalyzing: boolean }) => {
  return (
    <div className="w-full h-full p-4 border-4 border-cyan-500 flex flex-col bg-zinc-950 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-black text-cyan-400 tracking-widest">HEXVISION TACTICAL</h1>
        <div className={`w-4 h-4 rounded-full ${isAnalyzing ? 'bg-cyan-500 animate-pulse' : 'bg-green-500'}`} />
      </div>
      
      {!analysis ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 font-bold text-xl">
          ESPERANDO ANÁLISIS...
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          {analysis.playerChampion && (
            <h2 className="text-3xl font-black text-white">{analysis.playerChampion}</h2>
          )}
          
          <div>
            <h3 className="text-orange-500 font-bold text-lg mb-2">ALERTAS CRÍTICAS:</h3>
            {Array.isArray(analysis.alerts) && analysis.alerts.length > 0 ? (
              <ul className="space-y-2">
                {analysis.alerts.slice(0, 3).map((alert: string, i: number) => (
                  <li key={i} className="text-orange-400 text-sm font-medium leading-tight">• {alert}</li>
                ))}
              </ul>
            ) : (
              <p className="text-green-500 text-sm font-medium">• No hay amenazas inmediatas</p>
            )}
          </div>

          {analysis.strategy && (
            <div className="mt-auto">
              <p className="text-cyan-400 text-sm italic line-clamp-2">{analysis.strategy}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<number | null>(null);
  const [captureFailCount, setCaptureFailCount] = useState(0);
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [showPipWarning, setShowPipWarning] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    totalAnalyses: 0,
    alertsDetected: 0,
    objectivesNoted: 0,
    threatAverage: 0
  });
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ddVersion, setDdVersion] = useState("14.6.1"); // Fallback version
  const [championData, setChampionData] = useState<any>(null);
  const [itemData, setItemData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(true); // Default to true to save resources
  const [performanceMode, setPerformanceMode] = useState(true); // New: aggressive resource saving
  const [champion, setChampion] = useState("");
  const [role, setRole] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const [manualEnemyTeam, setManualEnemyTeam] = useState<string[]>(["", "", "", "", ""]);
  
  // Riot API State
  const [summonerName, setSummonerName] = useState("");
  const [region, setRegion] = useState("la1"); // Default to la1 (LAN)
  const [summonerData, setSummonerData] = useState<any>(null);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [activeGame, setActiveGame] = useState<any>(null);
  const [isConnectingRiot, setIsConnectingRiot] = useState(false);
  const [riotError, setRiotError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<{ riotKeyConfigured: boolean, geminiKeyConfigured: boolean } | null>(null);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localRiotKey, setLocalRiotKey] = useState<string>(() => localStorage.getItem('riot_api_key') || '');

  useEffect(() => {
    fetch('/api/config-check')
      .then(res => res.json())
      .then(data => setConfigStatus(data))
      .catch(err => console.error("Config check failed:", err));
  }, []);

  // Persist API Key
  useEffect(() => {
    localStorage.setItem('riot_api_key', localRiotKey);
  }, [localRiotKey]);

  // Auto-refresh game status if connected
  useEffect(() => {
    if (!summonerData) return;

    const interval = setInterval(() => {
      // Only refresh if not already in a game or every 2 mins to update time
      connectRiotAccount();
    }, 60000);

    return () => clearInterval(interval);
  }, [summonerData]);

  const handleSummonerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Check if it's an OP.GG link or similar
    if (val.includes('op.gg/summoners/')) {
      try {
        const parts = val.split('op.gg/summoners/')[1].split('/');
        const regionPart = parts[0].toLowerCase();
        const namePart = decodeURIComponent(parts[1]);
        
        // Map OP.GG regions to Riot regions
        const regionMap: Record<string, string> = {
          'lan': 'la1',
          'las': 'la2',
          'na': 'na1',
          'euw': 'euw1',
          'eune': 'eun1',
          'br': 'br1',
          'kr': 'kr',
          'jp': 'jp1',
          'oce': 'oc1',
          'tr': 'tr1',
          'ru': 'ru',
          'ph': 'ph2',
          'sg': 'sg2',
          'th': 'th2',
          'tw': 'tw2',
          'vn': 'vn2'
        };
        
        if (regionMap[regionPart]) {
          setRegion(regionMap[regionPart]);
        }
        setSummonerName(namePart);
        return;
      } catch (err) {
        console.error("Error parsing OP.GG link:", err);
      }
    }
    setSummonerName(val);
  };

  const connectRiotAccount = async () => {
    if (!summonerName) return;
    const trimmedName = summonerName.trim();
    setIsConnectingRiot(true);
    setRiotError(null);
    try {
      const headers: Record<string, string> = {};
      if (localRiotKey) {
        headers['x-riot-token-override'] = localRiotKey;
      }

      // 1. Get Summoner Info
      const resSummoner = await fetch(`/api/riot/summoner/${region}/${encodeURIComponent(trimmedName)}`, { headers });
      const sData = await resSummoner.json();
      
      if (!resSummoner.ok) {
        const errorMsg = sData.message || sData.error || "No se encontró el invocador. Verifica el nombre y la región.";
        throw new Error(errorMsg);
      }
      
      setSummonerData(sData);

      // 2. Get League Info
      const resLeague = await fetch(`/api/riot/league/${region}/${sData.id}`, { headers });
      if (resLeague.ok) {
        const lData = await resLeague.json();
        setLeagueData(lData);
      }

      // 3. Check for Active Game
      const resGame = await fetch(`/api/riot/active-game/${region}/${sData.puuid}`, { headers });
      if (resGame.ok) {
        const gData = await resGame.json();
        setActiveGame(gData);
      } else {
        setActiveGame(null);
      }
    } catch (err: any) {
      setRiotError(err.message);
    } finally {
      setIsConnectingRiot(false);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Automate analysis: on start and every 5 minutes
  useEffect(() => {
    let interval: any;
    if (isStreaming) {
      // Initial analysis after a short delay
      const initialTimeout = setTimeout(() => {
        analyzeGame();
      }, 3000);

      // Auto-analyze every 5 minutes (300,000 ms)
      interval = setInterval(() => {
        analyzeGame();
      }, 300000);

      return () => {
        clearTimeout(initialTimeout);
        clearInterval(interval);
      };
    }
  }, [isStreaming]);

  useEffect(() => {
    // Fetch latest Data Dragon version
    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then(res => res.json())
      .then(versions => setDdVersion(versions[0]))
      .catch(err => console.error("Error fetching DDragon version:", err));
  }, []);

  useEffect(() => {
    if (!ddVersion) return;

    // Fetch champion data
    fetch(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/es_ES/champion.json`)
      .then(res => res.json())
      .then(data => setChampionData(data.data))
      .catch(err => console.error("Error fetching champion data:", err));

    // Fetch item data (using en_US for better AI matching)
    fetch(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/item.json`)
      .then(res => res.json())
      .then(data => setItemData(data.data))
      .catch(err => console.error("Error fetching item data:", err));
  }, [ddVersion]);

  const getChampionIcon = (name: string) => {
    if (!name) return null;
    // Normalize name for DDragon (e.g., "K'Sante" -> "KSante", "Jarvan IV" -> "JarvanIV")
    const id = name.replace(/[^a-zA-Z0-9]/g, '');
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${id}.png`;
  };

  const getChampionStats = (name: string) => {
    if (!championData || !name) return null;
    const id = name.replace(/[^a-zA-Z0-9]/g, '');
    return championData[id]?.stats;
  };

  const getChampionNameById = (id: number | string) => {
    if (!championData) return id.toString();
    const champ = Object.values(championData).find((c: any) => c.key === id.toString());
    return champ ? (champ as any).name : id.toString();
  };

  const getItemIcon = (name: string) => {
    if (!itemData || !name) return null;
    const itemNameLower = name.toLowerCase().trim();
    
    // 1. Try exact match
    let itemEntry = Object.entries(itemData).find(([_, data]: [string, any]) => 
      data.name.toLowerCase() === itemNameLower
    );

    // 2. Try partial match if no exact match
    if (!itemEntry) {
      itemEntry = Object.entries(itemData).find(([_, data]: [string, any]) => 
        data.name.toLowerCase().includes(itemNameLower) || 
        itemNameLower.includes(data.name.toLowerCase())
      );
    }

    // 3. Try fuzzy match (remove common words and special characters)
    if (!itemEntry) {
      const cleanName = itemNameLower
        .replace(/\b(the|of|and|a|an)\b/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
        
      itemEntry = Object.entries(itemData).find(([_, data]: [string, any]) => {
        const cleanDataName = data.name.toLowerCase()
          .replace(/\b(the|of|and|a|an)\b/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return cleanDataName.includes(cleanName) || cleanName.includes(cleanDataName);
      });
    }

    if (itemEntry) {
      // Primary: Data Dragon
      return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${itemEntry[0]}.png`;
    }
    
    return null;
  };

  const stopScreenShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setAnalysis(null);
  }, []);

  const startScreenShare = async () => {
    // 1. Full cleanup of any previous state
    stopScreenShare();
    setError(null);
    
    // 2. Wait longer for the OS/Browser to release resources
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Navegador no compatible. Usa Chrome/Edge en PC.");
      }

      // 3. Request stream with optimized constraints for low GPU usage
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 1, max: 2 }, // Ultra-low framerate saves massive GPU
          width: { max: 1280 }, // Reduced max resolution
          height: { max: 720 }
        },
        audio: false
      });
      
      if (!stream || stream.getVideoTracks().length === 0) {
        throw new Error("No se recibió ninguna pista de video.");
      }

      const videoTrack = stream.getVideoTracks()[0];
      
      // 4. Bind stream to video element immediately
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for metadata to load before playing
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
          } catch (e) {
            console.warn("Play error:", e);
          }
        };
      }
      
      streamRef.current = stream;
      setIsStreaming(true);

      // 5. Handle unexpected disconnection
      videoTrack.onended = () => {
        stopScreenShare();
      };

      // 6. Start analysis loop with a safe buffer
      if (autoMode) {
        setTimeout(() => {
          if (streamRef.current?.active) {
            startAnalysisLoop();
          }
        }, 2000);
      }
    } catch (err: any) {
      console.error("Screen share error:", err);
      
      let msg = "Error al conectar con el juego.";
      
      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes("denied")) {
        msg = "PERMISO DENEGADO: Has cancelado la solicitud de compartir pantalla. Para que HEXVISION funcione, debes pulsar 'ENLAZAR' de nuevo y seleccionar la ventana de tu juego.";
      } else if (err.name === 'AbortError' || err.message?.includes("Timeout")) {
        msg = "TIEMPO AGOTADO: El proceso de conexión tardó demasiado. Por favor, intenta de nuevo y selecciona la ventana del juego rápidamente (menos de 30s).";
      } else if (err.name === 'NotReadableError') {
        msg = "ERROR DE LECTURA: Otra aplicación podría estar bloqueando el acceso a la pantalla o el juego está en modo exclusivo.";
      } else {
        msg = `ERROR TÉCNICO: ${err.message || "Asegúrate de que el juego esté abierto y en modo Ventana o Ventana sin bordes."}`;
      }
      
      setError(msg);
      stopScreenShare();
    }
  };

  const captureFrame = (): { data: string, isBlack: boolean } | null => {
    if (!videoRef.current || !canvasRef.current || !isStreaming) return null;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    // OPTIMIZATION: Reduce scale significantly to save resources and bandwidth
    const scale = performanceMode ? 0.4 : 0.6; 
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d', { 
      alpha: false, 
      desynchronized: true,
      willReadFrequently: true // Optimized for getImageData
    });
    if (!ctx) return null;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low'; // 'high' is too expensive
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Check for black frame (only sample a few pixels)
    let isBlack = false;
    try {
      const sampleSize = 5;
      const pixelData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
      let totalBrightness = 0;
      for (let i = 0; i < pixelData.length; i += 4) {
        totalBrightness += (pixelData[i] + pixelData[i+1] + pixelData[i+2]) / 3;
      }
      if (totalBrightness / (sampleSize * sampleSize) < 5) {
        isBlack = true;
      }
    } catch (e) {
      // Ignore CORS or other issues
    }

    if (debugMode) {
      ctx.fillStyle = isBlack ? 'red' : 'green';
      ctx.beginPath();
      ctx.arc(20, 20, 10, 0, Math.PI * 2);
      ctx.fill();
      
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = 160;
      previewCanvas.height = 90;
      const pCtx = previewCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(canvas, 0, 0, 160, 90);
        setDebugImage(previewCanvas.toDataURL('image/jpeg', 0.5));
      }
    }
    
    const dataUrl = canvas.toDataURL('image/jpeg', performanceMode ? 0.4 : 0.6);
    return { data: dataUrl.split(',')[1], isBlack };
  };

  const analyzeGame = async (apiOnly = false) => {
    // Don't analyze if the tab is hidden or already analyzing
    if (document.visibilityState === 'hidden' || isAnalyzing) return;

    let base64Image = null;
    if (!apiOnly) {
      const capture = captureFrame();
      if (!capture) {
        if (isStreaming) {
          setCaptureFailCount(prev => prev + 1);
          if (captureFailCount >= 3) {
            setError("La IA no puede ver tu pantalla. Asegúrate de que la ventana del juego no esté minimizada.");
          }
        }
        return;
      }

      if (capture.isBlack) {
        setError("CAPTURA NEGRA: El juego está en pantalla completa exclusiva o minimizado. Cambia a 'Ventana sin bordes' en los ajustes de LoL.");
        return;
      }
      base64Image = capture.data;
    }

    setCaptureFailCount(0);
    setError(null);

    setIsAnalyzing(true);
    try {
      // Build context from Riot API if available
      let riotContext = "";
      if (summonerData) {
        riotContext += `\n[DATOS REALES DE RIOT API - PRIORIDAD MÁXIMA]`;
        riotContext += `\n- Jugador: ${summonerData.name} (Nivel ${summonerData.summonerLevel})`;
        
        if (leagueData && leagueData.length > 0) {
          const rank = leagueData[0];
          riotContext += `\n- Rango: ${rank.tier} ${rank.rank} (${rank.leaguePoints} LP)`;
        }

        if (activeGame) {
          const gameTimeMinutes = Math.floor(activeGame.gameLength / 60);
          riotContext += `\n- ESTADO DE PARTIDA: En curso (${activeGame.gameMode})`;
          riotContext += `\n- TIEMPO TRANSCURRIDO: ${gameTimeMinutes} minutos aprox.`;
          
          // Identify player's champion in the active game
          const me = activeGame.participants.find((p: any) => p.puuid === summonerData.puuid);
          if (me) {
            const myChampName = getChampionNameById(me.championId);
            riotContext += `\n- CAMPEÓN DEL JUGADOR: ${myChampName} (ID: ${me.championId})`;
            // Update champion state if not manually set or if API confirms it
            if (!champion || champion.toLowerCase() !== myChampName.toLowerCase()) {
              setChampion(myChampName);
            }
          }

          // Team compositions
          const myTeamId = me?.teamId;
          const allies = activeGame.participants.filter((p: any) => p.teamId === myTeamId && p.puuid !== summonerData.puuid);
          const enemies = activeGame.participants.filter((p: any) => p.teamId !== myTeamId);

          riotContext += `\n- ALIADOS EN PARTIDA: ${allies.map((a: any) => getChampionNameById(a.championId)).join(', ')}`;
          riotContext += `\n- ENEMIGOS EN PARTIDA (CONFIRMADO): ${enemies.map((e: any) => getChampionNameById(e.championId)).join(', ')}`;
          
          if (activeGame.bannedChampions && activeGame.bannedChampions.length > 0) {
            riotContext += `\n- BANEOS: ${activeGame.bannedChampions.map((b: any) => getChampionNameById(b.championId)).join(', ')}`;
          }

          if (apiOnly) {
            riotContext += `\n\nINSTRUCCIÓN ESPECIAL: No tienes imagen de la partida. Analiza basándote ÚNICAMENTE en estos datos de la API. Predice el estado de la partida basándote en el tiempo transcurrido y las composiciones de equipo. Sé más general en los consejos tácticos pero preciso en la estrategia de composición.`;
          } else if (summonerData && activeGame) {
            riotContext += `\n\n[MODO ANÁLISIS DOBLE / HÍBRIDO]
INSTRUCCIÓN: Tienes tanto la visión directa como los datos de la API. 
1. Cruza la información: Si la API dice que hay un enemigo y no lo ves en pantalla, advierte sobre su posible posición.
2. Usa el tiempo de partida (${gameTimeMinutes} min) para contextualizar lo que ves.
3. Si el TAB está abierto en la captura, úsalo para confirmar niveles y objetos.
4. Tu análisis debe ser una síntesis perfecta entre lo visual y lo técnico.`;
          } else {
            riotContext += `\n\nINSTRUCCIÓN: Usa estos datos de la API para confirmar lo que ves en pantalla. Si la API dice que hay un enemigo específico, búscalo en el minimapa o en los retratos laterales. Da consejos basados en el tiempo de partida (${gameTimeMinutes} min).`;
          }
        }
      }

      const contextStr = `${champion ? `Jugador actual: ${champion}.` : ''} ${role ? `Rol: ${role}.` : ''} ${manualEnemyTeam.filter(e => e).length > 0 ? `Enemigos manuales: ${manualEnemyTeam.filter(e => e).join(', ')}.` : ''} ${riotContext}`;
      
      const prompt = `Eres HEXVISION, el sistema de inteligencia táctica definitivo para League of Legends. 
      Tu objetivo es realizar un análisis estratégico exhaustivo. 
      ${apiOnly ? 'Actualmente estás operando en MODO API (sin visión directa).' : (summonerData && activeGame ? 'ESTÁS EN MODO ANÁLISIS DOBLE (HÍBRIDO): Combina la visión directa en tiempo real con los datos técnicos de la API de Riot para una precisión del 100%.' : 'Combina la visión directa con los datos de la API.')}

      ${!apiOnly ? `
      INSTRUCCIONES CRÍTICAS DE DETECCIÓN:
      1. LOCALIZACIÓN: Si la captura muestra el escritorio completo o múltiples ventanas, BUSCA ACTIVAMENTE la ventana de League of Legends (la partida en curso). Identifícala por el minimapa circular/cuadrado en la esquina, los retratos de campeones y el HUD central.
      2. PRIORIDAD: Analiza ÚNICAMENTE la región del juego. Ignora barras de tareas, navegadores u otras aplicaciones visibles en la captura.
      3. ESTADO DEL JUEGO: Si la captura muestra el CLIENTE DE CHAT (launcher) y no la PARTIDA EN CURSO, indica "launcher" en gameMode.
      
      GUÍA DE RECONOCIMIENTO VISUAL (UI de LoL):
      - CAMPEÓN Y ESTADÍSTICAS: Parte inferior central (HUD).
      - OBJETOS/ITEMS: Parte inferior derecha del HUD central.
      - MINIMAPA: Esquina inferior derecha. Crucial para rastreo de jungla y visión.
      - MARCADOR (TAB): Si la ventana de puntuaciones (TAB) está abierta, es la fuente más fiable para identificar a los 5 enemigos.
      - RETRATOS LATERALES: Si el TAB no está abierto, revisa los retratos de campeones en el borde derecho de la pantalla (aliados a la izquierda, enemigos a la derecha).
      - ENEMIGOS (CRÍTICO): Identifica los 5 campeones enemigos sin falta. Si solo ves algunos, intenta deducir el resto por el minimapa o modelos 3D en pantalla.
      - NIVEL Y ORO: Revisa la barra de experiencia y el contador de oro.
      ` : 'MODO API: Analiza las fortalezas y debilidades de las composiciones, predice picos de poder y sugiere estrategias de macro-juego basadas en el tiempo transcurrido.'}

      ${contextStr}
      
      REQUERIMIENTOS DE ANÁLISIS:
      1. IDENTIFICACIÓN PRECISA: Determina el modo de juego (Grieta, ARAM), el campeón del jugador y los 5 campeones enemigos.
      2. FASE DE PARTIDA: Determina si estamos en "Early Game" (fase de líneas), "Mid Game" (rotaciones y objetivos medios) o "Late Game" (teamfights finales y objetivos mayores).
      3. AMENAZA PRINCIPAL: Identifica cuál de los 5 enemigos es la mayor amenaza actual basándote en su kit y escalado.
      4. ESTRATEGIA INMEDIATA: ¿Qué debe hacer el jugador JUSTO AHORA? (ej: "Empuja la línea y rota a Dragón", "Juega defensivo bajo torre", "Busca un pick en la jungla enemiga").
      5. INTELIGENCIA DE MINIMAPA: ${apiOnly ? 'Sugiere dónde debería haber visión y qué zonas son peligrosas.' : 'Detecta movimientos enemigos, predice la posición del jungla rival y señala zonas sin visión.'}
      6. OPTIMIZACIÓN DE BUILD: Recomienda una lista de los 5 objetos más importantes para la build completa en orden de compra, adaptada a la partida actual.
      7. MICRO-TIPS: 2 consejos mecánicos específicos para el campeón detectado en esta situación.
      8. ALERTAS: Identifica peligros inminentes (ganks, objetivos naciendo, enemigos desaparecidos).
      9. NIVEL DE AMENAZA: Calcula un porcentaje (0-100) de peligro actual basado en la posición de los enemigos y objetivos.
      10. POWER SPIKE: Indica en qué momento del juego el campeón del jugador es más fuerte en esta partida (Early, Mid o Late Game).
      11. PROBABILIDAD DE VICTORIA: Estima un porcentaje (0-100) de probabilidad de ganar la partida basado en el estado actual.
      12. ANÁLISIS DE COMPOSICIÓN: Breve descripción de la sinergia del equipo vs el equipo enemigo.

      IMPORTANTE: Los nombres de los objetos DEBEN ser los nombres exactos en INGLÉS (ej. "Infinity Edge", "Kraken Slayer", "Zhonya's Hourglass").`;

      const contents: any[] = [{ parts: [{ text: prompt }] }];
      if (base64Image) {
        contents[0].parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
      }

      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              gameMode: { type: Type.STRING },
              gamePhase: { type: Type.STRING },
              playerChampion: { type: Type.STRING },
              enemyTeam: { type: Type.ARRAY, items: { type: Type.STRING } },
              primaryThreat: { type: Type.STRING },
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
              strategy: { type: Type.STRING },
              plays: { type: Type.ARRAY, items: { type: Type.STRING } },
              alerts: { type: Type.ARRAY, items: { type: Type.STRING } },
              objectives: { type: Type.STRING },
              minimapAnalysis: { type: Type.STRING },
              jungleTracking: { type: Type.STRING },
              objectiveTimers: { type: Type.STRING },
              threatLevel: { type: Type.NUMBER },
              powerSpike: { type: Type.STRING },
              winProbability: { type: Type.NUMBER },
              teamComp: { type: Type.STRING }
            },
            required: [
              "gameMode", "gamePhase", "playerChampion", "enemyTeam", "primaryThreat", 
              "items", "strategy", "plays", "alerts", "objectives", "minimapAnalysis", 
              "jungleTracking", "objectiveTimers", "threatLevel", "powerSpike", 
              "winProbability", "teamComp"
            ]
          },
          temperature: 0.1,
          systemInstruction: "Eres un analista de League of Legends de nivel Challenger. Tu análisis es puramente táctico y basado en datos."
        }
      });

      const text = response.text;
      if (!text || text.trim() === "") {
        throw new Error("La IA no devolvió datos. Intenta de nuevo.");
      }

      // Clean JSON from potential markdown or trailing commas
      const cleanJson = (str: string) => {
        let cleaned = str.replace(/```json\n?|```/g, "").trim();
        // Remove trailing commas in arrays and objects
        cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
        return cleaned;
      };

      const result = JSON.parse(cleanJson(text));
      if (!result || Object.keys(result).length === 0) {
        throw new Error("Respuesta de IA inválida.");
      }

      const newAnalysis = {
        ...result,
        timestamp: Date.now()
      };
      
      setAnalysis(newAnalysis);
      setLastAnalysisTime(Date.now());
      setHistory(prev => [newAnalysis, ...prev].slice(0, 15));

      // Update session stats
      setSessionStats(prev => ({
        totalAnalyses: prev.totalAnalyses + 1,
        alertsDetected: prev.alertsDetected + (newAnalysis.alerts?.length || 0),
        objectivesNoted: prev.objectivesNoted + (newAnalysis.objectives ? 1 : 0),
        threatAverage: Math.round((prev.threatAverage * prev.totalAnalyses + (newAnalysis.threatLevel || 0)) / (prev.totalAnalyses + 1))
      }));
    } catch (err: any) {
      console.error("Analysis error:", err);
      // Only show error if it's not a common transient issue
      if (!err.message?.includes("fetch")) {
        setError(`ERROR DE ANÁLISIS: ${err.message || "Error desconocido"}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update PiP Canvas
  useEffect(() => {
    if (!isPipActive || !pipCanvasRef.current) return;

    const renderPip = () => {
      const canvas = pipCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear with dark background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Border for the HUD
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

      // Header
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 20px "Inter", sans-serif';
      ctx.fillText('HEXVISION TACTICAL', 20, 40);

      // Status Indicator
      ctx.fillStyle = isAnalyzing ? '#06b6d4' : '#22c55e';
      ctx.beginPath();
      ctx.arc(canvas.width - 30, 35, 8, 0, Math.PI * 2);
      ctx.fill();

      if (!analysis) {
        ctx.fillStyle = '#71717a';
        ctx.font = 'bold 24px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESPERANDO ANÁLISIS...', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
      } else {
        // Champion Info
        if (analysis.playerChampion) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px "Inter", sans-serif';
          ctx.fillText(analysis.playerChampion, 20, 80);
        }

        // Alerts Section
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 18px "Inter", sans-serif';
        ctx.fillText('ALERTAS CRÍTICAS:', 20, 120);

        ctx.fillStyle = '#fdba74';
        ctx.font = '16px "Inter", sans-serif';
        const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];
        if (alerts.length === 0) {
          ctx.fillStyle = '#22c55e';
          ctx.fillText('• No hay amenazas inmediatas', 30, 150);
        } else {
          alerts.slice(0, 3).forEach((alert, i) => {
            ctx.fillText(`• ${alert}`, 30, 150 + (i * 25));
          });
        }

        // Strategy / Tips
        if (analysis.strategy) {
          ctx.fillStyle = '#22d3ee';
          ctx.font = 'italic 14px "Inter", sans-serif';
          const strategyText = analysis.strategy.length > 50 ? analysis.strategy.substring(0, 47) + '...' : analysis.strategy;
          ctx.fillText(strategyText, 20, 260);
        }
      }

      if (isPipActive) requestAnimationFrame(renderPip);
    };

    renderPip();
  }, [isPipActive, analysis]);

  const togglePip = async () => {
    try {
      if (!isPipActive) {
        let isTopLevel = true;
        try {
          isTopLevel = window === window.top;
        } catch (e) {
          isTopLevel = false;
        }

        if (!isTopLevel && 'documentPictureInPicture' in window) {
          setError("Aviso: Estás usando la versión básica del Overlay. Para usar el Overlay Avanzado, abre la aplicación en una nueva pestaña.");
        }

        // Try Document Picture-in-Picture API first (Chrome 116+)
        if ('documentPictureInPicture' in window && isTopLevel) {
          const dpip = await (window as any).documentPictureInPicture.requestWindow({
            width: 400,
            height: 300,
          });

          // Copy styles
          [...document.styleSheets].forEach((styleSheet) => {
            try {
              const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
              const style = document.createElement('style');
              style.textContent = cssRules;
              dpip.document.head.appendChild(style);
            } catch (e) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.type = styleSheet.type;
              link.media = styleSheet.media.mediaText;
              link.href = styleSheet.href!;
              dpip.document.head.appendChild(link);
            }
          });

          // Add Tailwind base styles manually just in case
          const tailwindStyle = document.createElement('style');
          tailwindStyle.textContent = `
            body { background-color: #09090b; color: white; font-family: system-ui, sans-serif; margin: 0; padding: 0; }
          `;
          dpip.document.head.appendChild(tailwindStyle);

          // Create a container
          const container = document.createElement('div');
          container.id = 'pip-root';
          container.className = 'w-full h-full bg-zinc-950 text-white overflow-hidden';
          dpip.document.body.appendChild(container);

          setPipWindow(dpip);
          setIsPipActive(true);
          setShowPipWarning(true);
          setTimeout(() => setShowPipWarning(false), 8000);

          dpip.addEventListener('pagehide', () => {
            setIsPipActive(false);
            setPipWindow(null);
            setShowPipWarning(false);
          }, { once: true });

          return;
        }

        // Fallback to Video PiP
        if (!pipVideoRef.current || !pipCanvasRef.current) return;
        
        const stream = pipCanvasRef.current.captureStream(30);
        pipVideoRef.current.srcObject = stream;
        
        // Wait for metadata to be loaded before playing and requesting PiP
        await new Promise((resolve) => {
          if (pipVideoRef.current) {
            pipVideoRef.current.onloadedmetadata = resolve;
          }
        });

        try {
          await pipVideoRef.current.play();
        } catch (playError: any) {
          // Ignore AbortError which happens when play() is interrupted by a new load
          if (playError.name !== 'AbortError') {
            console.warn("PiP Play warning:", playError);
          }
        }

        await pipVideoRef.current.requestPictureInPicture();
        setIsPipActive(true);
        setShowPipWarning(true);
        setTimeout(() => setShowPipWarning(false), 8000); // Hide warning after 8 seconds
        
        pipVideoRef.current.addEventListener('leavepictureinpicture', () => {
          setIsPipActive(false);
          setShowPipWarning(false);
        }, { once: true });
      } else {
        if (pipWindow) {
          pipWindow.close();
          setPipWindow(null);
        } else if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
        setIsPipActive(false);
      }
    } catch (err) {
      // Only log as error if it's not an AbortError
      if (err instanceof Error && err.name === 'AbortError') return;
      
      console.error("PiP Error:", err);
      setError("Tu navegador no soporta el modo Overlay (PiP) o la ventana se cerró inesperadamente.");
    }
  };

  const startAnalysisLoop = () => {
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    analyzeGame();
    // Optimize interval: 90 seconds in performance mode, 45 seconds normally
    const interval = performanceMode ? 90000 : 45000;
    analysisIntervalRef.current = setInterval(analyzeGame, interval);
  };

  useEffect(() => {
    if (isStreaming && autoMode) {
      startAnalysisLoop();
    } else {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    }
  }, [autoMode, isStreaming, performanceMode]);

  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <div className="h-screen bg-[#030305] text-zinc-100 font-sans selection:bg-cyan-500/30 flex flex-col overflow-hidden">
      {/* Animated Background Gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_-20%,#0f172a,transparent)] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl z-50 flex-shrink-0 sticky top-0">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 min-h-16 py-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <div className="relative w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center border border-white/10">
                <Target className="text-cyan-400 w-6 h-6" />
              </div>
            </div>
            <div>
              <h1 className="font-black text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                HEX<span className="text-cyan-500">VISION</span>
              </h1>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 md:gap-6">
            {/* Privacy Mode Toggle */}
            <button 
              onClick={() => setPrivacyMode(!privacyMode)}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full border transition-all text-[10px] md:text-xs font-black uppercase tracking-widest ${privacyMode ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
            >
              {privacyMode ? <EyeOff className="w-3 h-3 md:w-4 md:h-4" /> : <Eye className="w-3 h-3 md:w-4 md:h-4" />}
              <span className="hidden sm:inline">{privacyMode ? "Privacidad" : "Preview"}</span>
            </button>

            {/* Performance Mode Toggle */}
            <button 
              onClick={() => setPerformanceMode(!performanceMode)}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full border transition-all text-[10px] md:text-xs font-black uppercase tracking-widest ${performanceMode ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
            >
              <Zap className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{performanceMode ? "Rendimiento" : "Calidad"}</span>
            </button>

            {/* Overlay Mode Toggle */}
            <button 
              onClick={togglePip}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full border transition-all text-[10px] md:text-xs font-black uppercase tracking-widest ${isPipActive ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:text-zinc-300'}`}
            >
              <ExternalLink className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{isPipActive ? "Cerrar Overlay" : "Modo Overlay"}</span>
            </button>

            {/* Settings Toggle */}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full border border-white/5 bg-zinc-900 text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/30 transition-all text-[10px] md:text-xs font-black uppercase tracking-widest"
            >
              <Settings className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Ajustes</span>
            </button>

            <div className="hidden md:flex items-center gap-4 px-4 py-1.5 bg-zinc-900/50 rounded-full border border-white/5">
              <RefreshCw className={`w-4 h-4 ${autoMode ? 'text-cyan-400 animate-spin-slow' : 'text-zinc-600'}`} />
              <button 
                onClick={() => setAutoMode(!autoMode)}
                className={`w-10 h-5 rounded-full relative transition-colors ${autoMode ? 'bg-cyan-600' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${autoMode ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            {isStreaming ? (
              <button 
                onClick={stopScreenShare}
                className="flex items-center gap-2 px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg transition-all text-xs font-bold"
              >
                <Square className="w-4 h-4 fill-current" />
                OFF
              </button>
            ) : (
              <button 
                onClick={startScreenShare}
                className="relative flex items-center gap-2 px-8 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all text-xs font-black shadow-lg shadow-cyan-500/20"
              >
                ENLAZAR
              </button>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-[1600px] mx-auto px-6 mt-6"
          >
            <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 backdrop-blur-xl shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-black text-sm uppercase tracking-widest text-red-400">Error de Detección</h3>
                    <p className="text-sm text-red-200/80 leading-relaxed max-w-3xl">{error}</p>
                    
                    <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block">Solución 1</span>
                        <p className="text-[9px] text-zinc-300">Asegúrate de compartir la ventana <b>"League of Legends (TM) Client"</b> (la partida), no el launcher.</p>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block">Solución 2</span>
                        <p className="text-[9px] text-zinc-300">Cambia el modo de video en LoL a <b>"Ventana sin bordes"</b> si ves una pantalla negra.</p>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1 md:col-span-2">
                        <span className="text-[8px] font-black text-cyan-500 uppercase block">Tip de Navegador</span>
                        <p className="text-[9px] text-zinc-300">Si el navegador no te pregunta, haz clic en el icono de la cámara/pantalla en la <b>barra de direcciones</b> para restablecer los permisos.</p>
                      </div>
                      {error.includes("PERMISO DENEGADO") && (
                        <div className="md:col-span-2">
                          <button 
                            onClick={startScreenShare}
                            className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-red-500/30 transition-all"
                          >
                            Intentar de nuevo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 rotate-45" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-2 grid grid-cols-1 xl:grid-cols-12 gap-2 overflow-hidden">
        
        {/* PiP Warning Banner */}
        <AnimatePresence>
          {showPipWarning && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="col-span-full mb-2 p-4 bg-cyan-900/40 border border-cyan-500/50 rounded-xl flex items-start gap-4 backdrop-blur-md z-50"
            >
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-cyan-400 font-black uppercase tracking-widest text-sm mb-1">Modo Overlay Activado</h3>
                <p className="text-zinc-300 text-xs">
                  Para ver el overlay <strong className="text-white">encima de tu partida</strong>, debes configurar League of Legends en modo <strong className="text-cyan-300">"Ventana sin bordes"</strong> (Borderless Window) en los ajustes de video del juego. Si juegas en "Pantalla Completa", el juego ocultará el overlay.
                </p>
              </div>
              <button onClick={() => setShowPipWarning(false)} className="ml-auto text-zinc-500 hover:text-white">
                <Square className="w-4 h-4 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSettingsOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Configuración del Sistema</h2>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500"
                  >
                    <Square className="w-4 h-4 rotate-45" />
                  </button>
                </div>

                <div className="p-6 space-y-8">
                  {/* Riot API Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-cyan-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Riot Games API</h3>
                    </div>
                    <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">API Key (RGAPI-...)</label>
                        <div className="relative">
                          <input 
                            type="password"
                            value={localRiotKey}
                            onChange={(e) => setLocalRiotKey(e.target.value)}
                            placeholder="Pega tu clave aquí..."
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 text-xs font-bold text-white placeholder:text-zinc-700 focus:border-cyan-500/50 outline-none transition-all"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Shield className={`w-4 h-4 ${localRiotKey ? 'text-green-500' : 'text-zinc-700'}`} />
                          </div>
                        </div>
                        <p className="text-[9px] text-zinc-500 leading-relaxed">
                          Esta clave se guardará localmente en tu navegador. Si no la proporcionas, el sistema intentará usar la clave configurada en el servidor.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <p className="text-[9px] text-cyan-200/70">
                          Las claves de desarrollo expiran cada 24 horas. Asegúrate de renovarla en el <a href="https://developer.riotgames.com/" target="_blank" rel="noreferrer" className="text-cyan-400 underline">Riot Developer Portal</a>.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Visual Preferences */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-cyan-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Preferencias Visuales</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className={`p-4 rounded-xl border transition-all text-left space-y-2 ${privacyMode ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-black/40 border-white/5'}`}
                      >
                        <div className="flex items-center justify-between">
                          <Shield className={`w-4 h-4 ${privacyMode ? 'text-cyan-400' : 'text-zinc-600'}`} />
                          <div className={`w-2 h-2 rounded-full ${privacyMode ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-800'}`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">Modo Privacidad</p>
                          <p className="text-[9px] text-zinc-500">Oculta el feed de video real.</p>
                        </div>
                      </button>

                      <button 
                        onClick={() => setPerformanceMode(!performanceMode)}
                        className={`p-4 rounded-xl border transition-all text-left space-y-2 ${performanceMode ? 'bg-orange-500/10 border-orange-500/30' : 'bg-black/40 border-white/5'}`}
                      >
                        <div className="flex items-center justify-between">
                          <Zap className={`w-4 h-4 ${performanceMode ? 'text-orange-400' : 'text-zinc-600'}`} />
                          <div className={`w-2 h-2 rounded-full ${performanceMode ? 'bg-orange-400 animate-pulse' : 'bg-zinc-800'}`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">Alto Rendimiento</p>
                          <p className="text-[9px] text-zinc-500">Optimiza el uso de CPU/GPU.</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-white/5 border-t border-white/5 flex justify-end">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                  >
                    Guardar y Cerrar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Left Column: Visual Status & Controls */}
        <div className="xl:col-span-4 flex flex-col gap-2 h-full overflow-hidden">
          {/* Main Viewport / Status Card */}
          <div className="relative h-[220px] bg-zinc-950 rounded-xl border border-white/5 overflow-hidden shadow-2xl flex-shrink-0 will-change-transform">
            {/* Always have the video element for capture, but hide it visually if privacyMode is on */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className={`w-full h-full object-contain transition-opacity duration-700 ${!privacyMode && isStreaming ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
              style={{ 
                visibility: 'visible',
                imageRendering: 'pixelated' // Faster rendering for preview
              }}
            />

            {/* Scanning Overlay Effect */}
            {isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 pointer-events-none z-30"
              >
                <div className="absolute inset-0 bg-cyan-500/5" />
                <motion.div 
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-[2px] bg-cyan-400 shadow-[0_0_15px_cyan] opacity-50"
                />
              </motion.div>
            )}

            {privacyMode && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/60 backdrop-blur-sm">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse" />
                  <Shield className="w-12 h-12 text-cyan-500 relative z-10" />
                  {isAnalyzing && (
                    <motion.div 
                      animate={{ 
                        top: ["-10%", "110%", "-10%"],
                        opacity: [0, 1, 0]
                      }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-[-40px] right-[-40px] h-[3px] bg-cyan-400 shadow-[0_0_20px_cyan] z-20"
                    />
                  )}
                </div>
                <h3 className="text-sm font-black text-white tracking-[0.3em] uppercase mb-2">Neural Link Active</h3>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" />
                  <p className="text-cyan-400 text-xs font-black uppercase tracking-widest">
                    Procesando Flujo Táctico
                  </p>
                </div>
                
                {isStreaming && (
                  <div className="mt-4 flex items-center gap-4 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                    {analysis?.playerChampion && (
                      <img 
                        src={getChampionIcon(analysis.playerChampion) || ""} 
                        alt={analysis.playerChampion}
                        className="w-10 h-10 rounded border border-orange-500/50"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    <div className="text-left">
                      <span className="text-sm font-black text-white leading-none block">{analysis?.playerChampion || champion || "..."}</span>
                      <span className="text-xs font-bold text-cyan-400 leading-none uppercase">{analysis?.gameMode || "..."}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <AnimatePresence>
              {isAnalyzing ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-xl border border-cyan-500/30 rounded-lg text-xs font-black uppercase tracking-widest text-cyan-400 shadow-2xl"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sync
                </motion.div>
              ) : isStreaming && (
                <motion.button 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={analyzeGame}
                  className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-cyan-500/20 z-10"
                >
                  <RefreshCw className="w-3 h-3" />
                  Analizar Ahora
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Scrollable area for the rest of left column */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {/* Combined Enemy & Alerts Panel */}
            <div className="p-4 bg-zinc-900/30 border border-white/5 rounded-xl backdrop-blur-sm flex flex-col gap-4 flex-shrink-0">
            {!isStreaming && (
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl mb-2 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <Monitor className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-xs text-cyan-300 font-black uppercase tracking-widest">Paso 1: Enlazar Partida</p>
                    <p className="text-[10px] text-cyan-200/70 leading-tight mt-1">
                      Comparte la ventana <span className="text-white underline">League of Legends (TM) Client</span> o tu <span className="text-white underline">Pantalla Completa</span>.
                    </p>
                    <p className="text-[8px] text-cyan-400/60 mt-1 uppercase font-black">Tip: Usa "Ventana sin bordes" en el juego.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={startScreenShare}
                    className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                  >
                    Comenzar Reconocimiento Visual
                  </button>
                  {activeGame && (
                    <button 
                      onClick={() => analyzeGame(true)}
                      className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Database className="w-3 h-3" />
                      Analizar solo con Datos API
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Enemigos</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(analysis?.enemyTeam) && analysis.enemyTeam.length > 0 ? (
                    analysis.enemyTeam.map((enemy, i) => {
                      const isThreat = analysis.primaryThreat && (
                        enemy.toLowerCase().includes(analysis.primaryThreat.toLowerCase()) || 
                        analysis.primaryThreat.toLowerCase().includes(enemy.toLowerCase())
                      );
                      return (
                        <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${isThreat ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-black/40 border-white/5'}`}>
                          <div className="relative">
                            <img 
                              src={getChampionIcon(enemy) || ""} 
                              alt={enemy}
                              className={`w-5 h-5 rounded-sm border ${isThreat ? 'border-red-400' : 'border-white/10'}`}
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                            {isThreat && (
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                            )}
                          </div>
                          <span className={`text-sm font-bold ${isThreat ? 'text-red-400' : 'text-zinc-300'}`}>{enemy}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-zinc-600 italic">...</p>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Alertas</h3>
                </div>
                <div className="space-y-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                  {Array.isArray(analysis?.alerts) && analysis.alerts.length > 0 ? (
                    analysis.alerts.map((alert, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                        <span className="text-xs font-bold text-orange-200 leading-tight truncate">{alert}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-600 italic">...</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings & History Grid */}
          <div className="grid grid-cols-1 gap-4 flex-1 min-h-0">
            <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-xl backdrop-blur-xl flex flex-col gap-4">
              <div className="flex items-center gap-2 text-zinc-500">
                <Settings className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-widest">Config</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Tu Campeón</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Yasuo"
                    value={champion}
                    onChange={(e) => setChampion(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Tu Rol</label>
                  <select 
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm focus:border-cyan-500/50 outline-none transition-colors text-zinc-400 appearance-none"
                  >
                    <option value="">Auto</option>
                    <option value="Top">Top</option>
                    <option value="Jungle">Jungle</option>
                    <option value="Mid">Mid</option>
                    <option value="ADC">ADC</option>
                    <option value="Support">Sup</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Enemigos (Manual Override)</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {manualEnemyTeam.map((enemy, i) => (
                    <input 
                      key={i}
                      type="text" 
                      placeholder={`Enemigo ${i+1}`}
                      value={enemy}
                      onChange={(e) => {
                        const newEnemies = [...manualEnemyTeam];
                        newEnemies[i] = e.target.value;
                        setManualEnemyTeam(newEnemies);
                      }}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] focus:border-red-500/50 outline-none transition-colors text-zinc-300"
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-8 h-4 rounded-full border border-white/10 relative transition-colors ${debugMode ? 'bg-cyan-500/20' : 'bg-black/40'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${debugMode ? 'left-4.5 bg-cyan-400' : 'left-0.5 bg-zinc-600'}`} />
                    </div>
                    <input type="checkbox" className="hidden" checked={debugMode} onChange={() => setDebugMode(!debugMode)} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">Debug</span>
                  </label>
                </div>
                {debugMode && debugImage && (
                  <div className="mt-2 border border-cyan-500/30 rounded overflow-hidden bg-black">
                    <img src={debugImage} alt="Debug Capture" className="w-full h-auto opacity-80" />
                    <div className="p-1 bg-cyan-500/20 text-[8px] text-cyan-300 font-bold text-center uppercase">
                      Lo que ve la IA
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Riot Account Connection */}
            <div id="riot-connection-panel" className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 backdrop-blur-xl space-y-4 min-h-[160px]">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Vincular Cuenta (Riot API)</h3>
              </div>
              
              {!summonerData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select 
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="sm:col-span-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[10px] font-bold text-white focus:border-cyan-500/50 outline-none"
                    >
                      <option value="la1">LAN</option>
                      <option value="la2">LAS</option>
                      <option value="br1">BR</option>
                      <option value="na1">NA</option>
                      <option value="euw1">EUW</option>
                      <option value="eun1">EUNE</option>
                      <option value="kr">KR</option>
                      <option value="jp1">JP</option>
                      <option value="oc1">OCE</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Invocador o enlace OP.GG"
                      value={summonerName}
                      onChange={handleSummonerNameChange}
                      className="sm:col-span-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white placeholder:text-zinc-700 focus:border-cyan-500/50 outline-none"
                    />
                  </div>
                  <button 
                    onClick={connectRiotAccount}
                    disabled={isConnectingRiot || !summonerName}
                    className="w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-[10px] font-black text-cyan-400 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    {isConnectingRiot ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Vincular Cuenta
                  </button>
                  {riotError && <p className="text-[10px] text-red-400 font-bold text-center">{riotError}</p>}
                  {configStatus && !configStatus.riotKeyConfigured && !localRiotKey && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-[9px] text-amber-400 font-bold leading-tight">
                        ⚠️ RIOT_API_KEY no configurada en el servidor. 
                        Configúrala en el menú de Ajustes (esquina superior derecha) para que funcione en esta pestaña.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-2 bg-black/40 border border-white/5 rounded-lg">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden border border-white/10">
                      <img 
                        src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${summonerData.profileIconId}.png`} 
                        alt="Icon"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white truncate">{summonerData.name}</p>
                      <p className="text-[10px] font-bold text-zinc-500">Nivel {summonerData.summonerLevel}</p>
                    </div>
                    <button 
                      onClick={() => { setSummonerData(null); setLeagueData(null); setActiveGame(null); }}
                      className="p-1.5 hover:bg-white/5 rounded-md text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {leagueData && leagueData.length > 0 && (
                    <div className="p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                          {leagueData[0].tier} {leagueData[0].rank}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400">{leagueData[0].leaguePoints} LP</span>
                    </div>
                  )}

                  {activeGame ? (
                    <div className="p-2 bg-green-500/5 border border-green-500/20 rounded-lg flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">En Partida: {activeGame.gameMode}</span>
                    </div>
                  ) : (
                    <button 
                      onClick={connectRiotAccount}
                      className="w-full py-1.5 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 rounded-lg text-[9px] font-black text-zinc-500 uppercase tracking-widest transition-all"
                    >
                      Verificar Partida
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-xl backdrop-blur-xl flex flex-col min-h-[250px]">
              <div className="flex items-center gap-2 text-zinc-500 mb-3">
                <History className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-widest">History</span>
              </div>
              <div className="space-y-2 overflow-y-auto custom-scrollbar min-h-[150px] max-h-[400px]">
                {history.length > 0 ? (
                  history.map((h, i) => (
                    <button 
                      key={i}
                      onClick={() => setAnalysis(h)}
                      className="w-full flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg hover:border-cyan-500/30 transition-colors text-left"
                    >
                      <span className="text-sm font-bold text-zinc-300 truncate max-w-[120px]">{h.playerChampion}</span>
                      <span className="text-xs text-zinc-600 font-mono">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-zinc-600 italic text-center">...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Tactical Intelligence (Main Focus) */}
        <div className="xl:col-span-8 flex flex-col gap-2 h-full overflow-hidden">
          {/* Intelligence Feed */}
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden backdrop-blur-xl flex flex-col h-full">
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-cyan-400" />
                <h2 className="font-black text-sm uppercase tracking-widest">Intelligence</h2>
                {!summonerData && (
                  <button 
                    onClick={() => {
                      const el = document.getElementById('riot-connection-panel');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hidden md:flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-[8px] font-black text-cyan-400 uppercase tracking-widest transition-all"
                  >
                    <Users className="w-2.5 h-2.5" />
                    Vincular Riot
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                {isAnalyzing && (
                  <div className="flex items-center gap-2 px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-md">
                    <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                    <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest animate-pulse">Analizando...</span>
                  </div>
                )}
                {lastAnalysisTime && (
                  <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">
                    {new Date(lastAnalysisTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                {activeGame && !isStreaming && (
                  <button 
                    onClick={() => analyzeGame(true)}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-[10px] font-black text-purple-400 uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Database className="w-3 h-3" />
                    Analizar con API
                  </button>
                )}
                <button 
                  onClick={() => analyzeGame(false)}
                  disabled={isAnalyzing || (!isStreaming && !manualEnemyTeam.some(e => e))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    isAnalyzing 
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                      : (isStreaming && activeGame)
                        ? 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 border-white/20 text-white shadow-lg shadow-purple-500/20'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border-white/10'
                  }`}
                >
                  {isStreaming && activeGame ? (
                    <>
                      <Zap className={`w-4 h-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Análisis Doble</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Analizar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Tactical Advice Section */}
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.05)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                    <Target className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Estrategia Inmediata</h3>
                  </div>
                </div>
                <p className="text-base font-black text-white leading-tight mb-3">
                  {analysis?.strategy || "Esperando datos de la partida..."}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                    <span className="text-[7px] font-black text-zinc-500 uppercase block mb-0.5">Prioridad de Objetivo</span>
                    <p className="text-[10px] font-bold text-cyan-200">{analysis?.objectives || "..."}</p>
                  </div>
                  <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                    <span className="text-[7px] font-black text-zinc-500 uppercase block mb-0.5">Amenaza Principal</span>
                    <p className="text-[10px] font-bold text-red-400">{analysis?.primaryThreat || "..."}</p>
                  </div>
                </div>
              </div>

              {/* Session Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                <div className="p-2 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between">
                  <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Fase de Partida</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-2.5 h-2.5 text-cyan-400" />
                    <span className="text-xs font-black text-white">{analysis?.gamePhase || "Detectando..."}</span>
                  </div>
                </div>
                <div className="p-2 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between">
                  <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Prob. Victoria</span>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-2.5 h-2.5 text-green-400" />
                    <span className="text-xs font-black text-white">{analysis?.winProbability ?? "--"}%</span>
                  </div>
                </div>
                <div className="p-2 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between">
                  <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Nivel de Amenaza</span>
                  <div className="flex items-center gap-1.5">
                    <Shield className={`w-2.5 h-2.5 ${analysis?.threatLevel && analysis.threatLevel > 60 ? 'text-red-400' : 'text-cyan-400'}`} />
                    <span className="text-xs font-black text-white">{analysis?.threatLevel ?? "--"}%</span>
                  </div>
                </div>
                <div className="p-2 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between">
                  <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Power Spike</span>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-2.5 h-2.5 text-orange-400" />
                    <span className="text-xs font-black text-white">{analysis?.powerSpike || "..."}</span>
                  </div>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {!analysis ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-20">
                    <Eye className="w-10 h-10" />
                    <p className="text-xs font-black uppercase tracking-widest">Waiting Data</p>
                  </div>
                ) : (
                  <motion.div 
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {/* Threat, Win Prob & Power Spike */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="p-3 bg-zinc-950/40 rounded-xl border border-white/5 space-y-1 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-red-500/20" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-red-400">
                            <AlertCircle className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Amenaza</span>
                          </div>
                          <span className="text-[10px] font-black text-red-400">{analysis.threatLevel}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${analysis.threatLevel}%` }}
                            className={`h-full ${analysis.threatLevel > 70 ? 'bg-red-500' : analysis.threatLevel > 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-zinc-950/40 rounded-xl border border-white/5 space-y-1 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/20" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-cyan-400">
                            <Trophy className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Victoria</span>
                          </div>
                          <span className="text-[10px] font-black text-cyan-400">{analysis.winProbability}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${analysis.winProbability}%` }}
                            className={`h-full ${analysis.winProbability > 60 ? 'bg-cyan-500' : analysis.winProbability > 40 ? 'bg-blue-500' : 'bg-zinc-700'}`}
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-zinc-950/40 rounded-xl border border-white/5 flex items-center justify-between relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/20" />
                        <div className="flex items-center gap-1.5 text-purple-400">
                          <TrendingUp className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Spike</span>
                        </div>
                        <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 rounded-full text-[9px] font-black text-purple-400 uppercase tracking-widest truncate max-w-[80px]">
                          {analysis.powerSpike}
                        </span>
                      </div>
                    </div>

                    {/* Strategy, Build Path & Team Comp */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="md:col-span-1 p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50" />
                        <div className="flex items-center gap-1.5 text-cyan-400 mb-1">
                          <Target className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Win Condition</span>
                        </div>
                        <p className="text-[11px] text-zinc-100 font-bold leading-tight italic">
                          {analysis.strategy}
                        </p>
                      </div>

                      <div className="md:col-span-2 p-3 bg-zinc-950/40 rounded-xl border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-orange-400">
                            <Sword className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Build Path</span>
                          </div>
                          <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest">Next</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(analysis.items) && analysis.items.length > 0 ? (
                            analysis.items.map((item, i) => (
                              <div key={i} className="group relative flex flex-col items-center gap-0.5">
                                <div className="p-0.5 bg-black/60 border border-white/10 rounded group-hover:border-orange-500/50 transition-all shadow-xl">
                                  {getItemIcon(item) ? (
                                    <img src={getItemIcon(item)!} alt={item} className="w-8 h-8 rounded" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-8 h-8 flex items-center justify-center bg-zinc-900 rounded">
                                      <Zap className="w-4 h-4 text-zinc-700" />
                                    </div>
                                  )}
                                </div>
                                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-tighter max-w-[50px] text-center truncate">{item}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-[10px] text-zinc-600 italic">No items detected...</p>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-1 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/50" />
                        <div className="flex items-center gap-1.5 text-purple-400 mb-1">
                          <Users className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Composición</span>
                        </div>
                        <p className="text-[10px] text-zinc-300 font-medium leading-tight">
                          {analysis.teamComp}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {/* Minimap Card */}
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2 relative overflow-hidden">
                        {analysis.gameMode?.toLowerCase().includes('launcher') && (
                          <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-20">
                            <AlertCircle className="w-6 h-6 text-orange-400 mb-1" />
                            <p className="text-[8px] text-orange-300 font-black uppercase text-center leading-tight">
                              ESTÁS COMPARTIENDO EL LAUNCHER. <br/>
                              CAMBIA A LA VENTANA "LEAGUE OF LEGENDS (TM) CLIENT".
                            </p>
                          </div>
                        )}
                        {(!analysis.playerChampion || analysis.playerChampion.toLowerCase().includes('unknown')) && !analysis.gameMode?.toLowerCase().includes('launcher') && (
                          <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[1px] flex items-center justify-center p-4 z-10">
                            <p className="text-[8px] text-red-400 font-black uppercase text-center leading-tight">
                              Detección baja. Asegúrate de que el juego esté en primer plano.
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <Eye className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Minimap</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <span className="text-[7px] font-black text-zinc-600 uppercase block mb-0.5">Positions</span>
                            <p className="text-xs text-zinc-300 leading-tight">{analysis.minimapAnalysis}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[7px] font-black text-zinc-600 uppercase block mb-0.5">Jungle</span>
                              <p className="text-xs text-zinc-300 leading-tight">{analysis.jungleTracking}</p>
                            </div>
                            <div>
                              <span className="text-[7px] font-black text-zinc-600 uppercase block mb-0.5">Objs</span>
                              <p className="text-xs text-zinc-300 leading-tight">{analysis.objectiveTimers}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Micro Card */}
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <Zap className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Micro & Plays</span>
                        </div>
                        <div className="space-y-1.5">
                          {Array.isArray(analysis.plays) && analysis.plays.map((play, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <div className="w-1 h-1 bg-cyan-500 rounded-full mt-1.5 flex-shrink-0" />
                              <p className="text-xs text-zinc-400 leading-tight">{play}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Document PiP Portal */}
      {pipWindow && pipWindow.document.getElementById('pip-root') && createPortal(
        <PipContent analysis={analysis} isAnalyzing={isAnalyzing} />,
        pipWindow.document.getElementById('pip-root')!
      )}

      {/* Hidden Canvas for Frame Capture */}
      <canvas ref={canvasRef} className="hidden" />

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
        .animate-spin-slow { animation: spin 4s linear infinite; }
      `}} />
      {/* Hidden elements for PiP - Using off-screen instead of hidden for captureStream reliability */}
      <div className="fixed -left-[2000px] -top-[2000px] pointer-events-none opacity-0">
        <canvas ref={pipCanvasRef} width={400} height={300} />
        <video ref={pipVideoRef} muted playsInline autoPlay />
      </div>
    </div>
  );
}
