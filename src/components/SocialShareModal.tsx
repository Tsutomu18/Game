import React, { useState } from 'react';

export interface SharePayload {
  title: string;
  subtitle: string;
  score: number;
  floor: number;
  heroName: string;
  heroTitle: string;
  avatarColor: string;
}

interface SocialShareModalProps {
  payload: SharePayload | null;
  onClose: () => void;
  onShareToInGameChat: (message: string) => void;
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  payload,
  onClose,
  onShareToInGameChat,
}) => {
  const [copied, setCopied] = useState(false);
  const [postedToChat, setPostedToChat] = useState(false);

  if (!payload) return null;

  const shareText = `🏆 ${payload.title} in Abyssal Labyrinth! Held: ${payload.heroName} (${payload.heroTitle}) · Score: ${payload.score} · Ebene ${payload.floor} erreicht! #AbyssalLabyrinth #DungeonCrawler`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
    }
  };

  const handlePostToGameChat = () => {
    onShareToInGameChat(`🏆 [Erfolg geteilt] ${payload.title} — ${payload.subtitle} (Score: ${payload.score}, Ebene ${payload.floor})`);
    setPostedToChat(true);
    window.setTimeout(() => setPostedToChat(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Erfolg teilen"
    >
      <div className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-[#13111c] p-6 text-[#f3efe6] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Social-Share-Funktion</p>
            <h2 className="font-['Cinzel'] text-xl font-bold text-white">Erfolg & Fortschritt teilen</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        {/* Visual Share Card Preview */}
        <div
          className="mt-5 rounded-lg border border-amber-400/30 bg-[#1b1726] p-5"
          style={{ boxShadow: `inset 0 0 0 1px ${payload.avatarColor}33` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/20"
                style={{ backgroundColor: `${payload.avatarColor}26` }}
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
                  <path
                    d="M12 2L15 8L21 9L16.5 14L18 20L12 17L6 20L7.5 14L3 9L9 8L12 2Z"
                    fill={payload.avatarColor}
                    stroke="#fef08a"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs text-stone-400">
                  {payload.heroName} · {payload.heroTitle}
                </p>
                <h3 className="font-['Cinzel'] text-lg font-bold text-amber-300">{payload.title}</h3>
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <div className="text-xs text-stone-400">SCORE</div>
              <div className="text-lg font-bold text-white">{payload.score}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-stone-200">{payload.subtitle}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-stone-400 tabular-nums">
            <span>Abyssal Labyrinth: Relics of the Deep</span>
            <span>Tiefe: Ebene {payload.floor}</span>
          </div>
        </div>

        {/* Share Text Box */}
        <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-stone-300 font-mono">
          {shareText}
        </div>

        {/* Share Network Actions */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            {copied ? '✓ In Zwischenablage kopiert!' : 'Link & Share-Text kopieren'}
          </button>

          <button
            type="button"
            onClick={handlePostToGameChat}
            className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap"
          >
            {postedToChat ? '✓ Im In-Game-Chat geteilt!' : 'Direkt im In-Game-Chat teilen'}
          </button>
        </div>
      </div>
    </div>
  );
};
