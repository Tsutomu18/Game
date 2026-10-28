export type ItemSlot = 'weapon' | 'armor' | 'relic' | 'consumable';
export type ItemRarity = 'gewoehnlich' | 'selten' | 'episch' | 'legendaer' | 'mythisch';

export interface InventoryItem {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  description: string;
  attackBonus: number;
  defenseBonus: number;
  critBonus: number;
  speedBonus: number;
  healAmount?: number;
  quantity: number;
  isSecret?: boolean;
}

export interface SkillNode {
  id: string;
  branch: 'klingenpfad' | 'runenpfad' | 'schattenpfad';
  name: string;
  description: string;
  maxRank: number;
  effectPerRank: string;
  costPerRank: number;
}

export interface QuestTask {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  metric: 'gold' | 'kills' | 'chests' | 'floors' | 'skillsUsed' | 'secrets';
  rewardGold: number;
  rewardXp: number;
  rewardSkillPoints?: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  target: number;
  metric: 'kills' | 'gold' | 'highestFloor' | 'chests' | 'secrets' | 'level' | 'dailyStreak' | 'totalScore';
  rewardTitle?: string;
  rewardGold: number;
  shareBannerText: string;
}

export interface SecretRewardDef {
  id: string;
  title: string;
  hint: string;
  lore: string;
  rewardItem: InventoryItem;
}

export interface DailyLoginDay {
  day: number;
  label: string;
  rewardGold: number;
  rewardXp: number;
  bonusItemName?: string;
}

