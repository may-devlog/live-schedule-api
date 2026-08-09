import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const generatedFontDir = path.join(
  distDir,
  'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
);
const publicFontDir = path.join(distDir, 'assets/fonts');
// MaterialIcons is only used by Expo's unused starter routes. Avoid making
// every production page preload it before the application can render.
const requiredFonts = ['Ionicons'];

const generatedFonts = await readdir(generatedFontDir);
await mkdir(publicFontDir, { recursive: true });

const replacements = new Map();
for (const family of requiredFonts) {
  const fileName = generatedFonts.find((name) => name.startsWith(`${family}.`) && name.endsWith('.ttf'));
  if (!fileName) {
    throw new Error(`Expo export did not produce the ${family} font`);
  }

  await cp(path.join(generatedFontDir, fileName), path.join(publicFontDir, fileName));
  replacements.set(
    `/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/${fileName}`,
    `/assets/fonts/${fileName}`,
  );
}

async function rewriteGeneratedReferences(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteGeneratedReferences(fullPath);
      continue;
    }
    if (!/\.(?:html|js|json|css)$/.test(entry.name)) continue;

    const original = await readFile(fullPath, 'utf8');
    let updated = original;
    for (const [from, to] of replacements) updated = updated.replaceAll(from, to);
    if (updated !== original) await writeFile(fullPath, updated);
  }
}

await rewriteGeneratedReferences(distDir);
