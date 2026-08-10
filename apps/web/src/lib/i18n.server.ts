import { createInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';

// 配置 i18next 实例，用于服务器端
const initI18next = async (lng: string, ns: string | string[]) => {
  const i18nInstance = createInstance();
  await i18nInstance
    .use(initReactI18next)
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(
            `../../public/locales/${language}/${namespace}.json`
          )
      )
    )
    .init({
      // debug: true, // 服务器端 debug 可以在控制台看到加载信息
      lng, // 当前语言
      ns, // 需要加载的命名空间
      fallbackLng: 'en', // 回退语言
      supportedLngs: ['en', 'zh'], // 支持的语言列表
      defaultNS: 'common', // 默认命名空间
      interpolation: {
        escapeValue: false, // react already safes from xss
      },
    });
  return i18nInstance;
};

// 获取服务器端翻译函数
export async function getTranslation(lng: string, ns: string | string[]) {
  const i18nInstance = await initI18next(lng, ns);
  const resources = i18nInstance.getDataByLanguage(lng); // Get raw resources
  return {
    t: i18nInstance.getFixedT(lng, Array.isArray(ns) ? ns[0] : ns), // 获取指定语言和命名空间的 t 函数
    i18n: i18nInstance,
    serializedResources: JSON.stringify(resources), // Pass stringified resources
  };
}