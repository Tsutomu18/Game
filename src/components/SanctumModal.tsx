import React, { useState } from 'react';
import {
  SKILL_TREE,
  DAILY_AND_WEEKLY_QUESTS,
  ACHIEVEMENTS,
  SECRET_REWARDS,
  DAILY_LOGIN_REWARDS,
  type InventoryItem,
  type AvatarConfig,
  type NotificationItem,
} from '../game/gameData';
import { calculateLevelFromXp } from '../game/rules';
import type { SharePayload } from './SocialShareModal';

export type SanctumTab =
  | 'inventory'
  | 'skills_avatar'
  | 'challenges'
  | 'leaderboard'
  | 'dashboard_cloud'
  | 'chat_notifications';

export interface LeaderboardRow {
  id: string;
  playerName: string;
  avatarClass: string;
  avatarColor: string;
  titleBadge: string;
  score: number;
  floorReached: number;
  enemiesSlain: number;
  goldCollected: number;
  mode: 'standard' | 'daily' | 'weekly';
  isFriend?: boolean;
}

export interface ChatRow {
  id: string;
  senderName: string;
  senderTitle: string;
  avatarColor: string;
  channel: 'global' | 'gilde' | 'ereignisse';
  text: string;
  timeLabel: string;
}

interface SanctumModalProps {
  isOpen: boolean;
  activeTab: SanctumTab;
  onSelectTab: (tab: SanctumTab) => void;
  onClose: () => void;

  // Player Progression State
  xp: number;
  gold: number;
  skillPoints: number;
  highestFloor: number;
  totalScore: number;
  floorsCompleted: number;
  skillsUsedCount: number;
  chestsOpened: number;
  secretsFound: number;
  killsByArchetype: { swarmer: number; ranged: number; charger: number };

  // Inventory & Equipment
  inventory: InventoryItem[];
  equippedWeaponId: string;
  equippedArmorId: string;
  equippedRelicId: string;
  unlockedSecretIds: string[];
  onEquipItem: (item: InventoryItem) => void;
  onUseConsumable: (item: InventoryItem) => void;
  onUnlockSecretReward: (secretId: string) => void;

  // Skills & Avatar
  skillRanks: Record<string, number>;
  onUpgradeSkill: (skillId: string) => void;
  avatar: AvatarConfig;
  onUpdateAvatar: (next: AvatarConfig) => void;

  // Quests, Challenges, Weekly Event, Daily Login
  claimedQuestIds: string[];
  onClaimQuest: (questId: string) => void;
  dailyStreak: number;
  claimedLoginDays: number[];
  onClaimDailyLogin: (day: number) => void;
  onStartDailyChallenge: () => void;
  onStartWeeklyEventRun: () => void;

  // Leaderboard & Achievements
  leaderboard: LeaderboardRow[];
  unlockedAchievementIds: string[];
  onClaimAchievement: (achId: string) => void;
  onPublishScoreToCloud: () => void;
  onOpenShareModal: (payload: SharePayload) => void;

  // Cloud Save & Auth
  userDisplayName: string | null;
  isAuthenticated: boolean;
  cloudSyncStatus: string;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onSaveToCloud: () => void;
  onLoadFromCloud: () => void;

  // Chat & Notifications
  chatMessages: ChatRow[];
  onSendChatMessage: (channel: 'global' | 'gilde' | 'ereignisse', text: string) => void;
  notifications: NotificationItem[];
  onMarkNotificationsRead: () => void;
}

