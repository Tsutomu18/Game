import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  INITIAL_ITEMS,
  SKILL_TREE,
  DAILY_AND_WEEKLY_QUESTS,
  ACHIEVEMENTS,
  SECRET_REWARDS,
  DAILY_LOGIN_REWARDS,
  type InventoryItem,
  type AvatarConfig,
  type NotificationItem,
} from './game/gameData';
import {
  generateDungeon,
  calculateLevelFromXp,
  calculateRunScore,
  CAMERA_PRESETS,
  type CameraPresetId,
  type EnemyArchetype,
} from './game/rules';
import { DungeonCanvas, type HudTelemetrySnapshot } from './game/DungeonCanvas';
import {
  SanctumModal,
  type SanctumTab,
  type LeaderboardRow,
  type ChatRow,
} from './components/SanctumModal';
import { SocialShareModal, type SharePayload } from './components/SocialShareModal';
import { TouchControlsOverlay } from './components/TouchControlsOverlay';
import { sound } from './game/sound';
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  addDoc,
  handleFirestoreError,
  OperationType,
  type User,
} from './firebase';

const LOCAL_SAVE_KEY = 'abyssal_labyrinth_save_v1';

const INITIAL_LEADERBOARD: LeaderboardRow[] = [
  {
    id: 'seed_1',
    playerName: 'Valerius Nachtklinge',
    avatarClass: 'klingenmeister',
    avatarColor: '#f59e0b',
    titleBadge: 'Großmeister des Abgrunds',
    score: 4820,
    floorReached: 5,
    enemiesSlain: 24,
    goldCollected: 910,
    mode: 'standard',
    isFriend: true,
  },
  {
    id: 'seed_2',
    playerName: 'Lyra Runenweber',
    avatarClass: 'runenmagier',
    avatarColor: '#38bdf8',
    titleBadge: 'Runenseher',
    score: 3960,
    floorReached: 4,
    enemiesSlain: 19,
    goldCollected: 740,
    mode: 'weekly',
    isFriend: true,
  },
  {
    id: 'seed_3',
    playerName: 'Kaelen Schattenläufer',
    avatarClass: 'schattenlaeufer',
    avatarColor: '#10b981',
    titleBadge: 'Tiefenwanderer',
    score: 3150,
    floorReached: 3,
    enemiesSlain: 15,
    goldCollected: 625,
    mode: 'daily',
    isFriend: false,
  },
  {
    id: 'seed_4',
    playerName: 'Seraphina Eisenherz',
    avatarClass: 'klingenmeister',
    avatarColor: '#ef4444',
    titleBadge: 'Schatzjäger',
    score: 2490,
    floorReached: 3,
    enemiesSlain: 11,
    goldCollected: 510,
    mode: 'weekly',
    isFriend: true,
  },
];

const INITIAL_CHAT: ChatRow[] = [
  {
    id: 'c_1',
    senderName: 'Valerius Nachtklinge',
    senderTitle: 'Großmeister des Abgrunds',
    avatarColor: '#f59e0b',
    channel: 'global',
    text: 'Tipp für Ebene 2: Achtet auf den roten Zielring der Abgrund-Kolosse und nutzt [Q] Schattenschritt!',
    timeLabel: 'Vor 4m',
  },
  {
    id: 'c_2',
    senderName: 'Lyra Runenweber',
    senderTitle: 'Runenseher',
    avatarColor: '#38bdf8',
    channel: 'global',
    text: 'Habe gerade im nordöstlichen Gewölbe den geheimen Runen-Altar entsiegelt – Krone des Stummen Königs erhalten!',
    timeLabel: 'Vor 2m',
  },
  {
    id: 'c_3',
    senderName: 'Gildenmeisterin Elenor',
    senderTitle: 'Hüterin der Katakomben',
    avatarColor: '#10b981',
    channel: 'gilde',
    text: 'Denkt an die wöchentlichen Aufgaben: Sie bringen bis zu +1.200 XP für schnelle Level-Ups!',
    timeLabel: 'Vor 1m',
  },
  {
    id: 'c_4',
    senderName: 'Herold des Abgrunds',
    senderTitle: 'Turnierleitung',
    avatarColor: '#ef4444',
    channel: 'ereignisse',
    text: 'Das Wochen-Event „Blutmond-Expedition der Kolosse“ ist aktiv! Exklusive Preise für die Top-Teilnehmer.',
    timeLabel: 'Jetzt',
  },
];

interface EndOfRunSnapshot {
  outcome: 'victory' | 'defeat';
  floorReached: number;
  runGold: number;
  runKills: number;
  runChests: number;
  runSecrets: number;
  runScore: number;
  bestScore: number;
}

