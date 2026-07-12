import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '@/lib/telegram';
import AnimatedCanvas from '@/components/backgrounds/AnimatedCanvas';
import {
  Music, Play, Pause, Square, Download, Shuffle, Sliders,
  Volume2, ArrowLeft, Sparkles, Waves, Zap, Heart, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ── Genre & Mood data ──
const GENRES = [
  { id: 'lofi', label: 'Lo-Fi', icon: '🎵', color: 'hsl(200, 50%, 55%)' },
  { id: 'electronic', label: 'Electronic', icon: '⚡', color: 'hsl(280, 60%, 55%)' },
  { id: 'ambient', label: 'Ambient', icon: '🌊', color: 'hsl(190, 50%, 50%)' },
  { id: 'hip_hop', label: 'Hip-Hop', icon: '🎤', color: 'hsl(35, 80%, 55%)' },
  { id: 'cinematic', label: 'Cinematic', icon: '🎬', color: 'hsl(0, 0%, 60%)' },
  { id: 'jazz', label: 'Jazz', icon: '🎷', color: 'hsl(40, 60%, 50%)' },
  { id: 'rock', label: 'Rock', icon: '🎸', color: 'hsl(0, 60%, 50%)' },
  { id: 'classical', label: 'Classical', icon: '🎻', color: 'hsl(45, 30%, 50%)' },
];

const MOODS = [
  { id: 'chill', label: 'Chill', emoji: '😌' },
  { id: 'energetic', label: 'Energetic', emoji: '🔥' },
  { id: 'dark', label: 'Dark', emoji: '🌑' },
  { id: 'uplifting', label: 'Uplifting', emoji: '☀️' },
  { id: 'melancholic', label: 'Melancholic', emoji: '🌧️' },
  { id: 'aggressive', label: 'Aggressive', emoji: '💢' },
  { id: 'dreamy', label: 'Dreamy', emoji: '💫' },
  { id: 'mystical', label: 'Mystical', emoji: '🔮' },
];

interface MusicTrack {
  id: string;
  prompt: string;
  genre: string;
  moods: string[];
  bpm: number;
  bassIntensity: number;
  chaosLevel: number;
  status: 'generating' | 'ready' | 'error';
  audioUrl?: string;
  createdAt: number;
}

interface MusicLabProps {
  onBack: () => void;
}

export default function MusicLab({ onBack }: MusicLabProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['lofi']);
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['chill']);
  const [bpm, setBpm] = useState(90);
  const [bassIntensity, setBassIntensity] = useState(50);
  const [chaosLevel, setChaosLevel] = useState(20);
  const [customPrompt, setCustomPrompt] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  const toggleGenre = (id: string) => {
    haptic.selection();
    setSelectedGenres(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id].slice(-3)
    );
  };

  const toggleMood = (id: string) => {
    haptic.selection();
    setSelectedMoods(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id].slice(-3)
    );
  };

  const buildPrompt = useCallback(() => {
    const genreNames = selectedGenres.map(g => GENRES.find(x => x.id === g)?.label).filter(Boolean).join(' x ');
    const moodNames = selectedMoods.map(m => MOODS.find(x => x.id === m)?.label).filter(Boolean).join(', ');
    const parts = [
      genreNames && `${genreNames} fusion`,
      moodNames && `${moodNames} mood`,
      `${bpm} BPM`,
      bassIntensity > 70 ? 'heavy bass' : bassIntensity < 30 ? 'light bass' : '',
      chaosLevel > 60 ? 'experimental and chaotic' : chaosLevel < 20 ? 'clean and structured' : '',
      customPrompt,
    ].filter(Boolean);
    return parts.join(', ');
  }, [selectedGenres, selectedMoods, bpm, bassIntensity, chaosLevel, customPrompt]);

  const handleGenerate = async () => {
    haptic.heavy();
    setIsGenerating(true);
    const prompt = buildPrompt();
    const trackId = `track_${Date.now()}`;
    const newTrack: MusicTrack = {
      id: trackId,
      prompt,
      genre: selectedGenres.join('+'),
      moods: [...selectedMoods],
      bpm,
      bassIntensity,
      chaosLevel,
      status: 'generating',
      createdAt: Date.now(),
    };
    setTracks(prev => [newTrack, ...prev]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/music-generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ prompt, duration: 30 }),
        }
      );

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.status}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'ready' as const, audioUrl } : t));
      haptic.success();
      toast.success('Track generated!');
    } catch (err) {
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'error' as const } : t));
      toast.error('Music generation requires ElevenLabs integration. Architecture ready.');
    } finally {
      setIsGenerating(false);
    }
  };

  const playTrack = (track: MusicTrack) => {
    if (!track.audioUrl) return;
    haptic.medium();
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    audio.play();
    setPlayingId(track.id);
    audio.onended = () => setPlayingId(null);
  };

  // Visualizer
  useEffect(() => {
    if (!showVisualizer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const bars = 32;
      const barW = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const h = Math.abs(Math.sin(frame * 0.02 + i * 0.3)) * canvas.height * 0.7 * (playingId ? 1 : 0.2);
        const hue = (i / bars) * 120 + 150 + Math.sin(frame * 0.01) * 30;
        ctx.fillStyle = `hsla(${hue}, 70%, 55%, 0.8)`;
        ctx.fillRect(i * barW + 1, canvas.height - h, barW - 2, h);
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [showVisualizer, playingId]);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <AnimatedCanvas theme="aurora" className="opacity-30" />

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/30 flex items-center gap-3 relative z-10">
        <button onClick={onBack} className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <Music size={18} className="text-pink-400" /> Music Creation Lab
          </h1>
          <p className="text-[10px] text-muted-foreground">AI-powered music forge</p>
        </div>
        <button
          onClick={() => setShowVisualizer(!showVisualizer)}
          className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg ${showVisualizer ? 'bg-primary/20' : ''}`}
        >
          <Waves size={18} className={showVisualizer ? 'text-primary' : 'text-muted-foreground'} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 relative z-10">
        {/* Visualizer */}
        {showVisualizer && (
          <motion.div initial={{ height: 0 }} animate={{ height: 80 }} className="rounded-xl overflow-hidden border border-border/30">
            <canvas ref={canvasRef} className="w-full h-full" style={{ height: 80 }} />
          </motion.div>
        )}

        {/* Genre selection */}
        <div>
          <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1">
            <Zap size={12} /> Genre Fusion <span className="text-muted-foreground">(pick up to 3)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map(g => (
              <button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={`px-3 py-2 rounded-lg text-[11px] font-semibold min-h-[44px] transition-all border ${
                  selectedGenres.includes(g.id)
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/30 bg-muted/20 text-muted-foreground'
                }`}
              >
                {g.icon} {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mood stacking */}
        <div>
          <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1">
            <Heart size={12} /> Mood Stack <span className="text-muted-foreground">(pick up to 3)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map(m => (
              <button
                key={m.id}
                onClick={() => toggleMood(m.id)}
                className={`px-3 py-2 rounded-lg text-[11px] font-semibold min-h-[44px] transition-all border ${
                  selectedMoods.includes(m.id)
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/30 bg-muted/20 text-muted-foreground'
                }`}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-3 bg-card/60 rounded-xl border border-border/30 p-3">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">BPM</span>
              <span className="text-foreground font-mono">{bpm}</span>
            </div>
            <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(+e.target.value)}
              className="w-full h-2 rounded-full appearance-none bg-muted/40 accent-primary" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Bass Intensity</span>
              <span className="text-foreground font-mono">{bassIntensity}%</span>
            </div>
            <input type="range" min={0} max={100} value={bassIntensity} onChange={e => setBassIntensity(+e.target.value)}
              className="w-full h-2 rounded-full appearance-none bg-muted/40 accent-primary" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Chaos / Order</span>
              <span className="text-foreground font-mono">{chaosLevel < 30 ? 'Structured' : chaosLevel > 70 ? 'Chaotic' : 'Balanced'}</span>
            </div>
            <input type="range" min={0} max={100} value={chaosLevel} onChange={e => setChaosLevel(+e.target.value)}
              className="w-full h-2 rounded-full appearance-none bg-muted/40 accent-primary" />
          </div>
        </div>

        {/* Custom prompt */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Additional instructions (optional)</p>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="e.g. 'ethereal pads with vinyl crackle'"
            className="w-full h-16 rounded-lg bg-muted/30 border border-border/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none"
            maxLength={200}
          />
        </div>

        {/* Generate button */}
        <Button
          className="w-full min-h-[48px] text-sm font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || selectedGenres.length === 0}
        >
          {isGenerating ? (
            <><Sparkles size={16} className="mr-2 animate-spin" /> Summoning Music...</>
          ) : (
            <><Music size={16} className="mr-2" /> Generate Track</>
          )}
        </Button>

        {/* Prompt preview */}
        <div className="bg-muted/20 rounded-lg px-3 py-2">
          <p className="text-[9px] text-muted-foreground">Prompt preview:</p>
          <p className="text-[10px] text-foreground/70 italic mt-0.5">{buildPrompt() || 'Select genres and moods...'}</p>
        </div>

        {/* Track list */}
        {tracks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-foreground">Generated Tracks</p>
            {tracks.map(track => (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border/30 bg-card/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{track.genre.replace(/\+/g, ' × ')}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{track.prompt}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {track.status === 'generating' && (
                      <span className="text-[9px] text-amber-400 animate-pulse">Generating...</span>
                    )}
                    {track.status === 'error' && (
                      <span className="text-[9px] text-red-400">Architecture ready</span>
                    )}
                    {track.status === 'ready' && (
                      <>
                        <button onClick={() => playTrack(track)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                          {playingId === track.id ? <Pause size={16} className="text-primary" /> : <Play size={16} className="text-primary" />}
                        </button>
                        {track.audioUrl && (
                          <a href={track.audioUrl} download={`${track.genre}_${track.bpm}bpm.mp3`} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <Download size={14} className="text-muted-foreground" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="shrink-0 px-4 py-2 border-t border-border/20 relative z-10">
        <p className="text-[8px] text-muted-foreground/50 text-center">
          🎵 AI-generated music. Rights and usage depend on your subscription tier. Export for personal use.
        </p>
      </div>
    </div>
  );
}