export const SanctumModal: React.FC<SanctumModalProps> = (props) => {
  const [leaderboardFilter, setLeaderboardFilter] = useState<'all' | 'friends' | 'weekly'>('all');
  const [chatChannel, setChatChannel] = useState<'global' | 'gilde' | 'ereignisse'>('global');
  const [chatInput, setChatInput] = useState('');

  if (!props.isOpen) return null;

  const totalKills =
    props.killsByArchetype.swarmer +
    props.killsByArchetype.ranged +
    props.killsByArchetype.charger;

  const levelInfo = calculateLevelFromXp(props.xp);
  const unreadNotifs = props.notifications.filter((n) => !n.read).length;

  const getMetricValue = (
    metric:
      | 'gold'
      | 'kills'
      | 'chests'
      | 'floors'
      | 'skillsUsed'
      | 'secrets'
      | 'highestFloor'
      | 'level'
      | 'dailyStreak'
      | 'totalScore',
  ): number => {
    switch (metric) {
      case 'gold':
        return props.gold;
      case 'kills':
        return totalKills;
      case 'chests':
        return props.chestsOpened;
      case 'floors':
        return props.floorsCompleted;
      case 'skillsUsed':
        return props.skillsUsedCount;
      case 'secrets':
        return props.secretsFound;
      case 'highestFloor':
        return props.highestFloor;
      case 'level':
        return levelInfo.level;
      case 'dailyStreak':
        return props.dailyStreak;
      case 'totalScore':
        return props.totalScore;
    }
  };

  const filteredLeaderboard = props.leaderboard
    .filter((row) => {
      if (leaderboardFilter === 'friends') return Boolean(row.isFriend);
      if (leaderboardFilter === 'weekly') return row.mode === 'weekly';
      return true;
    })
    .sort((a, b) => b.score - a.score);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    props.onSendChatMessage(chatChannel, trimmed);
    setChatInput('');
  };

  const tabs: { id: SanctumTab; label: string; badge?: number }[] = [
    { id: 'inventory', label: 'Inventar & Geheimnisse' },
    { id: 'skills_avatar', label: 'Skills & Avatar' },
    { id: 'challenges', label: 'Quests & Events' },
    { id: 'leaderboard', label: 'Bestenliste & Erfolge' },
    { id: 'dashboard_cloud', label: 'Statistiken & Cloud' },
    { id: 'chat_notifications', label: 'Chat & Meldungen', badge: unreadNotifs },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-3 md:p-6 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Helden-Kodex und Sanctum"
    >
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-amber-500/35 bg-[#110f18] text-[#f3efe6] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#171421] px-6 py-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-400/40"
              style={{ backgroundColor: `${props.avatar.avatarColor}25` }}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6">
                <path
                  d="M12 2L19 6V12C19 16.5 15.8 20.6 12 22C8.2 20.6 5 16.5 5 12V6L12 2Z"
                  fill={props.avatar.avatarColor}
                  stroke="#fde68a"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-['Cinzel'] text-lg md:text-xl font-bold tracking-wide text-amber-300">
                Helden-Kodex · {props.avatar.heroName}
              </h2>
              <p className="text-xs text-stone-400 tabular-nums">
                Stufe {levelInfo.level} · {props.avatar.avatarTitle} · {props.gold} Gold ·{' '}
                {props.skillPoints} Skill-Punkte
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
          >
            Zurück zum Labyrinth [Esc]
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 bg-[#14111d] px-6 py-2.5"
          role="tablist"
        >
          {tabs.map((t) => {
            const active = props.activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => props.onSelectTab(t.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-stone-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t.label}
                {t.badge && t.badge > 0 ? ` (${t.badge})` : ''}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: INVENTORY & SECRET REWARDS */}
          {props.activeTab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                    Ausrüstung & Beutel ({props.inventory.length} Gegenstände)
                  </h3>
                  <span className="text-xs text-stone-400">
                    Klicke auf Waffen, Rüstungen oder Relikte zum Ausrüsten
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {props.inventory.map((item) => {
                    const isEquipped =
                      item.id === props.equippedWeaponId ||
                      item.id === props.equippedArmorId ||
                      item.id === props.equippedRelicId;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          isEquipped
                            ? 'border-amber-400 bg-amber-500/10'
                            : 'border-white/10 bg-[#181523]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-amber-300/90">
                              {item.slot === 'weapon'
                                ? 'Waffe'
                                : item.slot === 'armor'
                                  ? 'Rüstung'
                                  : item.slot === 'relic'
                                    ? 'Relikt'
                                    : 'Verbrauchsgut'}{' '}
                              · {item.rarity.toUpperCase()}
                            </div>
                            <h4 className="font-semibold text-white text-sm mt-0.5">
                              {item.name}{' '}
                              {item.quantity > 1 ? `(${item.quantity}x)` : ''}
                            </h4>
                          </div>
                          {item.slot === 'consumable' ? (
                            <button
                              type="button"
                              disabled={item.quantity <= 0}
                              onClick={() => props.onUseConsumable(item)}
                              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40 whitespace-nowrap shrink-0"
                            >
                              Trinken (+{item.healAmount} HP)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => props.onEquipItem(item)}
                              className={`rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 ${
                                isEquipped
                                  ? 'bg-amber-400 text-black'
                                  : 'border border-white/20 bg-white/5 text-white hover:bg-white/15'
                              }`}
                            >
                              {isEquipped ? 'Ausgerüstet' : 'Ausrüsten'}
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-stone-300 leading-relaxed">
                          {item.description}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-400 font-mono tabular-nums">
                          {item.attackBonus > 0 && <span>+{item.attackBonus} ANG</span>}
                          {item.defenseBonus > 0 && <span>· +{item.defenseBonus} VER</span>}
                          {item.critBonus > 0 && <span>· +{item.critBonus}% KRIT</span>}
                          {item.speedBonus !== 0 && (
                            <span>
                              · {item.speedBonus > 0 ? `+${item.speedBonus}%` : `${item.speedBonus}%`} TEMPO
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Secret Rewards Column */}
              <div className="space-y-4">
                <h3 className="font-['Cinzel'] text-lg font-bold text-purple-300">
                  Geheime Belohnungen ({props.unlockedSecretIds.length}/{SECRET_REWARDS.length})
                </h3>
                <p className="text-xs text-stone-400">
                  Entdecke verborgene Runen-Altäre im 3D-Labyrinth oder erfülle geheime Meilensteine, um mythische Artefakte freizuschalten.
                </p>

                <div className="space-y-3">
                  {SECRET_REWARDS.map((sec) => {
                    const unlocked = props.unlockedSecretIds.includes(sec.id);
                    const canUnlockNow =
                      (sec.id === 'sec_obsidian_crown' && props.secretsFound >= 1) ||
                      (sec.id === 'sec_starlight_blade' &&
                        (props.highestFloor >= 3 || props.gold >= 600)) ||
                      (sec.id === 'sec_phantom_aegis' && totalKills >= 12);

                    return (
                      <div
                        key={sec.id}
                        className={`rounded-lg border p-4 ${
                          unlocked
                            ? 'border-purple-400/50 bg-purple-950/25'
                            : 'border-white/10 bg-[#181523]'
                        }`}
                      >
                        <h4 className="text-sm font-bold text-purple-200">{sec.title}</h4>
                        <p className="mt-1 text-xs text-stone-300">{sec.hint}</p>
                        <p className="mt-1.5 text-xs italic text-stone-400">„{sec.lore}“</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-mono text-amber-300">
                            {sec.rewardItem.name}
                          </span>
                          {unlocked ? (
                            <span className="text-xs font-bold text-emerald-400">
                              ✓ Im Inventar
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => props.onUnlockSecretReward(sec.id)}
                              className={`rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap ${
                                canUnlockNow
                                  ? 'bg-purple-500 text-black hover:bg-purple-400'
                                  : 'border border-purple-400/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20'
                              }`}
                            >
                              {canUnlockNow ? 'Geheimnis bergen!' : 'Runensiegel prüfen'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SKILLS & AVATAR CUSTOMIZATION */}
          {props.activeTab === 'skills_avatar' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Skill Trees */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                    Skill-System · 3 Meisterschaftspfade
                  </h3>
                  <div className="text-xs font-mono text-amber-300 tabular-nums">
                    Verfügbare Skill-Punkte: {props.skillPoints}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['klingenpfad', 'runenpfad', 'schattenpfad'] as const).map((branch) => {
                    const branchTitle =
                      branch === 'klingenpfad'
                        ? 'Klingenpfad (Offensiv)'
                        : branch === 'runenpfad'
                          ? 'Runenpfad (Arkan & Schutz)'
                          : 'Schattenpfad (Tempo & Beute)';
                    return (
                      <div
                        key={branch}
                        className="rounded-lg border border-white/10 bg-[#181523] p-4 space-y-3"
                      >
                        <h4 className="font-['Cinzel'] text-sm font-bold text-amber-300">
                          {branchTitle}
                        </h4>
                        {SKILL_TREE.filter((s) => s.branch === branch).map((node) => {
                          const rank = props.skillRanks[node.id] ?? 0;
                          const maxed = rank >= node.maxRank;
                          return (
                            <div
                              key={node.id}
                              className="rounded-md border border-white/10 bg-black/30 p-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{node.name}</span>
                                <span className="text-xs font-mono text-amber-400 tabular-nums">
                                  Rang {rank}/{node.maxRank}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-stone-300">{node.description}</p>
                              <p className="mt-1 text-[11px] text-emerald-300">
                                {node.effectPerRank}
                              </p>
                              <button
                                type="button"
                                disabled={maxed || props.skillPoints < node.costPerRank}
                                onClick={() => props.onUpgradeSkill(node.id)}
                                className="mt-2.5 w-full rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-stone-500 transition-colors"
                              >
                                {maxed
                                  ? 'Maximiert'
                                  : `Aufwerten (${node.costPerRank} Skill-Punkt)`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Avatar System */}
              <div className="rounded-lg border border-white/10 bg-[#181523] p-5 space-y-4">
                <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                  Avatar-System & Helden-Anpassung
                </h3>
                <p className="text-xs text-stone-400">
                  Passe Namen, Klasse, Rüstungsfarbe (synchronisiert sofort mit deinem 3D-Charakter) und Wappen an.
                </p>

                <div>
                  <label
                    htmlFor="hero-name-input"
                    className="block text-xs font-semibold text-stone-300 mb-1"
                  >
                    Heldenname
                  </label>
                  <input
                    id="hero-name-input"
                    type="text"
                    maxLength={32}
                    value={props.avatar.heroName}
                    onChange={(e) =>
                      props.onUpdateAvatar({
                        ...props.avatar,
                        heroName: e.target.value || 'Arkaner Wanderer',
                      })
                    }
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-stone-300 mb-1.5">
                    Heldenklasse
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'klingenmeister', label: 'Klingenmeister' },
                        { id: 'runenmagier', label: 'Runenmagier' },
                        { id: 'schattenlaeufer', label: 'Schattenläufer' },
                      ] as const
                    ).map((cls) => (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() =>
                          props.onUpdateAvatar({ ...props.avatar, avatarClass: cls.id })
                        }
                        className={`rounded-md px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                          props.avatar.avatarClass === cls.id
                            ? 'bg-amber-500 text-black font-bold'
                            : 'border border-white/10 bg-black/30 text-stone-300 hover:bg-white/10'
                        }`}
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-stone-300 mb-1.5">
                    3D-Rüstungsfarbe & Wappenglanz
                  </span>
                  <div className="flex items-center gap-2.5">
                    {[
                      { hex: '#f59e0b', name: 'Sonnengold' },
                      { hex: '#38bdf8', name: 'Ätherblau' },
                      { hex: '#10b981', name: 'Smaragdwache' },
                      { hex: '#ef4444', name: 'Blutrubin' },
                      { hex: '#a855f7', name: 'Amethyst' },
                    ].map((sw) => (
                      <button
                        key={sw.hex}
                        type="button"
                        aria-label={`Farbe ${sw.name}`}
                        onClick={() =>
                          props.onUpdateAvatar({ ...props.avatar, avatarColor: sw.hex })
                        }
                        className={`h-9 w-9 rounded-lg border-2 transition-transform ${
                          props.avatar.avatarColor === sw.hex
                            ? 'border-white scale-110'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-stone-300 mb-1.5">
                    Wappen-Emblem
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'phoenix', label: 'Phönix' },
                        { id: 'drache', label: 'Drache' },
                        { id: 'krone', label: 'Krone' },
                        { id: 'abyss', label: 'Abgrund' },
                      ] as const
                    ).map((cr) => (
                      <button
                        key={cr.id}
                        type="button"
                        onClick={() =>
                          props.onUpdateAvatar({ ...props.avatar, avatarCrest: cr.id })
                        }
                        className={`rounded-md px-2 py-2 text-xs font-semibold ${
                          props.avatar.avatarCrest === cr.id
                            ? 'bg-amber-500 text-black font-bold'
                            : 'border border-white/10 bg-black/30 text-stone-300'
                        }`}
                      >
                        {cr.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="hero-title-select"
                    className="block text-xs font-semibold text-stone-300 mb-1"
                  >
                    Aktiver Ehrentitel
                  </label>
                  <select
                    id="hero-title-select"
                    value={props.avatar.avatarTitle}
                    onChange={(e) =>
                      props.onUpdateAvatar({ ...props.avatar, avatarTitle: e.target.value })
                    }
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white"
                  >
                    <option value="Sucher der Tiefe">Sucher der Tiefe</option>
                    <option value="Gruft-Novize">Gruft-Novize</option>
                    <option value="Schatzjäger">Schatzjäger</option>
                    <option value="Tiefenwanderer">Tiefenwanderer</option>
                    <option value="Runenseher">Runenseher</option>
                    <option value="Großmeister des Abgrunds">Großmeister des Abgrunds</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DAILY CHALLENGES, DAILY QUESTS, WEEKLY TASKS (XP), WEEKLY EVENTS & DAILY LOGIN */}
          {props.activeTab === 'challenges' && (
            <div className="space-y-6">
              {/* Top Row: Daily Seed Challenge & Weekly Live Event */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-amber-500/40 bg-[#1a1626] p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Tägliche Herausforderung · Seed #20261027
                  </div>
                  <h3 className="mt-1 font-['Cinzel'] text-lg font-bold text-white">
                    Katakomben des Goldenen Siegels
                  </h3>
                  <p className="mt-1 text-xs text-stone-300">
                    Spezielles tägliches Labyrinth mit identischem Layout für alle Spieler weltweit. +35% Gold-Schätze und erhöhte Runen-Kultisten-Präsenz.
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-mono text-amber-300">
                      Belohnung: +250 Bonus-XP & Bestenlisten-Eintrag
                    </span>
                    <button
                      type="button"
                      onClick={props.onStartDailyChallenge}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 transition-colors whitespace-nowrap"
                    >
                      Tages-Herausforderung starten
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-rose-500/40 bg-[#1f1421] p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Wöchentliches Event · Exklusive Preise
                  </div>
                  <h3 className="mt-1 font-['Cinzel'] text-lg font-bold text-white">
                    Blutmond-Expedition der Kolosse
                  </h3>
                  <p className="mt-1 text-xs text-stone-300">
                    Exklusives Wochen-Turnier! Die besten Teilnehmer gewinnen das mythische Relikt „Blutmond-Insignie“, 1.000 Gold und den Titel „Herrscher der Tiefe“.
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-mono text-rose-300">
                      Hauptpreis: Mythisches Relikt + 1.000 Gold
                    </span>
                    <button
                      type="button"
                      onClick={props.onStartWeeklyEventRun}
                      className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-black hover:bg-rose-400 transition-colors whitespace-nowrap"
                    >
                      Wochen-Event betreten
                    </button>
                  </div>
                </div>
              </div>

              {/* Daily Quests & Weekly XP Tasks */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-['Cinzel'] text-base font-bold text-amber-300">
                    Tägliche Quests (Jeden Tag neue Motivation)
                  </h3>
                  {DAILY_AND_WEEKLY_QUESTS.filter((q) => q.type === 'daily').map((q) => {
                    const current = getMetricValue(q.metric);
                    const done = current >= q.target;
                    const claimed = props.claimedQuestIds.includes(q.id);
                    const pct = Math.min(100, Math.round((current / q.target) * 100));
                    return (
                      <div
                        key={q.id}
                        className="rounded-lg border border-white/10 bg-[#181523] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-white">{q.title}</h4>
                            <p className="text-xs text-stone-400">{q.description}</p>
                          </div>
                          <button
                            type="button"
                            disabled={!done || claimed}
                            onClick={() => props.onClaimQuest(q.id)}
                            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-stone-500 whitespace-nowrap shrink-0"
                          >
                            {claimed
                              ? '✓ Eingelöst'
                              : done
                                ? 'Belohnung abholen!'
                                : `${current}/${q.target}`}
                          </button>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/50">
                          <div
                            className="h-full bg-amber-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-stone-400 font-mono tabular-nums">
                          <span>Fortschritt: {pct}%</span>
                          <span className="text-amber-300">
                            +{q.rewardGold} Gold · +{q.rewardXp} XP
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <h3 className="font-['Cinzel'] text-base font-bold text-sky-300">
                    Wöchentliche Aufgaben (Große XP-Boosts für Level-Ups)
                  </h3>
                  {DAILY_AND_WEEKLY_QUESTS.filter((q) => q.type === 'weekly').map((q) => {
                    const current = getMetricValue(q.metric);
                    const done = current >= q.target;
                    const claimed = props.claimedQuestIds.includes(q.id);
                    const pct = Math.min(100, Math.round((current / q.target) * 100));
                    return (
                      <div
                        key={q.id}
                        className="rounded-lg border border-white/10 bg-[#181523] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-white">{q.title}</h4>
                            <p className="text-xs text-stone-400">{q.description}</p>
                          </div>
                          <button
                            type="button"
                            disabled={!done || claimed}
                            onClick={() => props.onClaimQuest(q.id)}
                            className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-sky-300 disabled:bg-white/10 disabled:text-stone-500 whitespace-nowrap shrink-0"
                          >
                            {claimed
                              ? '✓ Eingelöst'
                              : done
                                ? 'XP-Boost abholen!'
                                : `${current}/${q.target}`}
                          </button>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/50">
                          <div
                            className="h-full bg-sky-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-stone-400 font-mono tabular-nums">
                          <span>Fortschritt: {pct}%</span>
                          <span className="text-sky-300">
                            +{q.rewardXp} XP · +{q.rewardGold} Gold · +{q.rewardSkillPoints ?? 1} SP
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 7-Day Daily Login Reward Bar */}
              <div className="rounded-lg border border-white/10 bg-[#181523] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-['Cinzel'] text-base font-bold text-white">
                      Belohnungssystem für Tägliche Logins (Aktueller Streak: {props.dailyStreak} Tage)
                    </h3>
                    <p className="text-xs text-stone-400">
                      Sichere dir jeden Tag Bonus-Gold, Erfahrungspunkte und Heiltränke für deine Expeditionen.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {DAILY_LOGIN_REWARDS.map((d) => {
                    const claimed = props.claimedLoginDays.includes(d.day);
                    const unlocked = d.day <= props.dailyStreak;
                    return (
                      <div
                        key={d.day}
                        className={`rounded-lg border p-3 text-center ${
                          claimed
                            ? 'border-emerald-500/40 bg-emerald-950/20'
                            : unlocked
                              ? 'border-amber-400 bg-amber-500/10'
                              : 'border-white/10 bg-black/30 opacity-75'
                        }`}
                      >
                        <div className="text-xs font-bold text-amber-300">{d.label}</div>
                        <div className="mt-1 text-xs font-mono text-white tabular-nums">
                          +{d.rewardGold} Gold
                        </div>
                        <div className="text-[11px] font-mono text-sky-300 tabular-nums">
                          +{d.rewardXp} XP
                        </div>
                        {d.bonusItemName && (
                          <div className="mt-1 text-[10px] text-purple-300">{d.bonusItemName}</div>
                        )}
                        <button
                          type="button"
                          disabled={claimed || !unlocked}
                          onClick={() => props.onClaimDailyLogin(d.day)}
                          className="mt-2 w-full rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-stone-400"
                        >
                          {claimed ? '✓ Erhalten' : unlocked ? 'Abholen' : 'Gesperrt'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEADERBOARD, ACHIEVEMENTS & SOCIAL SHARE */}
          {props.activeTab === 'leaderboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Leaderboard */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                      Bestenliste & Freundes-Wettbewerb
                    </h3>
                    <p className="text-xs text-stone-400">
                      Messe dich global, mit Freunden oder im wöchentlichen Blutmond-Event.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1">
                      {(
                        [
                          { id: 'all', label: 'Global' },
                          { id: 'friends', label: 'Freunde' },
                          { id: 'weekly', label: 'Wochen-Event' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setLeaderboardFilter(f.id)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                            leaderboardFilter === f.id
                              ? 'bg-amber-500 text-black font-bold'
                              : 'text-stone-400 hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={props.onPublishScoreToCloud}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 whitespace-nowrap"
                    >
                      Score eintragen
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-white/10 bg-[#181523]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 bg-black/40 text-stone-400">
                      <tr>
                        <th className="px-4 py-3">Rang</th>
                        <th className="px-4 py-3">Held</th>
                        <th className="px-4 py-3">Modus</th>
                        <th className="px-4 py-3 text-right">Ebene</th>
                        <th className="px-4 py-3 text-right">Kills</th>
                        <th className="px-4 py-3 text-right">Punkte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                      {filteredLeaderboard.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-white/5">
                          <td className="px-4 py-3 font-bold text-amber-400">#{idx + 1}</td>
                          <td className="px-4 py-3 font-sans">
                            <div className="font-semibold text-white">
                              {row.playerName}{' '}
                              {row.isFriend && (
                                <span className="text-[11px] text-emerald-400">· Freund</span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400">{row.titleBadge}</div>
                          </td>
                          <td className="px-4 py-3 text-stone-300">{row.mode.toUpperCase()}</td>
                          <td className="px-4 py-3 text-right text-stone-200">
                            Ebene {row.floorReached}
                          </td>
                          <td className="px-4 py-3 text-right text-stone-300">{row.enemiesSlain}</td>
                          <td className="px-4 py-3 text-right font-bold text-amber-300">
                            {row.score}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Achievements + Social Share */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                  Erfolge & Social-Share ({props.unlockedAchievementIds.length}/{ACHIEVEMENTS.length})
                </h3>
                {ACHIEVEMENTS.map((ach) => {
                  const val = getMetricValue(ach.metric);
                  const unlocked = val >= ach.target;
                  const claimed = props.unlockedAchievementIds.includes(ach.id);
                  return (
                    <div
                      key={ach.id}
                      className={`rounded-lg border p-4 ${
                        claimed
                          ? 'border-amber-400/50 bg-amber-500/10'
                          : 'border-white/10 bg-[#181523]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white">{ach.title}</h4>
                          <p className="text-xs text-stone-300">{ach.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {unlocked && !claimed && (
                            <button
                              type="button"
                              onClick={() => props.onClaimAchievement(ach.id)}
                              className="rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-black hover:bg-amber-400"
                            >
                              +{ach.rewardGold}G
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              props.onOpenShareModal({
                                title: ach.title,
                                subtitle: ach.shareBannerText,
                                score: props.totalScore,
                                floor: props.highestFloor,
                                heroName: props.avatar.heroName,
                                heroTitle: props.avatar.avatarTitle,
                                avatarColor: props.avatar.avatarColor,
                              })
                            }
                            className="rounded border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-white/15 whitespace-nowrap"
                          >
                            Teilen
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-stone-400 font-mono tabular-nums">
                        <span>
                          Status: {Math.min(val, ach.target)}/{ach.target}
                        </span>
                        {ach.rewardTitle && <span>Titel: {ach.rewardTitle}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: PROGRESS DASHBOARD & CLOUD SAVE */}
          {props.activeTab === 'dashboard_cloud' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Personal Statistics Dashboard */}
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <h3 className="font-['Cinzel'] text-lg font-bold text-white">
                    Persönliches Fortschritts-Dashboard
                  </h3>
                  <p className="text-xs text-stone-400">
                    Deine detaillierte Kampf-, Erkundungs- und Stufen-Statistik über alle Labyrinthe hinweg.
                  </p>
                </div>

                {/* Level & XP Bar Card */}
                <div className="rounded-lg border border-white/10 bg-[#181523] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-amber-400 font-semibold">
                        HELDENSTUFE & ERFAHRUNG
                      </div>
                      <div className="font-['Cinzel'] text-2xl font-bold text-white mt-0.5">
                        Stufe {levelInfo.level} · {props.avatar.avatarTitle}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-stone-300 tabular-nums">
                      <div>Gesamt-XP: {props.xp}</div>
                      <div>
                        Nächstes Level: {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/50">
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${levelInfo.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 6 Core Stat Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Höchste Ebene</div>
                    <div className="mt-1 text-2xl font-bold text-amber-300">
                      Ebene {props.highestFloor}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Gesamtpunkte</div>
                    <div className="mt-1 text-2xl font-bold text-white">{props.totalScore}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Gesammeltes Gold</div>
                    <div className="mt-1 text-2xl font-bold text-amber-400">{props.gold}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Besiegte Gegner</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-400">{totalKills}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Geöffnete Truhen</div>
                    <div className="mt-1 text-2xl font-bold text-sky-300">{props.chestsOpened}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#181523] p-4">
                    <div className="text-xs text-stone-400 font-sans">Geheimnisse entdeckt</div>
                    <div className="mt-1 text-2xl font-bold text-purple-300">
                      {props.secretsFound}
                    </div>
                  </div>
                </div>

                {/* Breakdown by Enemy Archetype */}
                <div className="rounded-lg border border-white/10 bg-[#181523] p-5 space-y-3">
                  <h4 className="font-['Cinzel'] text-sm font-bold text-white">
                    Kampfanalyse nach Gegner-Verhaltensmuster
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs tabular-nums">
                    <div className="rounded border border-white/5 bg-black/30 p-3">
                      <div className="text-emerald-400 font-semibold">Gruft-Skelette (Swarmer)</div>
                      <div className="mt-1 text-lg font-mono font-bold text-white">
                        {props.killsByArchetype.swarmer} besiegt
                      </div>
                    </div>
                    <div className="rounded border border-white/5 bg-black/30 p-3">
                      <div className="text-purple-400 font-semibold">Runen-Kultisten (Fernkampf)</div>
                      <div className="mt-1 text-lg font-mono font-bold text-white">
                        {props.killsByArchetype.ranged} besiegt
                      </div>
                    </div>
                    <div className="rounded border border-white/5 bg-black/30 p-3">
                      <div className="text-rose-400 font-semibold">Abgrund-Kolosse (Stürmer)</div>
                      <div className="mt-1 text-lg font-mono font-bold text-white">
                        {props.killsByArchetype.charger} besiegt
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cross-Platform Cloud Save Panel */}
              <div className="rounded-lg border border-amber-500/35 bg-[#181523] p-5 space-y-4">
                <h3 className="font-['Cinzel'] text-lg font-bold text-amber-300">
                  Cloud-Speicherdienst (Plattformübergreifend)
                </h3>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Synchronisiere deinen gesamten Spielstand (Level, Gold, Ausrüstung, Skills, Erfolge und Geheimnisse) über Firebase Cloud Firestore für plattformunabhängiges Gaming.
                </p>

                <div className="rounded-lg border border-white/10 bg-black/40 p-3.5 text-xs space-y-1">
                  <div className="text-stone-400">Konto-Status:</div>
                  <div className="font-semibold text-white">
                    {props.isAuthenticated
                      ? `Verbunden als ${props.userDisplayName || 'Cloud-Held'}`
                      : 'Lokaler Gast-Modus (Lokaler Speicher aktiv)'}
                  </div>
                  <div className="text-amber-300 font-mono text-[11px] mt-1">
                    {props.cloudSyncStatus}
                  </div>
                </div>

                {!props.isAuthenticated ? (
                  <button
                    type="button"
                    onClick={props.onSignInGoogle}
                    className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-400 transition-colors"
                  >
                    Mit Google anmelden für Cloud-Sync
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={props.onSaveToCloud}
                      className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-400 transition-colors"
                    >
                      Spielstand jetzt in Cloud speichern
                    </button>
                    <button
                      type="button"
                      onClick={props.onLoadFromCloud}
                      className="w-full rounded-lg border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25 transition-colors"
                    >
                      Spielstand aus Cloud laden
                    </button>
                    <button
                      type="button"
                      onClick={props.onSignOutGoogle}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs text-stone-300 hover:bg-white/10"
                    >
                      Abmelden
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: IN-GAME CHAT & NOTIFICATIONS */}
          {props.activeTab === 'chat_notifications' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Real-Time In-Game Chat */}
              <div className="lg:col-span-7 flex flex-col rounded-lg border border-white/10 bg-[#181523] p-4 h-[520px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-['Cinzel'] text-base font-bold text-white">
                      In-Game-Chat · Tavernen- & Gildenfunk
                    </h3>
                    <p className="text-xs text-stone-400">
                      Tausche Strategien, Labyrinth-Seeds und Erfolge in Echtzeit mit anderen Spielern aus.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1">
                    {(['global', 'gilde', 'ereignisse'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChatChannel(ch)}
                        className={`rounded px-2.5 py-1 text-xs font-semibold ${
                          chatChannel === ch
                            ? 'bg-amber-500 text-black font-bold'
                            : 'text-stone-400 hover:text-white'
                        }`}
                      >
                        #{ch}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
                  {props.chatMessages
                    .filter((m) => m.channel === chatChannel)
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-lg border border-white/5 bg-black/35 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-stone-400">
                          <span>
                            <strong style={{ color: msg.avatarColor }}>{msg.senderName}</strong> ·{' '}
                            {msg.senderTitle}
                          </span>
                          <span className="font-mono tabular-nums">{msg.timeLabel}</span>
                        </div>
                        <p className="mt-1 text-stone-200">{msg.text}</p>
                      </div>
                    ))}
                </div>

                <form onSubmit={handleChatSubmit} className="mt-3 flex items-center gap-2 pt-2 border-t border-white/10">
                  <label htmlFor="ingame-chat-input" className="sr-only">
                    Chat-Nachricht eingeben
                  </label>
                  <input
                    id="ingame-chat-input"
                    type="text"
                    maxLength={280}
                    placeholder={`Nachricht in #${chatChannel} senden...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 whitespace-nowrap"
                  >
                    Senden
                  </button>
                </form>
              </div>

              {/* Notification Center */}
              <div className="lg:col-span-5 flex flex-col rounded-lg border border-white/10 bg-[#181523] p-4 h-[520px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-['Cinzel'] text-base font-bold text-white">
                      Benachrichtigungen ({unreadNotifs} neu)
                    </h3>
                    <p className="text-xs text-stone-400">
                      Hinweise zu neuen Herausforderungen, Nachrichten & Belohnungen.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={props.onMarkNotificationsRead}
                    className="rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-stone-300 hover:bg-white/10 whitespace-nowrap"
                  >
                    Alle gelesen
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
                  {props.notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border p-3 text-xs ${
                        n.read
                          ? 'border-white/5 bg-black/25 text-stone-400'
                          : 'border-amber-500/40 bg-amber-500/10 text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300">{n.title}</span>
                        <span className="font-mono text-[11px] text-stone-400">{n.timestamp}</span>
                      </div>
                      <p className="mt-1 leading-relaxed">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
