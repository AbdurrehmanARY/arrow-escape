import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const assetsDir = join(__dirname, '..', 'assets');
const challengeDir = join(assetsDir, 'challenge');
const imagesDir = join(assetsDir, 'images');
const recordsDir = join(assetsDir, 'records');
const trophiesDir = join(assetsDir, 'monthly trophies');
const shieldsDir = join(assetsDir, 'shields');

if (!existsSync(challengeDir)) mkdirSync(challengeDir, { recursive: true });
if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

function safeCopy(src: string, dest: string) {
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
  } else {
    console.warn(`Source missing: ${src}`);
  }
}

// 1. Map Records
if (existsSync(recordsDir)) {
  safeCopy(join(recordsDir, 'longest streak.JPG'), join(challengeDir, 'flame_active.jpg'));
  safeCopy(join(recordsDir, 'lock longest streak.JPG'), join(challengeDir, 'flame_inactive.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'crown_active.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'crown_inactive.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'arrow_active.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'arrow_inactive.jpg'));
  safeCopy(join(recordsDir, 'longest streak.JPG'), join(challengeDir, 'level_legend_active.jpg'));
  safeCopy(join(recordsDir, 'lock longest streak.JPG'), join(challengeDir, 'level_legend_inactive.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'perfect_play_active.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'perfect_play_inactive.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'unstoppable_active.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'unstoppable_inactive.jpg'));
  safeCopy(join(recordsDir, 'longest streak.JPG'), join(challengeDir, 'league_climber_active.jpg'));
  safeCopy(join(recordsDir, 'lock longest streak.JPG'), join(challengeDir, 'league_climber_inactive.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'league_fighter_active.jpg'));
  safeCopy(join(recordsDir, 'most win.JPG'), join(challengeDir, 'league_fighter_inactive.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'trophy_active.jpg'));
  safeCopy(join(recordsDir, 'crown.JPG'), join(challengeDir, 'trophy_inactive.jpg'));
}

// 2. Map Monthly Trophies
if (existsSync(trophiesDir)) {
  const monthMap: Record<number, string> = {
    1: 'jan.jpeg',
    2: 'fab.jpeg',
    3: 'march.jpeg',
    4: 'aprail.jpeg',
    5: 'may.jpeg',
    6: 'june.jpeg',
    7: 'july.jpeg',
    8: 'august.jpeg',
    9: 'sep.jpeg',
    10: 'oct.jpeg',
    11: 'nov.jpeg',
    12: 'dec.jpeg',
  };
  for (let m = 1; m <= 12; m++) {
    const file = monthMap[m];
    if (file) {
      const numStr = String(m).padStart(2, '0');
      safeCopy(join(trophiesDir, file), join(challengeDir, `trophy_${numStr}.png`));
    }
  }
  safeCopy(join(trophiesDir, 'Locked_championship_cup_on_base_202609042146.jpeg'), join(challengeDir, 'trophy_inactive.jpg'));
}

// 3. Map Shields
if (existsSync(shieldsDir)) {
  safeCopy(join(shieldsDir, 'Bronze_mobile_game_rank_shield_202609042103.jpeg'), join(imagesDir, 'shield_bronze.jpg'));
  safeCopy(join(shieldsDir, 'Bronze_mobile_game_rank_shield_202609042103.jpeg'), join(imagesDir, 'shield_bronze.png'));

  safeCopy(join(shieldsDir, 'Rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_silver.jpg'));
  safeCopy(join(shieldsDir, 'Rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_silver.png'));

  safeCopy(join(shieldsDir, 'Gold_rank_shield_mobile_icon_202609042103.jpeg'), join(imagesDir, 'shield_gold.jpg'));
  safeCopy(join(shieldsDir, 'Gold_rank_shield_mobile_icon_202609042103.jpeg'), join(imagesDir, 'shield_gold.png'));

  safeCopy(join(shieldsDir, 'Change_shield_material_color_202609042103.jpeg'), join(imagesDir, 'shield_ruby.jpg'));
  safeCopy(join(shieldsDir, 'Change_shield_material_color_202609042103.jpeg'), join(imagesDir, 'shield_ruby.png'));

  safeCopy(join(shieldsDir, 'Game_rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_obsidian.jpg'));
  safeCopy(join(shieldsDir, 'Game_rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_obsidian.png'));

  safeCopy(join(shieldsDir, 'Game_rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_diamond.jpg'));
  safeCopy(join(shieldsDir, 'Game_rank_shield_badge_icon_202609042103.jpeg'), join(imagesDir, 'shield_diamond.png'));
}

console.log('User assets synced successfully.');