export default function App() {
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>(
    isAutostart ? 'playing' : 'title',
  );
  const [floor, setFloor] = useState<number>(1);
  const [seedOverride, setSeedOverride] = useState<number | undefined>(undefined);
  const [activeRunMode, setActiveRunMode] = useState<'standard' | 'daily' | 'weekly'>('standard');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(true);
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(false);
  const [touchMoveVector, setTouchMoveVector] = useState<{ moveX: number; moveZ: number }>({
    moveX: 0,
    moveZ: 0,
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [cameraRotateInput, setCameraRotateInput] = useState<number>(0);
  const [cameraZoomStepCount, setCameraZoomStepCount] = useState<number>(0);
  const [cameraZoomStepDir, setCameraZoomStepDir] = useState<'in' | 'out'>('in');
  const [cameraResetTriggerCount, setCameraResetTriggerCount] = useState<number>(0);
  const [sprintEnabled, setSprintEnabled] = useState<boolean>(false);
  const [cameraAutoFollow, setCameraAutoFollow] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(sound.muted);

  // Persistent Player Progression State
  const [xp, setXp] = useState<number>(180);
  const [gold, setGold] = useState<number>(240);
  const [skillPoints, setSkillPoints] = useState<number>(3);
  const [highestFloor, setHighestFloor] = useState<number>(1);
  const [totalScore, setTotalScore] = useState<number>(1420);
  const [floorsCompleted, setFloorsCompleted] = useState<number>(1);
  const [skillsUsedCount, setSkillsUsedCount] = useState<number>(1);
  const [chestsOpened, setChestsOpened] = useState<number>(1);
  const [secretsFound, setSecretsFound] = useState<number>(0);
  const [killsByArchetype, setKillsByArchetype] = useState<{
    swarmer: number;
    ranged: number;
    charger: number;
  }>({ swarmer: 3, ranged: 1, charger: 1 });

  // Inventory & Equipment
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_ITEMS);
  const [equippedWeaponId, setEquippedWeaponId] = useState<string>('wpn_iron_longsword');
  const [equippedArmorId, setEquippedArmorId] = useState<string>('arm_warden_plate');
  const [equippedRelicId, setEquippedRelicId] = useState<string>('rel_ember_compass');
  const [unlockedSecretIds, setUnlockedSecretIds] = useState<string[]>([]);

  // Skills & Avatar
  const [skillRanks, setSkillRanks] = useState<Record<string, number>>({
    sk_whirlwind_edge: 1,
    sk_rune_bulwark: 1,
    sk_shadow_dash: 1,
  });
  const [avatar, setAvatar] = useState<AvatarConfig>({
    heroName: 'Aldric Tiefenwächter',
    avatarClass: 'klingenmeister',
    avatarColor: '#f59e0b',
    avatarCrest: 'phoenix',
    avatarTitle: 'Sucher der Tiefe',
  });

  // Quests, Achievements, Login Streak
  const [claimedQuestIds, setClaimedQuestIds] = useState<string[]>([]);
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<string[]>([
    'ach_first_blood',
  ]);
  const [dailyStreak, setDailyStreak] = useState<number>(3);
  const [claimedLoginDays, setClaimedLoginDays] = useState<number[]>([1, 2]);

  // Sanctum & Share Modals
  const [sanctumOpen, setSanctumOpen] = useState<boolean>(false);
  const [sanctumTab, setSanctumTab] = useState<SanctumTab>('inventory');
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [runSnapshot, setRunSnapshot] = useState<EndOfRunSnapshot | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Firebase Auth & Cloud State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>(
    'Bereit für Cloud-Synchronisation',
  );
  const [cloudSaveExists, setCloudSaveExists] = useState<boolean>(false);

  // Leaderboard, Chat & Notifications
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>(INITIAL_LEADERBOARD);
  const [chatMessages, setChatMessages] = useState<ChatRow[]>(INITIAL_CHAT);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif_1',
      category: 'challenge',
      title: 'Neue Tägliche Herausforderung aktiv!',
      body: '„Katakomben des Goldenen Siegels“ (Seed #20261027) gewährt heute +35% Gold-Schätze.',
      timestamp: 'Heute',
      read: false,
    },
    {
      id: 'notif_2',
      category: 'event',
      title: 'Wochen-Event: Blutmond-Expedition',
      body: 'Nimm am wöchentlichen Event teil und sichere dir exklusive Relikt-Preise.',
      timestamp: 'Aktiv',
      read: false,
    },
    {
      id: 'notif_3',
      category: 'reward',
      title: 'Tag 3 Login-Belohnung abholbereit!',
      body: 'Hole dir +250 Gold, +220 XP und +1 Skill-Punkt im Quests & Events-Tab ab.',
      timestamp: 'Neu',
      read: false,
    },
  ]);

  // Action Trigger Counters for 3D Canvas
  const [healTriggerCount, setHealTriggerCount] = useState<number>(0);
  const [novaTriggerCount, setNovaTriggerCount] = useState<number>(0);
  const [dashTriggerCount, setDashTriggerCount] = useState<number>(0);
  const [attackTriggerCount, setAttackTriggerCount] = useState<number>(0);
  const [interactTriggerCount, setInteractTriggerCount] = useState<number>(0);

  // Live HUD Telemetry from 3D Canvas
  const [telemetry, setTelemetry] = useState<HudTelemetrySnapshot>(() => ({
    hp: 145,
    maxHp: 145,
    floor: 1,
    runGold: 0,
    runKills: 0,
    runChests: 0,
    runSecrets: 0,
    dashCooldown: 0,
    novaCooldown: 0,
    nearbyPrompt: null,
    playerGridX: 3,
    playerGridZ: 4,
    dungeon: generateDungeon(1),
    activeEnemyCoords: [],
    activePropCoords: [],
    cameraYawDeg: 0,
    cameraDistance: 13.6,
  }));

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  const cycleCameraPreset = useCallback(() => {
    setCameraPreset((prev) => {
      const next: CameraPresetId =
        prev === 'isometric' ? 'close' : prev === 'close' ? 'tactical' : 'isometric';
      showToast(`Kamera-Perspektive: ${CAMERA_PRESETS[next].label}`);
      return next;
    });
  }, [showToast]);

  const handleResetCamera = useCallback(() => {
    setCameraResetTriggerCount((c) => c + 1);
    showToast('Kamera zentriert (0°)');
  }, [showToast]);

  const handleZoomCamera = useCallback((dir: 'in' | 'out') => {
    setCameraZoomStepDir(dir);
    setCameraZoomStepCount((c) => c + 1);
  }, []);

  const toggleSprint = useCallback(() => {
    setSprintEnabled((prev) => {
      const next = !prev;
      showToast(next ? 'Dauer-Sprint aktiviert (+38% Tempo)' : 'Dauer-Sprint deaktiviert');
      return next;
    });
  }, [showToast]);

  const toggleCameraAutoFollow = useCallback(() => {
    setCameraAutoFollow((prev) => {
      const next = !prev;
      showToast(next ? 'Kamera-Folgemodus: Aktiv [V]' : 'Kamera-Folgemodus: Frei [V]');
      return next;
    });
  }, [showToast]);

  const pushNotification = useCallback(
    (category: NotificationItem['category'], title: string, body: string) => {
      setNotifications((prev) => [
        {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category,
          title,
          body,
          timestamp: 'Gerade eben',
          read: false,
        },
        ...prev.slice(0, 24),
      ]);
      showToast(`${title}: ${body}`);
    },
    [showToast],
  );

  // Load Local Save on Mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.xp === 'number') setXp(parsed.xp);
        if (typeof parsed.gold === 'number') setGold(parsed.gold);
        if (typeof parsed.skillPoints === 'number') setSkillPoints(parsed.skillPoints);
        if (typeof parsed.highestFloor === 'number') setHighestFloor(parsed.highestFloor);
        if (typeof parsed.totalScore === 'number') setTotalScore(parsed.totalScore);
        if (parsed.avatar) setAvatar(parsed.avatar);
        if (parsed.skillRanks) setSkillRanks(parsed.skillRanks);
        if (Array.isArray(parsed.claimedQuestIds)) setClaimedQuestIds(parsed.claimedQuestIds);
        if (Array.isArray(parsed.claimedLoginDays)) setClaimedLoginDays(parsed.claimedLoginDays);
        if (Array.isArray(parsed.unlockedSecretIds)) setUnlockedSecretIds(parsed.unlockedSecretIds);
      }
    } catch {
      // ignore corrupted local storage
    }
  }, []);

  // Auto-Persist Local Save
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_SAVE_KEY,
        JSON.stringify({
          xp,
          gold,
          skillPoints,
          highestFloor,
          totalScore,
          avatar,
          skillRanks,
          claimedQuestIds,
          claimedLoginDays,
          unlockedSecretIds,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    xp,
    gold,
    skillPoints,
    highestFloor,
    totalScore,
    avatar,
    skillRanks,
    claimedQuestIds,
    claimedLoginDays,
    unlockedSecretIds,
  ]);

  // Mirror gameState to document.body.dataset.state as mandated by Game Shell contract
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        setCloudSyncStatus(`Angemeldet als ${user.displayName || 'Held'}`);
      } else {
        setCloudSyncStatus('Lokaler Speicher aktiv (Nicht mit Cloud verbunden)');
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore Listeners for Leaderboard & Chat only when Auth Ready and User is Authenticated
  useEffect(() => {
    if (!authReady || !currentUser) return;

    const lbQuery = query(
      collection(db, 'leaderboard'),
      where('score', '>=', 0),
      orderBy('score', 'desc'),
      limit(15),
    );
    const unsubLb = onSnapshot(
      lbQuery,
      (snap) => {
        const cloudRows: LeaderboardRow[] = [];
        snap.forEach((d) => {
          const data = d.data();
          cloudRows.push({
            id: d.id,
            playerName: String(data.playerName || 'Held'),
            avatarClass: String(data.avatarClass || 'klingenmeister'),
            avatarColor: String(data.avatarColor || '#f59e0b'),
            titleBadge: String(data.titleBadge || 'Sucher der Tiefe'),
            score: Number(data.score || 0),
            floorReached: Number(data.floorReached || 1),
            enemiesSlain: Number(data.enemiesSlain || 0),
            goldCollected: Number(data.goldCollected || 0),
            mode: (data.mode as 'standard' | 'daily' | 'weekly') || 'standard',
            isFriend: false,
          });
        });
        setLeaderboard([...INITIAL_LEADERBOARD, ...cloudRows]);
      },
      (err) => {
        if (auth.currentUser) {
          try {
            handleFirestoreError(err, OperationType.LIST, 'leaderboard');
          } catch {
            // handled gracefully
          }
        }
      },
    );

    const chatQuery = query(
      collection(db, 'chatMessages'),
      where('channel', 'in', ['global', 'gilde', 'ereignisse']),
      limit(25),
    );
    const unsubChat = onSnapshot(
      chatQuery,
      (snap) => {
        const cloudChats: ChatRow[] = [];
        snap.forEach((d) => {
          const data = d.data();
          cloudChats.push({
            id: d.id,
            senderName: String(data.senderName || 'Held'),
            senderTitle: String(data.senderTitle || 'Wanderer'),
            avatarColor: String(data.avatarColor || '#f59e0b'),
            channel: (data.channel as 'global' | 'gilde' | 'ereignisse') || 'global',
            text: String(data.text || ''),
            timeLabel: 'Live',
          });
        });
        if (cloudChats.length > 0) {
          setChatMessages([...INITIAL_CHAT, ...cloudChats]);
        }
      },
      (err) => {
        if (auth.currentUser) {
          try {
            handleFirestoreError(err, OperationType.LIST, 'chatMessages');
          } catch {
            // handled gracefully
          }
        }
      },
    );

    return () => {
      unsubLb();
      unsubChat();
    };
  }, [authReady, currentUser]);

  // Compute Effective Player Combat Stats from Equipment + Skill Ranks
  const computedPlayerStats = useMemo(() => {
    const weapon = inventory.find((i) => i.id === equippedWeaponId) ?? INITIAL_ITEMS[0];
    const armor = inventory.find((i) => i.id === equippedArmorId) ?? INITIAL_ITEMS[3];
    const relic = inventory.find((i) => i.id === equippedRelicId) ?? INITIAL_ITEMS[5];

    const whirlwindRank = skillRanks.sk_whirlwind_edge ?? 0;
    const sunderRank = skillRanks.sk_sunder_strike ?? 0;
    const siphonRank = skillRanks.sk_blood_siphon ?? 0;
    const bulwarkRank = skillRanks.sk_rune_bulwark ?? 0;
    const novaRank = skillRanks.sk_arcane_nova ?? 0;
    const aetherRank = skillRanks.sk_aether_ward ?? 0;
    const dashRank = skillRanks.sk_shadow_dash ?? 0;
    const greedRank = skillRanks.sk_treasure_instinct ?? 0;

    const baseAttack = 20 + weapon.attackBonus + armor.attackBonus + relic.attackBonus;
    const attackDamage = Math.round(baseAttack * (1 + whirlwindRank * 0.12));
    const defense = 10 + weapon.defenseBonus + armor.defenseBonus + relic.defenseBonus + bulwarkRank * 4;
    const critChance = Math.min(
      75,
      10 + weapon.critBonus + armor.critBonus + relic.critBonus + sunderRank * 6,
    );
    const maxHp = 120 + bulwarkRank * 25;
    const moveSpeedMultiplier =
      1 + (weapon.speedBonus + armor.speedBonus + relic.speedBonus) * 0.01 + dashRank * 0.06;

    return {
      maxHp,
      attackDamage,
      defense,
      critChance,
      moveSpeedMultiplier,
      attackRangeBonus: whirlwindRank * 0.25,
      lifeOnKill: siphonRank * 6,
      hpRegenPerSec: aetherRank * 1.2,
      novaDamage: 45 + novaRank * 22,
      novaCooldownMax: Math.max(2.2, 6.0 - novaRank * 0.7),
      dashCooldownMax: Math.max(1.2, 3.2 - dashRank * 0.35),
      goldMultiplier: 1 + greedRank * 0.18,
    };
  }, [inventory, equippedWeaponId, equippedArmorId, equippedRelicId, skillRanks]);

  const startPlaying = useCallback((customFloor?: number, customSeed?: number, mode: 'standard' | 'daily' | 'weekly' = 'standard') => {
    if (customFloor !== undefined) setFloor(customFloor);
    setSeedOverride(customSeed);
    setActiveRunMode(mode);
    setSanctumOpen(false);
    setRunSnapshot(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  // Title Screen Enter/Space & Global Keyboard Shortcuts ([Tab] Sanctum, [M] Mute, [R] Restart, [Z] Zen Dock, [H] Heal)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (gameState === 'title' && !sanctumOpen && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startPlaying(1, undefined, 'standard');
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        setSanctumOpen((prev) => !prev);
      } else if (e.code === 'KeyM') {
        const nextMuted = sound.toggleMute();
        setMuted(nextMuted);
      } else if (e.code === 'KeyZ') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyT') {
        setTouchControlsEnabled((prev) => !prev);
      } else if (e.code === 'KeyC') {
        cycleCameraPreset();
      } else if (e.code === 'KeyV') {
        toggleCameraAutoFollow();
      } else if (e.code === 'KeyR' && (gameState === 'playing' || gameState === 'paused')) {
        startPlaying(floor, Date.now() % 100000, activeRunMode);
      } else if (e.code === 'KeyH' && gameState === 'playing') {
        const potion = inventory.find((i) => i.id === 'pot_crimson_vial');
        if (potion && potion.quantity > 0) {
          setInventory((prev) =>
            prev.map((item) =>
              item.id === 'pot_crimson_vial'
                ? { ...item, quantity: Math.max(0, item.quantity - 1) }
                : item,
            ),
          );
          setHealTriggerCount((c) => c + 1);
          showToast('Purpur-Lebensessenz getrunken (+45 HP)');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    sanctumOpen,
    floor,
    activeRunMode,
    inventory,
    startPlaying,
    showToast,
    cycleCameraPreset,
    toggleCameraAutoFollow,
  ]);

  // Gameplay Callbacks
  const handleCollectGold = useCallback((amount: number) => {
    setGold((g) => g + amount);
    setXp((x) => x + Math.round(amount * 0.5));
    setTotalScore((s) => s + amount * 2);
  }, []);

  const handleOpenChest = useCallback(
    (goldAmount: number) => {
      setGold((g) => g + goldAmount);
      setXp((x) => x + 90);
      setChestsOpened((c) => c + 1);
      setTotalScore((s) => s + 250 + goldAmount * 2);
      showToast(`Schatztruhe geplündert: +${goldAmount} Gold & +90 XP!`);
    },
    [showToast],
  );

  const handleDiscoverSecret = useCallback(() => {
    setSecretsFound((s) => s + 1);
    setGold((g) => g + 250);
    setXp((x) => x + 320);
    setTotalScore((s) => s + 600);
    // Unlock the first Secret Reward item automatically if not yet unlocked
    setUnlockedSecretIds((prev) => {
      if (!prev.includes('sec_obsidian_crown')) {
        const sec = SECRET_REWARDS[0];
        setInventory((inv) =>
          inv.some((i) => i.id === sec.rewardItem.id) ? inv : [...inv, sec.rewardItem],
        );
        return [...prev, 'sec_obsidian_crown'];
      }
      return prev;
    });
    pushNotification(
      'reward',
      'Geheimer Runen-Altar entsiegelt!',
      'Du hast die geheime Belohnung „Krone des Stummen Königs“ und +320 XP erhalten!',
    );
  }, [pushNotification]);

  const handleEnemyKilled = useCallback(
    (archetype: EnemyArchetype) => {
      setKillsByArchetype((prev) => ({
        ...prev,
        [archetype]: prev[archetype] + 1,
      }));
      setXp((prevXp) => {
        const prevLvl = calculateLevelFromXp(prevXp).level;
        const nextXp = prevXp + 65;
        const nextLvl = calculateLevelFromXp(nextXp).level;
        if (nextLvl > prevLvl) {
          setSkillPoints((sp) => sp + (nextLvl - prevLvl));
          pushNotification(
            'reward',
            `Level-Up! Stufe ${nextLvl} erreicht!`,
            `Du hast +${nextLvl - prevLvl} Skill-Punkt(e) für dein Skill-System erhalten.`,
          );
        }
        return nextXp;
      });
      setTotalScore((s) => s + 120);
    },
    [pushNotification],
  );

  const handleSkillUsed = useCallback(() => {
    setSkillsUsedCount((c) => c + 1);
  }, []);

  const handleFloorCleared = useCallback(() => {
    const score = calculateRunScore({
      goldCollected: telemetry.runGold,
      enemiesSlain: telemetry.runKills,
      chestsOpened: telemetry.runChests,
      secretsFound: telemetry.runSecrets,
      floorReached: floor,
    });
    const nextBest = Math.max(totalScore, totalScore + Math.round(score * 0.25));
    setTotalScore(nextBest);
    setFloorsCompleted((f) => f + 1);
    setHighestFloor((hf) => Math.max(hf, floor + 1));
    setXp((x) => x + 220);
    setRunSnapshot({
      outcome: 'victory',
      floorReached: floor,
      runGold: telemetry.runGold,
      runKills: telemetry.runKills,
      runChests: telemetry.runChests,
      runSecrets: telemetry.runSecrets,
      runScore: score,
      bestScore: nextBest,
    });
    setGameState('gameover');
    document.body.dataset.state = 'gameover';
  }, [telemetry, floor, totalScore]);

  const handlePlayerDefeated = useCallback(() => {
    const score = calculateRunScore({
      goldCollected: telemetry.runGold,
      enemiesSlain: telemetry.runKills,
      chestsOpened: telemetry.runChests,
      secretsFound: telemetry.runSecrets,
      floorReached: floor,
    });
    setRunSnapshot({
      outcome: 'defeat',
      floorReached: floor,
      runGold: telemetry.runGold,
      runKills: telemetry.runKills,
      runChests: telemetry.runChests,
      runSecrets: telemetry.runSecrets,
      runScore: score,
      bestScore: Math.max(totalScore, score),
    });
    setGameState('gameover');
    document.body.dataset.state = 'gameover';
  }, [telemetry, floor, totalScore]);

  // Sanctum Handlers
  const handleEquipItem = (item: InventoryItem) => {
    if (item.slot === 'weapon') setEquippedWeaponId(item.id);
    if (item.slot === 'armor') setEquippedArmorId(item.id);
    if (item.slot === 'relic') setEquippedRelicId(item.id);
    showToast(`${item.name} ausgerüstet!`);
  };

  const handleUseConsumable = (item: InventoryItem) => {
    if (item.quantity <= 0) return;
    setInventory((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i)),
    );
    setHealTriggerCount((c) => c + 1);
    showToast(`${item.name} verwendet (+${item.healAmount} HP)`);
  };

  const handleUnlockSecretReward = (secretId: string) => {
    const sec = SECRET_REWARDS.find((s) => s.id === secretId);
    if (!sec || unlockedSecretIds.includes(secretId)) return;
    setUnlockedSecretIds((prev) => [...prev, secretId]);
    setSecretsFound((s) => s + 1);
    setInventory((prev) =>
      prev.some((i) => i.id === sec.rewardItem.id) ? prev : [...prev, sec.rewardItem],
    );
    sound.playSecretFound();
    pushNotification(
      'reward',
      'Geheime Belohnung freigeschaltet!',
      `${sec.rewardItem.name} wurde deinem Inventar hinzugefügt.`,
    );
  };

  const handleUpgradeSkill = (skillId: string) => {
    const node = SKILL_TREE.find((s) => s.id === skillId);
    if (!node) return;
    const currentRank = skillRanks[skillId] ?? 0;
    if (currentRank >= node.maxRank || skillPoints < node.costPerRank) return;
    setSkillPoints((sp) => sp - node.costPerRank);
    setSkillRanks((prev) => ({ ...prev, [skillId]: currentRank + 1 }));
    sound.playPickupGold();
    showToast(`${node.name} auf Rang ${currentRank + 1} verbessert!`);
  };

  const handleClaimQuest = (questId: string) => {
    const q = DAILY_AND_WEEKLY_QUESTS.find((item) => item.id === questId);
    if (!q || claimedQuestIds.includes(questId)) return;
    setClaimedQuestIds((prev) => [...prev, questId]);
    setGold((g) => g + q.rewardGold);
    setXp((prevXp) => {
      const prevLvl = calculateLevelFromXp(prevXp).level;
      const nextXp = prevXp + q.rewardXp;
      const nextLvl = calculateLevelFromXp(nextXp).level;
      if (nextLvl > prevLvl) {
        setSkillPoints((sp) => sp + (nextLvl - prevLvl));
      }
      return nextXp;
    });
    if (q.rewardSkillPoints) {
      setSkillPoints((sp) => sp + q.rewardSkillPoints!);
    }
    sound.playVictory();
    pushNotification(
      'reward',
      'Aufgabe abgeschlossen!',
      `${q.title}: +${q.rewardGold} Gold & +${q.rewardXp} XP erhalten.`,
    );
  };

  const handleClaimDailyLogin = (day: number) => {
    const d = DAILY_LOGIN_REWARDS.find((item) => item.day === day);
    if (!d || claimedLoginDays.includes(day)) return;
    setClaimedLoginDays((prev) => [...prev, day]);
    setGold((g) => g + d.rewardGold);
    setXp((x) => x + d.rewardXp);
    if (day === 3) setSkillPoints((sp) => sp + 1);
    if (day === 7) setSkillPoints((sp) => sp + 2);
    sound.playPickupGold();
    pushNotification(
      'reward',
      `Tägliche Login-Belohnung (Tag ${day}) eingelöst!`,
      `+${d.rewardGold} Gold & +${d.rewardXp} XP gutgeschrieben.`,
    );
  };

  const handleClaimAchievement = (achId: string) => {
    const ach = ACHIEVEMENTS.find((a) => a.id === achId);
    if (!ach || unlockedAchievementIds.includes(achId)) return;
    setUnlockedAchievementIds((prev) => [...prev, achId]);
    setGold((g) => g + ach.rewardGold);
    if (ach.rewardTitle) {
      setAvatar((prev) => ({ ...prev, avatarTitle: ach.rewardTitle! }));
    }
    sound.playVictory();
    pushNotification(
      'achievement',
      `Erfolg freigeschaltet: ${ach.title}`,
      `+${ach.rewardGold} Gold erhalten!`,
    );
  };

  // Cloud Save & Leaderboard Firestore Actions
  const handleSaveToCloud = async () => {
    if (!currentUser) {
      showToast('Bitte zuerst mit Google anmelden.');
      return;
    }
    const path = `saves/${currentUser.uid}`;
    const totalKills =
      killsByArchetype.swarmer + killsByArchetype.ranged + killsByArchetype.charger;
    const levelInfo = calculateLevelFromXp(xp);
    const payload = {
      uid: currentUser.uid,
      displayName: avatar.heroName.slice(0, 40),
      level: levelInfo.level,
      xp,
      gold,
      highestFloor,
      totalScore,
      skillPoints,
      equippedWeaponId: equippedWeaponId.slice(0, 64),
      equippedArmorId: equippedArmorId.slice(0, 64),
      equippedRelicId: equippedRelicId.slice(0, 64),
      avatarClass: avatar.avatarClass,
      avatarColor: avatar.avatarColor.slice(0, 16),
      avatarCrest: avatar.avatarCrest,
      avatarTitle: avatar.avatarTitle.slice(0, 48),
      enemiesSlain: totalKills,
      chestsOpened,
      secretsFound,
      dailyStreak,
      updatedAt: serverTimestamp(),
    };

    try {
      if (cloudSaveExists) {
        await updateDoc(doc(db, 'saves', currentUser.uid), payload);
      } else {
        const snap = await getDoc(doc(db, 'saves', currentUser.uid));
        if (snap.exists()) {
          setCloudSaveExists(true);
          await updateDoc(doc(db, 'saves', currentUser.uid), payload);
        } else {
          await setDoc(doc(db, 'saves', currentUser.uid), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          setCloudSaveExists(true);
        }
      }
      setCloudSyncStatus('✓ Cloud-Spielstand erfolgreich synchronisiert!');
      showToast('Spielstand in Firebase Cloud gespeichert!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleLoadFromCloud = async () => {
    if (!currentUser) return;
    const path = `saves/${currentUser.uid}`;
    try {
      const snap = await getDoc(doc(db, 'saves', currentUser.uid));
      if (!snap.exists()) {
        setCloudSyncStatus('Noch kein Cloud-Spielstand vorhanden.');
        return;
      }
      setCloudSaveExists(true);
      const data = snap.data();
      if (typeof data.xp === 'number') setXp(data.xp);
      if (typeof data.gold === 'number') setGold(data.gold);
      if (typeof data.highestFloor === 'number') setHighestFloor(data.highestFloor);
      if (typeof data.totalScore === 'number') setTotalScore(data.totalScore);
      if (typeof data.skillPoints === 'number') setSkillPoints(data.skillPoints);
      if (typeof data.equippedWeaponId === 'string') setEquippedWeaponId(data.equippedWeaponId);
      if (typeof data.equippedArmorId === 'string') setEquippedArmorId(data.equippedArmorId);
      if (typeof data.equippedRelicId === 'string') setEquippedRelicId(data.equippedRelicId);
      setAvatar({
        heroName: String(data.displayName || avatar.heroName),
        avatarClass: (data.avatarClass as AvatarConfig['avatarClass']) || avatar.avatarClass,
        avatarColor: String(data.avatarColor || avatar.avatarColor),
        avatarCrest: (data.avatarCrest as AvatarConfig['avatarCrest']) || avatar.avatarCrest,
        avatarTitle: String(data.avatarTitle || avatar.avatarTitle),
      });
      setCloudSyncStatus('✓ Spielstand erfolgreich aus der Cloud geladen!');
      showToast('Cloud-Spielstand geladen!');
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  };

  const handlePublishScoreToCloud = async () => {
    const totalKills =
      killsByArchetype.swarmer + killsByArchetype.ranged + killsByArchetype.charger;
    const newLocalRow: LeaderboardRow = {
      id: `local_${Date.now()}`,
      playerName: avatar.heroName,
      avatarClass: avatar.avatarClass,
      avatarColor: avatar.avatarColor,
      titleBadge: avatar.avatarTitle,
      score: totalScore,
      floorReached: highestFloor,
      enemiesSlain: totalKills,
      goldCollected: gold,
      mode: activeRunMode,
      isFriend: true,
    };
    setLeaderboard((prev) => [newLocalRow, ...prev.filter((r) => r.playerName !== avatar.heroName)]);

    if (currentUser) {
      const entryId = `entry_${currentUser.uid}`;
      try {
        const ref = doc(db, 'leaderboard', entryId);
        const snap = await getDoc(ref);
        const baseData = {
          uid: currentUser.uid,
          playerName: avatar.heroName.slice(0, 40),
          avatarClass: avatar.avatarClass,
          avatarColor: avatar.avatarColor.slice(0, 16),
          titleBadge: avatar.avatarTitle.slice(0, 48),
          score: totalScore,
          floorReached: highestFloor,
          enemiesSlain: totalKills,
          goldCollected: gold,
          mode: activeRunMode,
          updatedAt: serverTimestamp(),
        };
        if (snap.exists()) {
          await updateDoc(ref, baseData);
        } else {
          await setDoc(ref, { ...baseData, createdAt: serverTimestamp() });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `leaderboard/${entryId}`);
      }
    }
    showToast(`Rekord (${totalScore} Punkte) in Bestenliste eingetragen!`);
  };

  const handleSendChatMessage = async (
    channel: 'global' | 'gilde' | 'ereignisse',
    text: string,
  ) => {
    const cleanText = text.slice(0, 280);
    const localMsg: ChatRow = {
      id: `msg_${Date.now()}`,
      senderName: avatar.heroName,
      senderTitle: avatar.avatarTitle,
      avatarColor: avatar.avatarColor,
      channel,
      text: cleanText,
      timeLabel: 'Gerade eben',
    };
    setChatMessages((prev) => [...prev, localMsg]);

    if (currentUser) {
      try {
        await addDoc(collection(db, 'chatMessages'), {
          uid: currentUser.uid,
          senderName: avatar.heroName.slice(0, 40),
          senderTitle: avatar.avatarTitle.slice(0, 48),
          avatarColor: avatar.avatarColor.slice(0, 16),
          channel,
          text: cleanText,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'chatMessages');
      }
    }
  };

  const levelInfo = calculateLevelFromXp(xp);
  const unreadNotifs = notifications.filter((n) => !n.read).length;
  const potionCount = inventory.find((i) => i.id === 'pot_crimson_vial')?.quantity ?? 0;

  // Discrete 5 Vitality Sockets for World-Matched HUD
  const vitalityPips = useMemo(() => {
    const ratio = Math.max(0, Math.min(1, telemetry.hp / Math.max(1, telemetry.maxHp)));
    const pips: ('full' | 'cracked' | 'empty')[] = [];
    for (let i = 0; i < 5; i++) {
      const pipThreshold = (i + 1) / 5;
      const prevThreshold = i / 5;
      if (ratio >= pipThreshold - 0.05) pips.push('full');
      else if (ratio > prevThreshold + 0.04) pips.push('cracked');
      else pips.push('empty');
    }
    return pips;
  }, [telemetry.hp, telemetry.maxHp]);

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none bg-[#09080c]">
      {/* 1. Isolated 3D WebGL Dungeon Canvas */}
      <DungeonCanvas
        gameState={gameState}
        floor={floor}
        seedOverride={seedOverride}
        avatarColor={avatar.avatarColor}
        playerStats={computedPlayerStats}
        healTriggerCount={healTriggerCount}
        novaTriggerCount={novaTriggerCount}
        dashTriggerCount={dashTriggerCount}
        attackTriggerCount={attackTriggerCount}
        interactTriggerCount={interactTriggerCount}
        touchMoveVector={touchMoveVector}
        cameraPreset={cameraPreset}
        cameraRotateInput={cameraRotateInput}
        cameraZoomStepCount={cameraZoomStepCount}
        cameraZoomStepDir={cameraZoomStepDir}
        cameraResetTriggerCount={cameraResetTriggerCount}
        sprintEnabled={sprintEnabled}
        cameraAutoFollow={cameraAutoFollow}
        onTelemetryUpdate={setTelemetry}
        onCollectGold={handleCollectGold}
        onOpenChest={handleOpenChest}
        onDiscoverSecret={handleDiscoverSecret}
        onEnemyKilled={handleEnemyKilled}
        onSkillUsed={handleSkillUsed}
        onFloorCleared={handleFloorCleared}
        onPlayerDefeated={handlePlayerDefeated}
        onTogglePause={() =>
          setGameState((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev))
        }
      />

      {/* 2. Low-HP Critical Vignette */}
      {gameState === 'playing' && telemetry.hp > 0 && telemetry.hp / telemetry.maxHp < 0.3 && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            boxShadow: 'inset 0 0 110px 35px rgba(220, 38, 38, 0.45)',
          }}
        />
      )}

      {/* 3. TITLE SCREEN OVERLAY (Stage 1: Live World Camera Tour + Left-Third Negative Space Lockup) */}
      {gameState === 'title' && (
        <div
          className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-12 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(9,8,14,0.88) 0%, rgba(9,8,14,0.52) 40%, rgba(9,8,14,0.0) 75%)',
          }}
        >
          {/* Top-Right Quick Status */}
          <div className="flex items-center justify-end gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                setSanctumTab('challenges');
                setSanctumOpen(true);
              }}
              className="rounded-lg border border-amber-500/40 bg-[#15121f] px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-[#211c30] whitespace-nowrap"
            >
              Täglicher Login (Streak: {dailyStreak} Tage)
            </button>
            <button
              type="button"
              onClick={() => {
                setSanctumTab('chat_notifications');
                setSanctumOpen(true);
              }}
              className="rounded-lg border border-white/15 bg-[#15121f] px-3.5 py-2 text-xs font-semibold text-stone-200 hover:bg-[#211c30] whitespace-nowrap"
            >
              Meldungen & Chat ({unreadNotifs})
            </button>
          </div>

          {/* Left-Third Asymmetric Title Lockup & Primary Start CTA */}
          <div className="my-auto max-w-2xl space-y-6 pointer-events-auto">
            {/* Bespoke Inline SVG Dungeon Crest & Title Emblem */}
            <div className="space-y-3">
              <svg
                viewBox="0 0 420 118"
                className="w-full max-w-[420px] drop-shadow-[0_6px_20px_rgba(0,0,0,0.85)]"
                role="img"
                aria-label="Abyssal Labyrinth: Relics of the Deep"
              >
                {/* Heraldic Shield & Crossed Blades Emblem */}
                <g transform="translate(8, 10)">
                  <path
                    d="M44 4 L80 18 V50 C80 74 64 91 44 98 C24 91 8 74 8 50 V18 Z"
                    fill="#181326"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M44 14 L70 24 V48 C70 67 58 80 44 86 C30 80 18 67 18 48 V24 Z"
                    fill="#261e3a"
                    stroke="#fde68a"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M44 22 L52 44 L44 76 L36 44 Z"
                    fill={avatar.avatarColor}
                    stroke="#fef08a"
                    strokeWidth="1.2"
                  />
                  <circle cx="44" cy="44" r="6" fill="#fef08a" />
                </g>

                {/* Engraved Typography Lockup */}
                <text
                  x="104"
                  y="36"
                  fill="#f59e0b"
                  fontFamily="Cinzel, serif"
                  fontSize="13"
                  fontWeight="700"
                  letterSpacing="4"
                >
                  RELICS OF THE DEEP
                </text>
                <text
                  x="102"
                  y="74"
                  fill="#ffffff"
                  fontFamily="Cinzel, serif"
                  fontSize="34"
                  fontWeight="800"
                  letterSpacing="2"
                >
                  ABYSSAL
                </text>
                <text
                  x="104"
                  y="104"
                  fill="#fde68a"
                  fontFamily="Cinzel, serif"
                  fontSize="26"
                  fontWeight="700"
                  letterSpacing="5"
                >
                  LABYRINTH
                </text>
              </svg>

              <p className="text-sm text-stone-300 max-w-md leading-relaxed">
                Erkunde prozedurale 3D-Katakomben, bezwinge taktische Wächter-Archetypen, meistere dein Skill-System und sichere dir geheimnisvolle Relikte in der globalen Bestenliste.
              </p>
            </div>

            {/* <= 3 Menu Actions Total */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={() => startPlaying(floor, undefined, 'standard')}
                className="rounded-lg bg-amber-500 px-6 py-3.5 font-['Cinzel'] text-sm font-extrabold tracking-wider text-black shadow-lg hover:bg-amber-400 transition-transform active:scale-95 whitespace-nowrap shrink-0"
              >
                Abstieg beginnen (Ebene {floor})
              </button>

              <button
                type="button"
                onClick={() => startPlaying(2, 20261027, 'daily')}
                className="rounded-lg border border-amber-400/40 bg-[#1a1626] px-4 py-3.5 text-xs font-bold text-amber-200 hover:bg-[#262038] transition-colors whitespace-nowrap shrink-0"
              >
                Tägliche Herausforderung
              </button>

              <button
                type="button"
                onClick={() => {
                  setSanctumTab('inventory');
                  setSanctumOpen(true);
                }}
                className="rounded-lg border border-white/20 bg-[#14111d] px-4 py-3.5 text-xs font-bold text-stone-200 hover:bg-[#211c30] transition-colors whitespace-nowrap shrink-0"
              >
                Helden-Kodex & Cloud
              </button>
            </div>
          </div>

          {/* Flat Borderless Single-Line Control Hint in Bottom Safe Margin */}
          <div className="text-xs text-stone-400 tracking-wide">
            360° WASD / Touch-Stick / Boden-Klick Bewegen · Shift Sprint · Maus-Drag / [,] [.] Kamera · [C] Perspektive · [V] Auto-Kamera · Leertaste Angriff
          </div>
        </div>
      )}

      {/* 4. PLAYING HUD (World-Matched, Low-Occlusion Perimeter Clusters, Zero backdrop-filter) */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-20 pointer-events-none">
          {/* Top-Left Cluster: Hero Emblem, Vitality Pips, Continuous HP Bar, Level/Gold/Score */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-start gap-2.5 sm:gap-3 rounded-xl border border-amber-500/30 bg-[#120f1ae8] p-2.5 sm:p-3.5 shadow-xl pointer-events-auto max-w-[calc(100vw-150px)] sm:max-w-none">
            <button
              type="button"
              onClick={() => {
                setSanctumTab('skills_avatar');
                setSanctumOpen(true);
              }}
              aria-label="Helden-Avatar und Skills öffnen"
              className="hidden sm:flex h-12 w-12 items-center justify-center rounded-lg border border-amber-400/50 bg-[#1c1729] shrink-0"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7">
                <path
                  d="M12 2L19 6V12C19 16.5 15.8 20.6 12 22C8.2 20.6 5 16.5 5 12V6L12 2Z"
                  fill={avatar.avatarColor}
                  stroke="#fef08a"
                  strokeWidth="1.6"
                />
              </svg>
            </button>

            <div className="space-y-1 sm:space-y-1.5 min-w-[175px] sm:min-w-[235px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-['Cinzel'] text-[11px] sm:text-xs font-bold text-amber-200 truncate">
                  {avatar.heroName}
                </span>
                <span className="font-mono text-[10px] sm:text-[11px] font-bold text-amber-400 tabular-nums shrink-0">
                  STUFE {levelInfo.level}
                </span>
              </div>

              {/* 5 Discrete Vitality Sockets + Numeric HP Readout */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" aria-label="Lebenspunkte-Kristalle">
                  {vitalityPips.map((state, idx) => (
                    <svg key={idx} viewBox="0 0 18 18" className="h-3.5 w-3.5 sm:h-4 sm:w-4">
                      <polygon
                        points="9,1 16,6 13,16 5,16 2,6"
                        fill={
                          state === 'full'
                            ? '#ef4444'
                            : state === 'cracked'
                              ? '#f97316'
                              : '#1f1b29'
                        }
                        stroke="#fca5a5"
                        strokeWidth="1.3"
                      />
                    </svg>
                  ))}
                </div>
                <span
                  className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums"
                  style={{ paintOrder: 'stroke fill' }}
                >
                  {telemetry.hp}/{telemetry.maxHp} HP
                </span>
              </div>

              {/* Continuous Health Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/70 border border-white/10">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{
                    width: `${Math.max(0, Math.min(100, (telemetry.hp / Math.max(1, telemetry.maxHp)) * 100))}%`,
                  }}
                />
              </div>

              {/* Compact Metric Strip */}
              <div className="flex items-center justify-between pt-0.5 text-[10px] sm:text-[11px] font-mono text-stone-300 tabular-nums">
                <span className="text-amber-300 font-bold">{gold} GOLD</span>
                <span>·</span>
                <span>EBENE {floor}</span>
                <span>·</span>
                <span className="text-sky-300">{totalScore} PKT</span>
              </div>
            </div>
          </div>

          {/* Top-Right Cluster: Live Navigable Minimap + Compact Square Utility Icon Buttons */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-start gap-2 pointer-events-auto">
            {/* Real Navigable Dungeon Minimap (Hidden on narrow <480px screens to prevent top-bar collision, visible on sm+) */}
            <div
              className="hidden sm:block rounded-xl border border-amber-500/30 bg-[#120f1ae8] p-2.5 shadow-xl"
              aria-label="Labyrinth-Minikarte"
            >
              <div className="mb-1 flex items-center justify-between text-[10px] font-mono text-stone-300 tabular-nums">
                <span>TIEFE #{floor}</span>
                <span className="text-amber-300">KAM {telemetry.cameraYawDeg}°</span>
              </div>
              <svg
                viewBox={`0 0 ${telemetry.dungeon.width} ${telemetry.dungeon.height}`}
                className="h-24 w-24 rounded bg-[#08070c] border border-white/10"
              >
                {telemetry.dungeon.grid.map((row, gz) =>
                  row.map((cell, gx) =>
                    cell !== 'wall' ? (
                      <rect
                        key={`${gx}_${gz}`}
                        x={gx}
                        y={gz}
                        width={1}
                        height={1}
                        fill={
                          cell === 'exit'
                            ? '#38bdf8'
                            : cell === 'secret'
                              ? '#c084fc'
                              : '#2d283e'
                        }
                      />
                    ) : null,
                  ),
                )}
                {/* Active Treasures & Altars */}
                {telemetry.activePropCoords.map((p, i) => (
                  <circle
                    key={`p_${i}`}
                    cx={p.x + 0.5}
                    cy={p.z + 0.5}
                    r={0.55}
                    fill={
                      p.type === 'secret_altar'
                        ? '#c084fc'
                        : p.type === 'shrine'
                          ? '#34d399'
                          : '#fbbf24'
                    }
                  />
                ))}
                {/* Active Enemies */}
                {telemetry.activeEnemyCoords.map((e, i) => (
                  <circle
                    key={`e_${i}`}
                    cx={e.x + 0.5}
                    cy={e.z + 0.5}
                    r={0.6}
                    fill="#ef4444"
                  />
                ))}
                {/* Exit Portal Marker */}
                <circle
                  cx={telemetry.dungeon.exit.gx + 0.5}
                  cy={telemetry.dungeon.exit.gz + 0.5}
                  r={0.85}
                  fill="#38bdf8"
                />
                {/* Player Position Marker */}
                <circle
                  cx={telemetry.playerGridX + 0.5}
                  cy={telemetry.playerGridZ + 0.5}
                  r={0.9}
                  fill="#fef08a"
                  stroke="#000"
                  strokeWidth={0.25}
                />
              </svg>
            </div>

            {/* Compact Square SVG Utility Controls (tabIndex={-1} + blur on click) */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Helden-Kodex öffnen [Tab]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setSanctumOpen(true);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/40 bg-[#120f1ae8] text-amber-300 hover:bg-[#231d33]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Ton einschalten [M]' : 'Ton stummschalten [M]'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  const next = sound.toggleMute();
                  setMuted(next);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#120f1ae8] text-stone-200 hover:bg-[#231d33]"
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={
                  dockCollapsed
                    ? 'Aktionsleiste einblenden [Z]'
                    : 'Aktionsleiste ausblenden [Z]'
                }
                onClick={(e) => {
                  e.currentTarget.blur();
                  setDockCollapsed((prev) => !prev);
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  !dockCollapsed
                    ? 'border-amber-400/60 bg-[#231c35] text-amber-300'
                    : 'border-white/15 bg-[#120f1ae8] text-stone-300'
                } hover:bg-[#2a2240]`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="14" width="18" height="6" rx="2" />
                  <path d="M7 17h2M11 17h2M15 17h2" />
                  <path d="M12 5v6M9 8l3-3 3 3" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={
                  touchControlsEnabled
                    ? 'Touch-Steuerung ausblenden [T]'
                    : 'Touch-Steuerung einblenden [T]'
                }
                onClick={(e) => {
                  e.currentTarget.blur();
                  setTouchControlsEnabled((prev) => !prev);
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  touchControlsEnabled
                    ? 'border-amber-400/60 bg-[#231c35] text-amber-300'
                    : 'border-white/15 bg-[#120f1ae8] text-stone-300'
                } hover:bg-[#2a2240]`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="6" width="20" height="12" rx="3" />
                  <path d="M6 12h4M8 10v4" />
                  <circle cx="15" cy="11" r="1" fill="currentColor" />
                  <circle cx="18" cy="13" r="1" fill="currentColor" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Spiel pausieren [P]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setGameState('paused');
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#120f1ae8] text-stone-200 hover:bg-[#231d33]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>
            </div>
          </div>

          {/* On-Screen Ergonomic Touch Controls (Left Virtual Joystick + D-Pad & Right Multi-Touch Camera + Action Cluster) */}
          <TouchControlsOverlay
            visible={touchControlsEnabled}
            dashCooldown={telemetry.dashCooldown}
            novaCooldown={telemetry.novaCooldown}
            potionCount={potionCount}
            nearbyPrompt={telemetry.nearbyPrompt}
            attackDamage={computedPlayerStats.attackDamage}
            novaDamage={computedPlayerStats.novaDamage}
            cameraPresetLabel={CAMERA_PRESETS[cameraPreset].label}
            cameraYawDeg={telemetry.cameraYawDeg}
            sprintEnabled={sprintEnabled}
            cameraAutoFollow={cameraAutoFollow}
            onMoveVectorChange={setTouchMoveVector}
            onCameraRotateChange={setCameraRotateInput}
            onCycleCameraPreset={cycleCameraPreset}
            onResetCamera={handleResetCamera}
            onToggleSprint={toggleSprint}
            onToggleCameraAutoFollow={toggleCameraAutoFollow}
            onAttack={() => setAttackTriggerCount((c) => c + 1)}
            onDash={() => setDashTriggerCount((c) => c + 1)}
            onNova={() => setNovaTriggerCount((c) => c + 1)}
            onHeal={() => {
              const pot = inventory.find((i) => i.id === 'pot_crimson_vial');
              if (pot) handleUseConsumable(pot);
            }}
            onInteract={() => setInteractTriggerCount((c) => c + 1)}
          />

          {/* Center-Bottom Context Interaction Prompt (Chest / Shrine / Secret Altar / Exit Portal) */}
          {telemetry.nearbyPrompt && (
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
              <button
                type="button"
                onClick={() => setInteractTriggerCount((c) => c + 1)}
                className="rounded-lg border border-amber-400 bg-[#171224f2] px-5 py-2.5 font-['Cinzel'] text-xs font-bold text-amber-200 shadow-2xl hover:bg-[#251d38] whitespace-nowrap"
              >
                {telemetry.nearbyPrompt}
              </button>
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock (Hidden by default so the 3D scene is 100% unobstructed; toggleable via [Z] or top-right button) */}
          {!dockCollapsed && (
            <div
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto"
              style={{ maxWidth: 'min(960px, 95vw)' }}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setDockCollapsed(true);
                }}
                className="mb-1 rounded-t-lg border border-b-0 border-white/15 bg-[#120f1ae8] px-3.5 py-1 text-[11px] font-semibold text-stone-300 hover:text-white whitespace-nowrap"
              >
                ▾ Aktionsleiste ausblenden [Z]
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-[#120f1af0] px-4 py-2.5 shadow-2xl">
                {/* Combat Action Slots */}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setAttackTriggerCount((c) => c + 1);
                  }}
                  className="rounded-lg border border-amber-500/40 bg-[#1e182d] px-3 py-1.5 text-left hover:bg-[#2a223d] whitespace-nowrap"
                >
                  <div className="text-[10px] font-mono text-amber-400">[LEERTASTE]</div>
                  <div className="text-xs font-bold text-white">
                    Klingenstreich · {computedPlayerStats.attackDamage} ANG
                  </div>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setDashTriggerCount((c) => c + 1);
                  }}
                  className="rounded-lg border border-sky-500/40 bg-[#171d2e] px-3 py-1.5 text-left hover:bg-[#212b42] whitespace-nowrap"
                >
                  <div className="text-[10px] font-mono text-sky-400 tabular-nums">
                    [Q] {telemetry.dashCooldown > 0 ? `${telemetry.dashCooldown.toFixed(1)}s` : 'BEREIT'}
                  </div>
                  <div className="text-xs font-bold text-white">Schattenschritt · Dash</div>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setNovaTriggerCount((c) => c + 1);
                  }}
                  className="rounded-lg border border-purple-500/40 bg-[#21172e] px-3 py-1.5 text-left hover:bg-[#2e2040] whitespace-nowrap"
                >
                  <div className="text-[10px] font-mono text-purple-300 tabular-nums">
                    [F] {telemetry.novaCooldown > 0 ? `${telemetry.novaCooldown.toFixed(1)}s` : 'BEREIT'}
                  </div>
                  <div className="text-xs font-bold text-white">
                    Arkane Nova · {computedPlayerStats.novaDamage} AoE
                  </div>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  disabled={potionCount <= 0}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    const pot = inventory.find((i) => i.id === 'pot_crimson_vial');
                    if (pot) handleUseConsumable(pot);
                  }}
                  className="rounded-lg border border-emerald-500/40 bg-[#142620] px-3 py-1.5 text-left hover:bg-[#1c362d] disabled:opacity-40 whitespace-nowrap"
                >
                  <div className="text-[10px] font-mono text-emerald-400 tabular-nums">
                    [H] VORRAT: {potionCount}x
                  </div>
                  <div className="text-xs font-bold text-white">Essenz · +45 HP</div>
                </button>

                {/* Sprint Toggle + Dock Camera Control Group (Perspective Preset, Zoom In/Out, Auto-Follow) */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Dauer-Sprint umschalten [Shift]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    toggleSprint();
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-left whitespace-nowrap transition-colors ${
                    sprintEnabled
                      ? 'border-amber-300 bg-amber-500/25 text-amber-200'
                      : 'border-amber-500/30 bg-[#1a1526] text-stone-200 hover:bg-[#251e36]'
                  }`}
                >
                  <div className="text-[9px] font-mono text-amber-400">[SHIFT] SPRINT</div>
                  <div className="text-[11px] font-bold text-white">
                    {sprintEnabled ? 'Aktiv (+38%)' : 'Normal'}
                  </div>
                </button>

                <div className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-[#1a1526] px-2 py-1">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Kamera Heranzoomen [+]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleZoomCamera('in');
                    }}
                    className="rounded px-1.5 py-1 font-mono text-xs font-bold text-amber-300 hover:bg-white/10"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      cycleCameraPreset();
                    }}
                    className="px-1.5 py-0.5 text-left hover:bg-white/5 rounded whitespace-nowrap"
                  >
                    <div className="text-[9px] font-mono text-amber-400 tabular-nums">
                      [C] KAMERA · {telemetry.cameraYawDeg}°
                    </div>
                    <div className="text-[11px] font-bold text-white">
                      {CAMERA_PRESETS[cameraPreset].label}
                    </div>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Kamera Wegzoomen [-]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleZoomCamera('out');
                    }}
                    className="rounded px-1.5 py-1 font-mono text-xs font-bold text-amber-300 hover:bg-white/10"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Kamera-Folgemodus [V]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      toggleCameraAutoFollow();
                    }}
                    className={`ml-0.5 rounded px-1.5 py-1 font-mono text-[10px] font-bold ${
                      cameraAutoFollow
                        ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                        : 'text-stone-300 hover:bg-white/10'
                    }`}
                  >
                    {cameraAutoFollow ? 'AUTO' : 'FREI'}
                  </button>
                </div>

                <div className="h-7 w-px bg-white/10 mx-1 hidden sm:block" />

                {/* Sanctum Meta-System Quick Openers */}
                {(
                  [
                    { tab: 'inventory', label: 'Inventar' },
                    { tab: 'skills_avatar', label: `Skills (${skillPoints})` },
                    { tab: 'challenges', label: 'Quests & Events' },
                    { tab: 'leaderboard', label: 'Bestenliste' },
                    { tab: 'dashboard_cloud', label: 'Statistik & Cloud' },
                    { tab: 'chat_notifications', label: `Chat (${unreadNotifs})` },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.tab}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setSanctumTab(btn.tab);
                      setSanctumOpen(true);
                    }}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-200 hover:bg-white/15 whitespace-nowrap"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. PAUSE MODAL (document.body.dataset.state === 'paused') */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Spiel pausiert"
        >
          <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#13101c] p-6 text-center shadow-2xl">
            <p className="text-xs font-mono uppercase tracking-widest text-amber-400">
              Expedition unterbrochen
            </p>
            <h2 className="mt-1 font-['Cinzel'] text-2xl font-bold text-white">
              Labyrinth Pausiert
            </h2>

            <div className="mt-5 grid grid-cols-3 gap-2.5 font-mono tabular-nums">
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="text-[11px] text-stone-400 font-sans">Ebene</div>
                <div className="mt-0.5 text-lg font-bold text-amber-300">{floor}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="text-[11px] text-stone-400 font-sans">Lauf-Gold</div>
                <div className="mt-0.5 text-lg font-bold text-white">{telemetry.runGold}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="text-[11px] text-stone-400 font-sans">Besiegt</div>
                <div className="mt-0.5 text-lg font-bold text-emerald-400">
                  {telemetry.runKills}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => setGameState('playing')}
                className="w-full rounded-lg bg-amber-500 px-5 py-3 font-['Cinzel'] text-sm font-bold text-black hover:bg-amber-400 transition-colors"
              >
                Fortsetzen [Esc]
              </button>
              <button
                type="button"
                onClick={() => startPlaying(floor, Date.now() % 100000, activeRunMode)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-bold text-stone-200 hover:bg-white/15"
              >
                Ebene neu generieren [R]
              </button>
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-5 py-2.5 text-xs text-stone-400 hover:text-white"
              >
                Zum Titelbildschirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. VICTORY / FLOOR CLEAR OR GAME OVER MODAL (document.body.dataset.state === 'gameover') */}
      {gameState === 'gameover' && runSnapshot && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/85 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label={runSnapshot.outcome === 'victory' ? 'Ebene gemeistert' : 'Niederlage'}
        >
          <div className="w-full max-w-lg rounded-xl border border-amber-500/45 bg-[#13101c] p-6 text-center shadow-2xl">
            <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
              {runSnapshot.outcome === 'victory'
                ? `Ebene ${runSnapshot.floorReached} erfolgreich bezwungen`
                : `Auf Ebene ${runSnapshot.floorReached} gefallen`}
            </div>
            <h2 className="mt-1 font-['Cinzel'] text-2xl font-bold text-white">
              {runSnapshot.outcome === 'victory'
                ? 'Tiefen-Portal Durchschritten!'
                : 'Die Schatten Haben Gesiegt'}
            </h2>

            {/* 3 Tabular-Nums Mastery / Progress Stat Tiles */}
            <div className="mt-5 grid grid-cols-3 gap-3 font-mono tabular-nums">
              <div className="rounded-lg border border-white/10 bg-black/40 p-3.5">
                <div className="text-[11px] text-stone-400 font-sans">Lauf-Score / Best</div>
                <div className="mt-1 text-base font-bold text-amber-300">
                  {runSnapshot.runScore} / {runSnapshot.bestScore}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3.5">
                <div className="text-[11px] text-stone-400 font-sans">Geborgenes Gold</div>
                <div className="mt-1 text-base font-bold text-white">
                  +{runSnapshot.runGold} G
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3.5">
                <div className="text-[11px] text-stone-400 font-sans">Wächter & Truhen</div>
                <div className="mt-1 text-base font-bold text-emerald-400">
                  {runSnapshot.runKills} Kills · {runSnapshot.runChests} Truhen
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              {runSnapshot.outcome === 'victory' ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startPlaying(floor + 1, undefined, activeRunMode)}
                  className="flex-1 rounded-lg bg-amber-500 px-5 py-3 font-['Cinzel'] text-sm font-bold text-black hover:bg-amber-400 transition-colors"
                >
                  Nächste Tiefe betreten (Ebene {floor + 1})
                </button>
              ) : (
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startPlaying(floor, Date.now() % 100000, activeRunMode)}
                  className="flex-1 rounded-lg bg-amber-500 px-5 py-3 font-['Cinzel'] text-sm font-bold text-black hover:bg-amber-400 transition-colors"
                >
                  Erneut versuchen (Ebene {floor})
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setSharePayload({
                    title:
                      runSnapshot.outcome === 'victory'
                        ? `Ebene ${runSnapshot.floorReached} in Abyssal Labyrinth bezwungen!`
                        : `Kampfbericht aus Ebene ${runSnapshot.floorReached}`,
                    subtitle: `${runSnapshot.runKills} Wächter besiegt und ${runSnapshot.runGold} Goldmünzen geborgen!`,
                    score: runSnapshot.bestScore,
                    floor: runSnapshot.floorReached,
                    heroName: avatar.heroName,
                    heroTitle: avatar.avatarTitle,
                    avatarColor: avatar.avatarColor,
                  })
                }
                className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-xs font-bold text-amber-200 hover:bg-amber-500/25 whitespace-nowrap"
              >
                Ergebnis teilen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SANCTUM MODAL (Inventory, Secret Rewards, Skills, Avatar, Quests/Weekly Events, Leaderboard, Cloud Save, Dashboard, Chat) */}
      <SanctumModal
        isOpen={sanctumOpen}
        activeTab={sanctumTab}
        onSelectTab={setSanctumTab}
        onClose={() => setSanctumOpen(false)}
        xp={xp}
        gold={gold}
        skillPoints={skillPoints}
        highestFloor={highestFloor}
        totalScore={totalScore}
        floorsCompleted={floorsCompleted}
        skillsUsedCount={skillsUsedCount}
        chestsOpened={chestsOpened}
        secretsFound={secretsFound}
        killsByArchetype={killsByArchetype}
        inventory={inventory}
        equippedWeaponId={equippedWeaponId}
        equippedArmorId={equippedArmorId}
        equippedRelicId={equippedRelicId}
        unlockedSecretIds={unlockedSecretIds}
        onEquipItem={handleEquipItem}
        onUseConsumable={handleUseConsumable}
        onUnlockSecretReward={handleUnlockSecretReward}
        skillRanks={skillRanks}
        onUpgradeSkill={handleUpgradeSkill}
        avatar={avatar}
        onUpdateAvatar={setAvatar}
        claimedQuestIds={claimedQuestIds}
        onClaimQuest={handleClaimQuest}
        dailyStreak={dailyStreak}
        claimedLoginDays={claimedLoginDays}
        onClaimDailyLogin={handleClaimDailyLogin}
        onStartDailyChallenge={() => {
          showToast('Tägliche Herausforderung (Seed #20261027) gestartet!');
          startPlaying(2, 20261027, 'daily');
        }}
        onStartWeeklyEventRun={() => {
          showToast('Wochen-Event „Blutmond-Expedition“ gestartet!');
          startPlaying(3, 7772026, 'weekly');
        }}
        leaderboard={leaderboard}
        unlockedAchievementIds={unlockedAchievementIds}
        onClaimAchievement={handleClaimAchievement}
        onPublishScoreToCloud={() => void handlePublishScoreToCloud()}
        onOpenShareModal={(payload) => setSharePayload(payload)}
        userDisplayName={currentUser?.displayName || null}
        isAuthenticated={Boolean(currentUser)}
        cloudSyncStatus={cloudSyncStatus}
        onSignInGoogle={() => void signInWithGoogle()}
        onSignOutGoogle={() => void signOutUser()}
        onSaveToCloud={() => void handleSaveToCloud()}
        onLoadFromCloud={() => void handleLoadFromCloud()}
        chatMessages={chatMessages}
        onSendChatMessage={(ch, txt) => void handleSendChatMessage(ch, txt)}
        notifications={notifications}
        onMarkNotificationsRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
      />

      {/* 8. SOCIAL SHARE MODAL */}
      <SocialShareModal
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
        onShareToInGameChat={(msg) => void handleSendChatMessage('global', msg)}
      />

      {/* 9. NON-INTRUSIVE NOTIFICATION TOAST */}
      {toastBanner && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-amber-400/50 bg-[#171224f5] px-4 py-2 text-xs font-semibold text-amber-200 shadow-xl pointer-events-none"
        >
          {toastBanner}
        </div>
      )}
    </main>
  );
}
