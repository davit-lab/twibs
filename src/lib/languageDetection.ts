import i18n from 'i18next';

// Map of country codes to language codes
const countryToLanguage: Record<string, string> = {
  // English
  US: 'en', GB: 'en', AU: 'en', NZ: 'en', IE: 'en',
  // Spanish
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es',
  // French
  FR: 'fr', BE: 'fr', LU: 'fr',
  // German
  DE: 'de', AT: 'de', LI: 'de', CH: 'de',
  // Russian
  RU: 'ru', BY: 'ru', KZ: 'ru',
  // Arabic
  SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', YE: 'ar', JO: 'ar', LB: 'ar', SY: 'ar', IQ: 'ar', PS: 'ar', LY: 'ar', TN: 'ar', SD: 'ar',
  // Chinese
  CN: 'zh', TW: 'zh', HK: 'zh', SG: 'zh',
  // Georgian
  GE: 'ka',
};

// Supported languages in the app (8 languages as per Phase 2)
const supportedLanguages = ['en', 'ka', 'ru', 'es', 'fr', 'de', 'ar', 'zh'];

// RTL languages
const rtlLanguages = ['ar'];

export function isRtlLanguage(code: string): boolean {
  return rtlLanguages.includes(code);
}

export function detectBrowserLanguage(): string {
  // Get the browser's preferred language
  const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
  
  // Extract the language code (e.g., "en-US" -> "en")
  const langCode = browserLang.split('-')[0].toLowerCase();
  
  // Return if supported, otherwise default to English
  return supportedLanguages.includes(langCode) ? langCode : 'en';
}

export async function detectCountryFromIP(): Promise<string> {
  try {
    // Use a free IP geolocation API
    const response = await fetch('https://ipapi.co/json/', { 
      signal: AbortSignal.timeout(5000) 
    });
    
    if (!response.ok) throw new Error('Failed to fetch');
    
    const data = await response.json();
    const countryCode = data.country_code;
    
    // Map country to language
    const language = countryToLanguage[countryCode] || 'en';
    return supportedLanguages.includes(language) ? language : 'en';
  } catch (error) {
    console.log('IP detection failed, using browser language');
    return detectBrowserLanguage();
  }
}

export function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: 'English',
    ka: 'ქართული',
    ru: 'Русский',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ar: 'العربية',
    zh: '中文',
  };
  return names[code] || code;
}

export function getAllLanguages(): { code: string; name: string; nativeName: string }[] {
  return supportedLanguages.map(code => ({
    code,
    name: getLanguageEnglishName(code),
    nativeName: getLanguageName(code),
  }));
}

function getLanguageEnglishName(code: string): string {
  const names: Record<string, string> = {
    en: 'English',
    ka: 'Georgian',
    ru: 'Russian',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ar: 'Arabic',
    zh: 'Chinese',
  };
  return names[code] || code;
}

export function changeLanguage(code: string): void {
  if (supportedLanguages.includes(code)) {
    i18n.changeLanguage(code);
    
    // Update document direction for RTL languages
    document.documentElement.dir = isRtlLanguage(code) ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  }
}

export function getCurrentLanguage(): string {
  return i18n.language || 'en';
}