export interface NotificationItem {
  id: string;
  category: 'challenge' | 'chat' | 'achievement' | 'reward' | 'event';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface AvatarConfig {
  heroName: string;
  avatarClass: 'klingenmeister' | 'runenmagier' | 'schattenlaeufer';
  avatarColor: string;
  avatarCrest: 'phoenix' | 'drache' | 'krone' | 'abyss';
  avatarTitle: string;
}

export const INITIAL_ITEMS: InventoryItem[] = [
  {
    id: 'wpn_iron_longsword',
    name: 'Geschmiedete Tiefenklinge',
    slot: 'weapon',
    rarity: 'gewoehnlich',
    description: 'Solides Langschwert der Katakomben-Wächter mit ausgewogener Schwungmasse.',
    attackBonus: 18,
    defenseBonus: 2,
    critBonus: 5,
    speedBonus: 0,
    quantity: 1,
  },
  {
    id: 'wpn_sunfire_halberd',
    name: 'Glutkern-Hellebarde',
    slot: 'weapon',
    rarity: 'selten',
    description: 'Schwere Stangenwaffe, deren Runenschneide Rüstungen der Gruft-Wächter spaltet.',
    attackBonus: 29,
    defenseBonus: 5,
    critBonus: 10,
    speedBonus: -2,
    quantity: 1,
  },
  {
    id: 'wpn_abyss_reaver',
    name: 'Seelenspalter von Noctis',
    slot: 'weapon',
    rarity: 'episch',
    description: 'Aus schwarzem Sternenmetall geschmiedet; erhöht kritische Treffer drastisch.',
    attackBonus: 42,
    defenseBonus: 4,
    critBonus: 18,
    speedBonus: 4,
    quantity: 1,
  },
  {
    id: 'arm_warden_plate',
    name: 'Schieferplatten-Harnisch',
    slot: 'armor',
    rarity: 'gewoehnlich',
    description: 'Verstärkte Basaltrüstung gegen Hiebe und Stachelfallen.',
    attackBonus: 0,
    defenseBonus: 16,
    critBonus: 0,
    speedBonus: 0,
    quantity: 1,
  },
  {
    id: 'arm_astral_mantle',
    name: 'Astralrunen-Gewand',
    slot: 'armor',
    rarity: 'episch',
    description: 'Mit Silberfäden durchwebter Mantel, der Bewegung und Verteidigung vereint.',
    attackBonus: 8,
    defenseBonus: 28,
    critBonus: 8,
    speedBonus: 6,
    quantity: 1,
  },
  {
    id: 'rel_ember_compass',
    name: 'Glutstein-Kompass',
    slot: 'relic',
    rarity: 'selten',
    description: 'Leuchtet in der Nähe von Schatzkammern und erhöht kritische Präzision.',
    attackBonus: 6,
    defenseBonus: 6,
    critBonus: 12,
    speedBonus: 5,
    quantity: 1,
  },
  {
    id: 'pot_crimson_vial',
    name: 'Purpur-Lebensessenz',
    slot: 'consumable',
    rarity: 'gewoehnlich',
    description: 'Stellt sofort 45 Lebenspunkte im Kampf wieder her (Taste [H] oder Inventar).',
    attackBonus: 0,
    defenseBonus: 0,
    critBonus: 0,
    speedBonus: 0,
    healAmount: 45,
    quantity: 3,
  },
];

export const SECRET_REWARDS: SecretRewardDef[] = [
  {
    id: 'sec_obsidian_crown',
    title: 'Geheimes Relikt: Krone des Stummen Königs',
    hint: 'Aktiviere einen verborgenen Runen-Altar im 3D-Labyrinth (Taste [E] am violetten Obelisken).',
    lore: 'Tief unter den ersten Gewölben ruht das Siegel des ersten Architekten.',
    rewardItem: {
      id: 'rel_silent_king_crown',
      name: 'Krone des Stummen Königs',
      slot: 'relic',
      rarity: 'mythisch',
      description: 'Geheime Belohnung: +25 Angriff, +20 Verteidigung, +15% Krit-Chance.',
      attackBonus: 25,
      defenseBonus: 20,
      critBonus: 15,
      speedBonus: 8,
      quantity: 1,
      isSecret: true,
    },
  },
  {
    id: 'sec_starlight_blade',
    title: 'Geheime Waffe: Klinge des Sternenrisses',
    hint: 'Erreiche mindestens Ebene 3 oder sammle über 600 Gold in den Katakomben.',
    lore: 'Nur wer dem Ruf der tiefen Schatzkammern folgt, erweckt den Sternenriss.',
    rewardItem: {
      id: 'wpn_starlight_rift',
      name: 'Klinge des Sternenrisses',
      slot: 'weapon',
      rarity: 'mythisch',
      description: 'Geheime Belohnung: Legendäre Runenklinge mit enormer Durchschlagskraft.',
      attackBonus: 58,
      defenseBonus: 10,
      critBonus: 24,
      speedBonus: 8,
      quantity: 1,
      isSecret: true,
    },
  },
  {
    id: 'sec_phantom_aegis',
    title: 'Geheime Rüstung: Ägis der Schattenwache',
    hint: 'Besiege insgesamt 12 Gegner in den Labyrinthen.',
    lore: 'Geschmiedet aus den Essenzen gefallener Abgrund-Kolosse.',
    rewardItem: {
      id: 'arm_phantom_aegis',
      name: 'Ägis der Schattenwache',
      slot: 'armor',
      rarity: 'legendaer',
      description: 'Geheime Belohnung: Verleiht unerschütterliche Verteidigung und Agilität.',
      attackBonus: 14,
      defenseBonus: 42,
      critBonus: 10,
      speedBonus: 10,
      quantity: 1,
      isSecret: true,
    },
  },
];

export const SKILL_TREE: SkillNode[] = [
  {
    id: 'sk_whirlwind_edge',
    branch: 'klingenpfad',
    name: 'Wirbelklinge',
    description: 'Erhöht den Nahkampfschaden und den Schwungradius deiner Waffe.',
    maxRank: 5,
    effectPerRank: '+12% Nahkampfschaden & +0.25m Reichweite pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_sunder_strike',
    branch: 'klingenpfad',
    name: 'Schwerer Durchbruch',
    description: 'Steigert die Chance auf kritische Treffer und den Krit-Multiplikator.',
    maxRank: 5,
    effectPerRank: '+6% Krit-Chance & +15% Krit-Schaden pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_blood_siphon',
    branch: 'klingenpfad',
    name: 'Seelenraub',
    description: 'Jeder besiegte Gegner stellt sofort Lebenspunkte wieder her.',
    maxRank: 5,
    effectPerRank: '+6 HP Heilung pro besiegtem Gegner pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_rune_bulwark',
    branch: 'runenpfad',
    name: 'Runenbollwerk',
    description: 'Stärkt deine maximale Lebenskraft und reduziert erlittenen Schaden.',
    maxRank: 5,
    effectPerRank: '+25 Max-HP & +4 Verteidigung pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_arcane_nova',
    branch: 'runenpfad',
    name: 'Arkane Druckwelle [F]',
    description: 'Verstärkt deine Arkane Nova (Taste [F]), die alle nahen Gegner zurückstößt.',
    maxRank: 5,
    effectPerRank: '+22 Nova-Schaden & -0.8s Abklingzeit pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_aether_ward',
    branch: 'runenpfad',
    name: 'Ätherische Regeneration',
    description: 'Regeneriert kontinuierlich Lebenspunkte während der Erkundung.',
    maxRank: 5,
    effectPerRank: '+1.2 HP/Sekunde Regeneration pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_shadow_dash',
    branch: 'schattenpfad',
    name: 'Schattenschritt [Q]',
    description: 'Erhöht das Lauftempo und verkürzt die Abklingzeit des Ausweich-Dashes.',
    maxRank: 5,
    effectPerRank: '+6% Lauftempo & -0.4s Dash-Abklingzeit pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_treasure_instinct',
    branch: 'schattenpfad',
    name: 'Gier der Tiefe',
    description: 'Erhöht die Goldmenge aus allen Schatztruhen und Goldhaufen.',
    maxRank: 5,
    effectPerRank: '+18% Gold-Beute & +15% Score-Bonus pro Rang',
    costPerRank: 1,
  },
  {
    id: 'sk_secret_sight',
    branch: 'schattenpfad',
    name: 'Auge des Architekten',
    description: 'hebt geheime Altäre, Truhen und Ausgänge auf der Minimap deutlich hervor.',
    maxRank: 3,
    effectPerRank: 'Erweiterter Radar-Radius & +25% XP aus Geheimnissen',
    costPerRank: 1,
  },
];

export const DAILY_AND_WEEKLY_QUESTS: QuestTask[] = [
  // Daily Quests
  {
    id: 'dq_gold_hunter',
    type: 'daily',
    title: 'Tägliche Quest: Goldschürfer der Krypta',
    description: 'Sammle insgesamt 200 Goldmünzen in den Labyrinthen.',
    target: 200,
    metric: 'gold',
    rewardGold: 150,
    rewardXp: 180,
  },
  {
    id: 'dq_crypt_cleanser',
    type: 'daily',
    title: 'Tägliche Quest: Wächter-Bezwinger',
    description: 'Besiege 5 Dungeon-Gegner (Skelette, Kultisten oder Kolosse).',
    target: 5,
    metric: 'kills',
    rewardGold: 180,
    rewardXp: 220,
  },
  {
    id: 'dq_chest_breaker',
    type: 'daily',
    title: 'Tägliche Quest: Schatzkammer-Plünderer',
    description: 'Öffne 2 verschlossene Schatztruhen im 3D-Labyrinth.',
    target: 2,
    metric: 'chests',
    rewardGold: 140,
    rewardXp: 160,
  },
  {
    id: 'dq_skill_mastery',
    type: 'daily',
    title: 'Tägliche Quest: Entfesselte Runenkraft',
    description: 'Setze 3-mal deinen Schattenschritt [Q] oder die Arkane Nova [F] ein.',
    target: 3,
    metric: 'skillsUsed',
    rewardGold: 120,
    rewardXp: 200,
  },
  // Weekly Tasks (generate large XP for Level-Ups + Skill Points)
  {
    id: 'wq_deep_delver',
    type: 'weekly',
    title: 'Wöchentliche Aufgabe: Abstieg in die Finsternis',
    description: 'Schließe insgesamt 3 Labyrinth-Ebenen erfolgreich ab.',
    target: 3,
    metric: 'floors',
    rewardGold: 500,
    rewardXp: 850,
    rewardSkillPoints: 2,
  },
  {
    id: 'wq_legion_slayer',
    type: 'weekly',
    title: 'Wöchentliche Aufgabe: Zorn der Katakomben',
    description: 'Besiege 20 Gegner in beliebigen Dungeon-Läufen für massiven XP-Gewinn.',
    target: 20,
    metric: 'kills',
    rewardGold: 650,
    rewardXp: 1100,
    rewardSkillPoints: 2,
  },
  {
    id: 'wq_hoard_lord',
    type: 'weekly',
    title: 'Wöchentliche Aufgabe: Schatzmeister des Abgrunds',
    description: 'Sammle 1.000 Goldmünzen für einen großen Erfahrungsschub.',
    target: 1000,
    metric: 'gold',
    rewardGold: 600,
    rewardXp: 950,
    rewardSkillPoints: 1,
  },
  {
    id: 'wq_secret_seeker',
    type: 'weekly',
    title: 'Wöchentliche Aufgabe: Archivar des Verborgenen',
    description: 'Entdecke 2 geheime Runen-Altäre oder geheime Belohnungen.',
    target: 2,
    metric: 'secrets',
    rewardGold: 550,
    rewardXp: 1200,
    rewardSkillPoints: 2,
  },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_first_blood',
    title: 'Erster Streich in der Tiefe',
    description: 'Besiege deinen ersten Gegner im 3D-Labyrinth.',
    target: 1,
    metric: 'kills',
    rewardGold: 100,
    rewardTitle: 'Gruft-Novize',
    shareBannerText: 'Ich habe meinen ersten Wächter in Abyssal Labyrinth bezwungen!',
  },
  {
    id: 'ach_treasure_seeker',
    title: 'Goldrausch der Katakomben',
    description: 'Sammle mindestens 500 Goldmünzen an Schätzen.',
    target: 500,
    metric: 'gold',
    rewardGold: 250,
    rewardTitle: 'Schatzjäger',
    shareBannerText: 'Über 500 Goldmünzen aus den prozeduralen Labyrinthen geborgen!',
  },
  {
    id: 'ach_floor_conqueror',
    title: 'Bezwinger der Dritten Tiefe',
    description: 'Erreiche Labyrinth-Ebene 3 oder tiefer.',
    target: 3,
    metric: 'highestFloor',
    rewardGold: 400,
    rewardTitle: 'Tiefenwanderer',
    shareBannerText: 'Ebene 3 des Abyssal Labyrinth erreicht – die Kolosse wanken!',
  },
  {
    id: 'ach_secret_finder',
    title: 'Hüter der Verborgenen Siegel',
    description: 'Schalte mindestens 1 geheime Belohnung frei.',
    target: 1,
    metric: 'secrets',
    rewardGold: 300,
    rewardTitle: 'Runenseher',
    shareBannerText: 'Ein verborgenes Relikt des Stummen Königs im Labyrinth entdeckt!',
  },
  {
    id: 'ach_centurion',
    title: 'Schrecken der Finsternis',
    description: 'Besiege insgesamt 25 Gegner aller Archetypen.',
    target: 25,
    metric: 'kills',
    rewardGold: 500,
    rewardTitle: 'Schattenbrecher',
    shareBannerText: '25 Monster in den dunklen Gewölben von Abyssal Labyrinth besiegt!',
  },
  {
    id: 'ach_high_roller',
    title: 'Legende der Bestenliste',
    description: 'Erziele mindestens 2.500 Gesamtpunkte.',
    target: 2500,
    metric: 'totalScore',
    rewardGold: 600,
    rewardTitle: 'Großmeister des Abgrunds',
    shareBannerText: 'Neuer Rekord über 2.500 Punkte in Abyssal Labyrinth aufgestellt!',
  },
];

export const DAILY_LOGIN_REWARDS: DailyLoginDay[] = [
  { day: 1, label: 'Tag 1', rewardGold: 120, rewardXp: 100, bonusItemName: '1x Purpur-Lebensessenz' },
  { day: 2, label: 'Tag 2', rewardGold: 180, rewardXp: 150 },
  { day: 3, label: 'Tag 3', rewardGold: 250, rewardXp: 220, bonusItemName: '+1 Skill-Punkt' },
  { day: 4, label: 'Tag 4', rewardGold: 320, rewardXp: 280 },
  { day: 5, label: 'Tag 5', rewardGold: 420, rewardXp: 360, bonusItemName: '2x Purpur-Lebensessenz' },
  { day: 6, label: 'Tag 6', rewardGold: 550, rewardXp: 480 },
  { day: 7, label: 'Tag 7 · Mythische Truhe', rewardGold: 850, rewardXp: 750, bonusItemName: 'Exklusiver Titel & +2 Skill-Punkte' },
];
