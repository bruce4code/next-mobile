import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend'; // 导入 http-backend

i18n
  .use(Backend) // 使用 http-backend
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    // debug: true, // 生产环境建议关闭 debug
    fallbackLng: 'en', // 当当前语言没有翻译时，回退到英语
    supportedLngs: ['en', 'zh'], // 支持的语言列表
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    backend: {
      // 配置翻译文件的加载路径
      // %lng% 会被当前语言替换 (e.g., 'en', 'zh')
      // %ns% 会被命名空间替换 (e.g., 'common', 'chat')
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    ns: ['common'], // 默认加载的命名空间，可以根据需要添加更多
    defaultNS: 'common', // 默认命名空间
  });

export default i18n;
