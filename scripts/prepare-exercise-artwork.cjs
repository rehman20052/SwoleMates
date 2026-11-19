// Reduce the public wger exerciseinfo response to thumbnail matching metadata.
// Sources are downloaded explicitly before running this local preparation step.
const fs = require('node:fs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const source = read('.expo/exercise-image-source.json');
const licenses = read('.expo/exercise-image-licenses.json');
const entries = source.results.flatMap(item => {
  const names = item.translations.filter(t => t.language === 2).flatMap(t => [t.name, ...(t.aliases || []).map(a => typeof a === 'string' ? a : a.alias || a.name)]).filter(n => typeof n === 'string' && n.trim());
  if (!names.length) return [];
  const image = [...item.images].sort((a,b) => Number(b.is_main) - Number(a.is_main))[0];
  const license = image && licenses.find(l => l.id === image.license);
  return [{ id: item.id, names, equipment: item.equipment.map(e => e.name), ...(image && license ? {
    image: image.thumbnails?.small || image.image,
    author: image.license_author || image.author_history?.join(', ') || item.license_author || 'wger contributors',
    license: license.short_name, licenseUrl: license.url,
    source: `https://wger.de/en/exercise/${item.id}/view/`,
  } : {}) }];
});
fs.writeFileSync('src/lib/exercise-artwork-catalog.json', JSON.stringify(entries));
console.log(`Prepared ${entries.length} exercises, ${entries.filter(e => e.image).length} with credited images.`);
