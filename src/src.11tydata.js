// Язык страницы по умолчанию — русский. Для английской страницы в её шапке пишется lang: en.
// t — тексты на языке страницы из src/_data/i18n/<lang>.yaml
export default {
  lang: 'ru',
  eleventyComputed: {
    t: (data) => data.i18n[data.lang],
  },
};
