/**
 * PWA Icon Generator Script
 * 從 SVG 源檔案生成各種尺寸的 PNG 圖示
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');

// 確保目錄存在
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// 讀取 SVG 檔案
const iconSvg = readFileSync(join(iconsDir, 'icon.svg'));
const maskableSvg = readFileSync(join(iconsDir, 'maskable-icon.svg'));

// 需要生成的尺寸
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  console.log('🎨 開始生成 PWA 圖示...\n');

  // 生成標準圖示
  for (const size of sizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(iconSvg)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ icon-${size}x${size}.png`);
  }

  // 生成 maskable 圖示 (512x512)
  const maskablePath = join(iconsDir, 'maskable-icon-512x512.png');
  await sharp(maskableSvg)
    .resize(512, 512)
    .png()
    .toFile(maskablePath);
  console.log('✅ maskable-icon-512x512.png');

  // 生成 Apple Touch Icon
  const appleTouchPath = join(iconsDir, 'apple-touch-icon.png');
  await sharp(iconSvg)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log('✅ apple-touch-icon.png');

  const appleTouchPath180 = join(iconsDir, 'apple-touch-icon-180x180.png');
  await sharp(iconSvg)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath180);
  console.log('✅ apple-touch-icon-180x180.png');

  // 生成 favicon (32x32 和 16x16)
  const favicon32 = join(iconsDir, 'favicon-32x32.png');
  await sharp(iconSvg)
    .resize(32, 32)
    .png()
    .toFile(favicon32);
  console.log('✅ favicon-32x32.png');

  const favicon16 = join(iconsDir, 'favicon-16x16.png');
  await sharp(iconSvg)
    .resize(16, 16)
    .png()
    .toFile(favicon16);
  console.log('✅ favicon-16x16.png');

  console.log('\n🎉 所有圖示生成完成！');
}

generateIcons().catch(console.error);
