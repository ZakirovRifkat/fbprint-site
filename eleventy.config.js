// Сборка сайта: страницы из src/ собираются в обычные HTML-файлы в _site/.
// _site/ целиком заливается на хостинг; send.php работает там как есть.
import yaml from 'js-yaml';

export default function (eleventyConfig) {
  // Тексты и данные сайта лежат в src/_data/*.yaml
  eleventyConfig.addDataExtension('yaml', (contents) => yaml.load(contents));

  // Тексты наши и содержат разметку (&nbsp;, <br>, ссылки) — выводим их как есть
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: false });

  // Файлы, которые копируются без изменений
  for (const path of [
    'assets',
    'style.css',
    'main.js',
    'send.php',
    'config.example.php',
    '.htaccess',
    'privacy.pdf',
    'consent.pdf',
  ]) {
    eleventyConfig.addPassthroughCopy(`src/${path}`);
  }

  // Галочка в списках: маленькая (15) рисуется толще, чтобы не терялась
  eleventyConfig.addShortcode('check', (size = 18) => {
    const stroke = size <= 15 ? 2.8 : 2.6;
    return `<svg class="icon-check" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  });

  // Стрелка в кнопках
  eleventyConfig.addShortcode('arrow', () =>
    '<svg class="btn__arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );

  return {
    dir: { input: 'src', output: '_site', includes: '_includes' },
    templateFormats: ['html', 'njk'],
    htmlTemplateEngine: 'njk',
  };
}
