import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

const M3U_SOURCES = [
  'https://iptv-org.github.io/iptv/countries/ge.m3u',
  'https://iptv-org.github.io/iptv/countries/tr.m3u',
];
const PAGE_SIZE = 60;
const CACHE_KEY = 'tv_channels_v7';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const PROBE_TIMEOUT = 2000; // per-channel live check cap
const POOL_SIZE = 8; // parallel live-check limit
const MAX_ENRICH = 80; // how many extra channels are probed from playlists

export interface TvChannel {
  id: string;
  name: string;
  logo: string;
  group: string;
  stream_url: string;
  country_code: string;
  country_flag: string;
  category: string;
  quality: string;
  user_agent: string;
  referrer: string;
  verified?: boolean;
}

interface RawM3uEntry {
  name: string;
  logo: string;
  group: string;
  tvgId: string;
  url: string;
  user_agent: string;
  referrer: string;
}

interface CachedData {
  channels: TvChannel[];
  timestamp: number;
}

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  AD: { name: 'Andorra', flag: '🇦🇩' }, AE: { name: 'United Arab Emirates', flag: '🇦🇪' },
  AF: { name: 'Afghanistan', flag: '🇦🇫' }, AG: { name: 'Antigua and Barbuda', flag: '🇦🇬' },
  AL: { name: 'Albania', flag: '🇦🇱' }, AM: { name: 'Armenia', flag: '🇦🇲' },
  AO: { name: 'Angola', flag: '🇦🇴' }, AR: { name: 'Argentina', flag: '🇦🇷' },
  AT: { name: 'Austria', flag: '🇦🇹' }, AU: { name: 'Australia', flag: '🇦🇺' },
  AZ: { name: 'Azerbaijan', flag: '🇦🇿' }, BA: { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  BB: { name: 'Barbados', flag: '🇧🇧' }, BD: { name: 'Bangladesh', flag: '🇧🇩' },
  BE: { name: 'Belgium', flag: '🇧🇪' }, BF: { name: 'Burkina Faso', flag: '🇧🇫' },
  BG: { name: 'Bulgaria', flag: '🇧🇬' }, BH: { name: 'Bahrain', flag: '🇧🇭' },
  BI: { name: 'Burundi', flag: '🇧🇮' }, BJ: { name: 'Benin', flag: '🇧🇯' },
  BN: { name: 'Brunei', flag: '🇧🇳' }, BO: { name: 'Bolivia', flag: '🇧🇴' },
  BR: { name: 'Brazil', flag: '🇧🇷' }, BS: { name: 'Bahamas', flag: '🇧🇸' },
  BT: { name: 'Bhutan', flag: '🇧🇹' }, BW: { name: 'Botswana', flag: '🇧🇼' },
  BY: { name: 'Belarus', flag: '🇧🇾' }, BZ: { name: 'Belize', flag: '🇧🇿' },
  CA: { name: 'Canada', flag: '🇨🇦' }, CD: { name: 'DR Congo', flag: '🇨🇩' },
  CF: { name: 'Central African Republic', flag: '🇨🇫' }, CG: { name: 'Congo', flag: '🇨🇬' },
  CH: { name: 'Switzerland', flag: '🇨🇭' }, CI: { name: 'Ivory Coast', flag: '🇨🇮' },
  CL: { name: 'Chile', flag: '🇨🇱' }, CM: { name: 'Cameroon', flag: '🇨🇲' },
  CN: { name: 'China', flag: '🇨🇳' }, CO: { name: 'Colombia', flag: '🇨🇴' },
  CR: { name: 'Costa Rica', flag: '🇨🇷' }, CU: { name: 'Cuba', flag: '🇨🇺' },
  CY: { name: 'Cyprus', flag: '🇨🇾' }, CZ: { name: 'Czech Republic', flag: '🇨🇿' },
  DE: { name: 'Germany', flag: '🇩🇪' }, DJ: { name: 'Djibouti', flag: '🇩🇯' },
  DK: { name: 'Denmark', flag: '🇩🇰' }, DO: { name: 'Dominican Republic', flag: '🇩🇴' },
  DZ: { name: 'Algeria', flag: '🇩🇿' }, EC: { name: 'Ecuador', flag: '🇪🇨' },
  EE: { name: 'Estonia', flag: '🇪🇪' }, EG: { name: 'Egypt', flag: '🇪🇬' },
  ER: { name: 'Eritrea', flag: '🇪🇷' }, ES: { name: 'Spain', flag: '🇪🇸' },
  ET: { name: 'Ethiopia', flag: '🇪🇹' }, FI: { name: 'Finland', flag: '🇫🇮' },
  FJ: { name: 'Fiji', flag: '🇫🇯' }, FR: { name: 'France', flag: '🇫🇷' },
  GA: { name: 'Gabon', flag: '🇬🇦' }, GB: { name: 'United Kingdom', flag: '🇬🇧' },
  GD: { name: 'Grenada', flag: '🇬🇩' }, GE: { name: 'Georgia', flag: '🇬🇪' },
  GH: { name: 'Ghana', flag: '🇬🇭' }, GM: { name: 'Gambia', flag: '🇬🇲' },
  GN: { name: 'Guinea', flag: '🇬🇳' }, GQ: { name: 'Equatorial Guinea', flag: '🇬🇶' },
  GR: { name: 'Greece', flag: '🇬🇷' }, GT: { name: 'Guatemala', flag: '🇬🇹' },
  GW: { name: 'Guinea-Bissau', flag: '🇬🇼' }, GY: { name: 'Guyana', flag: '🇬🇾' },
  HK: { name: 'Hong Kong', flag: '🇭🇰' }, HN: { name: 'Honduras', flag: '🇭🇳' },
  HR: { name: 'Croatia', flag: '🇭🇷' }, HT: { name: 'Haiti', flag: '🇭🇹' },
  HU: { name: 'Hungary', flag: '🇭🇺' }, ID: { name: 'Indonesia', flag: '🇮🇩' },
  IE: { name: 'Ireland', flag: '🇮🇪' }, IL: { name: 'Israel', flag: '🇮🇱' },
  IN: { name: 'India', flag: '🇮🇳' }, IQ: { name: 'Iraq', flag: '🇮🇶' },
  IR: { name: 'Iran', flag: '🇮🇷' }, IS: { name: 'Iceland', flag: '🇮🇸' },
  IT: { name: 'Italy', flag: '🇮🇹' }, JM: { name: 'Jamaica', flag: '🇯🇲' },
  JO: { name: 'Jordan', flag: '🇯🇴' }, JP: { name: 'Japan', flag: '🇯🇵' },
  KE: { name: 'Kenya', flag: '🇰🇪' }, KG: { name: 'Kyrgyzstan', flag: '🇰🇬' },
  KH: { name: 'Cambodia', flag: '🇰🇭' }, KR: { name: 'South Korea', flag: '🇰🇷' },
  KW: { name: 'Kuwait', flag: '🇰🇼' }, KZ: { name: 'Kazakhstan', flag: '🇰🇿' },
  LA: { name: 'Laos', flag: '🇱🇦' }, LB: { name: 'Lebanon', flag: '🇱🇧' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰' }, LR: { name: 'Liberia', flag: '🇱🇷' },
  LT: { name: 'Lithuania', flag: '🇱🇹' }, LU: { name: 'Luxembourg', flag: '🇱🇺' },
  LV: { name: 'Latvia', flag: '🇱🇻' }, LY: { name: 'Libya', flag: '🇱🇾' },
  MA: { name: 'Morocco', flag: '🇲🇦' }, MC: { name: 'Monaco', flag: '🇲🇨' },
  MD: { name: 'Moldova', flag: '🇲🇩' }, ME: { name: 'Montenegro', flag: '🇲🇪' },
  MG: { name: 'Madagascar', flag: '🇲🇬' }, MK: { name: 'North Macedonia', flag: '🇲🇰' },
  ML: { name: 'Mali', flag: '🇲🇱' }, MM: { name: 'Myanmar', flag: '🇲🇲' },
  MN: { name: 'Mongolia', flag: '🇲🇳' }, MO: { name: 'Macao', flag: '🇲🇴' },
  MT: { name: 'Malta', flag: '🇲🇹' }, MU: { name: 'Mauritius', flag: '🇲🇺' },
  MV: { name: 'Maldives', flag: '🇲🇻' }, MW: { name: 'Malawi', flag: '🇲🇼' },
  MX: { name: 'Mexico', flag: '🇲🇽' }, MY: { name: 'Malaysia', flag: '🇲🇾' },
  MZ: { name: 'Mozambique', flag: '🇲🇿' }, NA: { name: 'Namibia', flag: '🇳🇦' },
  NE: { name: 'Niger', flag: '🇳🇪' }, NG: { name: 'Nigeria', flag: '🇳🇬' },
  NI: { name: 'Nicaragua', flag: '🇳🇮' }, NL: { name: 'Netherlands', flag: '🇳🇱' },
  NO: { name: 'Norway', flag: '🇳🇴' }, NP: { name: 'Nepal', flag: '🇳🇵' },
  NZ: { name: 'New Zealand', flag: '🇳🇿' }, OM: { name: 'Oman', flag: '🇴🇲' },
  PA: { name: 'Panama', flag: '🇵🇦' }, PE: { name: 'Peru', flag: '🇵🇪' },
  PG: { name: 'Papua New Guinea', flag: '🇵🇬' }, PH: { name: 'Philippines', flag: '🇵🇭' },
  PK: { name: 'Pakistan', flag: '🇵🇰' }, PL: { name: 'Poland', flag: '🇵🇱' },
  PR: { name: 'Puerto Rico', flag: '🇵🇷' }, PS: { name: 'Palestine', flag: '🇵🇸' },
  PT: { name: 'Portugal', flag: '🇵🇹' }, PY: { name: 'Paraguay', flag: '🇵🇾' },
  QA: { name: 'Qatar', flag: '🇶🇦' }, RO: { name: 'Romania', flag: '🇷🇴' },
  RS: { name: 'Serbia', flag: '🇷🇸' }, RU: { name: 'Russia', flag: '🇷🇺' },
  RW: { name: 'Rwanda', flag: '🇷🇼' }, SA: { name: 'Saudi Arabia', flag: '🇸🇦' },
  SD: { name: 'Sudan', flag: '🇸🇩' }, SE: { name: 'Sweden', flag: '🇸🇪' },
  SG: { name: 'Singapore', flag: '🇸🇬' }, SI: { name: 'Slovenia', flag: '🇸🇮' },
  SK: { name: 'Slovakia', flag: '🇸🇰' }, SL: { name: 'Sierra Leone', flag: '🇸🇱' },
  SN: { name: 'Senegal', flag: '🇸🇳' }, SO: { name: 'Somalia', flag: '🇸🇴' },
  SR: { name: 'Suriname', flag: '🇸🇷' }, SV: { name: 'El Salvador', flag: '🇸🇻' },
  SY: { name: 'Syria', flag: '🇸🇾' }, TG: { name: 'Togo', flag: '🇹🇬' },
  TH: { name: 'Thailand', flag: '🇹🇭' }, TJ: { name: 'Tajikistan', flag: '🇹🇯' },
  TL: { name: 'East Timor', flag: '🇹🇱' }, TM: { name: 'Turkmenistan', flag: '🇹🇲' },
  TN: { name: 'Tunisia', flag: '🇹🇳' }, TR: { name: 'Turkey', flag: '🇹🇷' },
  TT: { name: 'Trinidad and Tobago', flag: '🇹🇹' }, TW: { name: 'Taiwan', flag: '🇹🇼' },
  TZ: { name: 'Tanzania', flag: '🇹🇿' }, UA: { name: 'Ukraine', flag: '🇺🇦' },
  UG: { name: 'Uganda', flag: '🇺🇬' }, US: { name: 'United States', flag: '🇺🇸' },
  UY: { name: 'Uruguay', flag: '🇺🇾' }, UZ: { name: 'Uzbekistan', flag: '🇺🇿' },
  VE: { name: 'Venezuela', flag: '🇻🇪' }, VN: { name: 'Vietnam', flag: '🇻🇳' },
  YE: { name: 'Yemen', flag: '🇾🇪' }, ZA: { name: 'South Africa', flag: '🇿🇦' },
  ZM: { name: 'Zambia', flag: '🇿🇲' }, ZW: { name: 'Zimbabwe', flag: '🇿🇼' },
};

// Curated channels, individually deep-tested (master playlist -> variant ->
// media playlist -> video segment) to be CORS-playable in a browser.
// They are always shown instantly; playlist probing only adds more behind the scenes.
const VERIFIED_CHANNELS: TvChannel[] = [
  { id: '1tv-georgia', name: '1TV Georgia', logo: 'https://i.imgur.com/FSkYLPK.png', group: 'General', stream_url: 'https://tv.cdn.xsg.ge/gpb-1tv/index.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'General', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: '2tv-georgia', name: '2TV Georgia', logo: 'https://i.imgur.com/FJBL6zI.png', group: 'General', stream_url: 'https://tv.cdn.xsg.ge/gpb-2tv/index.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'General', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'imedi-tv', name: 'Imedi TV', logo: 'https://i.imgur.com/94hNyxZ.png', group: 'News', stream_url: 'https://tv.cdn.xsg.ge/imedihd/index.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'News', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'tv-formula', name: 'TV Formula', logo: 'https://i.imgur.com/fsqBn8G.png', group: 'News', stream_url: 'https://c4635.cdn.xsg.ge/c4635/TVFormula/index.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'News', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'bmg-tv', name: 'BMG TV', logo: 'https://i.imgur.com/vGLkTPA.png', group: 'Business', stream_url: 'https://tv.nucast.tv/lb/ge/bmg/index.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'Business', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'ertsuylovneba', name: 'Ertsulovneba TV', logo: 'https://i.imgur.com/KuuODMM.png', group: 'Religious', stream_url: 'https://stream.sstv.ge/live/sstv/playlist.m3u8', country_code: 'GE', country_flag: '🇬🇪', category: 'Religious', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'dw-news', name: 'DW News', logo: 'https://i.imgur.com/8MRNFb9.png', group: 'News', stream_url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', country_code: 'DE', country_flag: '🇩🇪', category: 'News', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'cbs-news', name: 'CBS News 24/7', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/CBS_News_247_logo.svg/960px-CBS_News_247_logo.svg.png', group: 'News', stream_url: 'https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8', country_code: 'US', country_flag: '🇺🇸', category: 'News', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'red-bull-tv', name: 'Red Bull TV', logo: 'https://images.pluto.tv/channels/5e7cb84a172a0f0007da69e4/colorLogoPNG.png', group: 'Sports', stream_url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', country_code: 'AT', country_flag: '🇦🇹', category: 'Sports', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'trt-haber', name: 'TRT Haber', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/TRT_Haber_Eyl%C3%BCl_2020_Logo.svg/960px-TRT_Haber_Eyl%C3%BCl_2020_Logo.svg.png', group: 'News', stream_url: 'https://tv-trthaber.medya.trt.com.tr/master.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'trt-turk', name: 'TRT Türk', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/TRT_T%C3%BCrk_logo.svg/960px-TRT_T%C3%BCrk_logo.svg.png', group: 'General', stream_url: 'https://tv-trtturk.medya.trt.com.tr/master.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'General', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'trt-muzik', name: 'TRT Müzik', logo: 'https://i.imgur.com/JgUzRH8.png', group: 'Music', stream_url: 'https://tv-trtmuzik.medya.trt.com.tr/master.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Music', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'trt-cocuk', name: 'TRT Çocuk', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/TRT_%C3%87ocuk_logo_%282021%29.svg/960px-TRT_%C3%87ocuk_logo_%282021%29.svg.png', group: 'Kids', stream_url: 'https://tv-trtcocuk.medya.trt.com.tr/master.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Kids', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'trt-diyanet-cocuk', name: 'TRT Diyanet Çocuk', logo: 'https://i.imgur.com/8PmXz9t.png', group: 'Kids', stream_url: 'https://tv-trtdiyanetcocuk.medya.trt.com.tr/master.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Kids', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'tvnet', name: 'TVNET', logo: 'https://i.imgur.com/mQo8yWQ.png', group: 'News', stream_url: 'https://tvnet-live.lg.mncdn.com/tvnet/tvnet/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'tv24', name: 'TV 24', logo: 'https://i.imgur.com/8FO41es.png', group: 'News', stream_url: 'https://turkmedya-live.ercdn.net/tv24/tv24.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'gzt', name: 'GZT', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/GZT_logo.svg/960px-GZT_logo.svg.png', group: 'News', stream_url: 'https://gzttv-live.lg.mncdn.com/gzttv/gzttv/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'turkhaber', name: 'TürkHaber', logo: 'https://i.imgur.com/2AcRKdL.png', group: 'News', stream_url: 'https://edge1.socialsmart.tv/turkhaber/bant1/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'kanal23', name: 'Kanal 23', logo: 'https://i.imgur.com/3br8RCq.png', group: 'News', stream_url: 'https://cdn-kanal23.yayin.com.tr/kanal23/index.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'News', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'power-tv', name: 'Power TV', logo: 'https://i.imgur.com/XSL1gd7.png', group: 'Music', stream_url: 'https://livetv.powerapp.com.tr/powerTV/powerhd.smil/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Music', quality: '1080p', user_agent: '', referrer: '', verified: true },
  { id: 'number1-tv', name: 'Number 1 TV', logo: 'https://i.imgur.com/02cDIBi.png', group: 'Music', stream_url: 'https://b01c02nl.mediatriple.net/videoonlylive/mtkgeuihrlfwlive/broadcast_5c9e17cd59e8b.smil/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Music', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'dream-turk', name: 'Dream Türk', logo: 'https://i.imgur.com/vJ8VaZi.png', group: 'Music', stream_url: 'https://live.duhnet.tv/S2/HLS_LIVE/dreamturknp/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Music', quality: '720p', user_agent: '', referrer: '', verified: true },
  { id: 'diyanet-tv', name: 'Diyanet TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Diyanet_TV_logo.svg/960px-Diyanet_TV_logo.svg.png', group: 'Religious', stream_url: 'https://eustr73.mediatriple.net/videoonlylive/mtikoimxnztxlive/broadcast_5e3bf95a47e07.smil/playlist.m3u8', country_code: 'TR', country_flag: '🇹🇷', category: 'Religious', quality: '1080p', user_agent: '', referrer: '', verified: true },
];

// Keep the curated (verified) channels always present, on top, deduped against fetched ones.
function composeCatalog(fetched: TvChannel[]): TvChannel[] {
  const merged = [...VERIFIED_CHANNELS, ...fetched];
  const seen = new Set<string>();
  const result: TvChannel[] = [];
  for (const channel of merged) {
    const key = `${channel.name}|${channel.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(channel);
  }
  return result;
}

function parseM3u(text: string): RawM3uEntry[] {
  const lines = text.split('\n');
  const entries: RawM3uEntry[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;

    let userAgent = '';
    let referrer = '';
    for (let j = i + 1; j < Math.min(i + 5, lines.length - 1); j++) {
      const opt = lines[j].trim();
      if (opt.startsWith('#EXTVLCOPT:')) {
        if (opt.includes('http-user-agent=')) userAgent = opt.split('http-user-agent=')[1] || '';
        if (opt.includes('http-referrer=')) referrer = opt.split('http-referrer=')[1] || '';
      } else if (opt.startsWith('#EXTINF:') || opt.startsWith('#EXTM3U')) break;
    }

    const inlineUA = line.match(/http-user-agent="([^"]*)"/);
    const inlineRef = line.match(/http-referrer="([^"]*)"/);
    if (inlineUA?.[1]) userAgent = inlineUA[1];
    if (inlineRef?.[1]) referrer = inlineRef[1];

    let urlLine = '';
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const candidate = lines[j].trim();
      if (candidate && !candidate.startsWith('#')) { urlLine = candidate; break; }
    }
    if (!urlLine) continue;

    const nameMatch = line.match(/,(.+)$/);
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const idMatch = line.match(/tvg-id="([^"]*)"/);

    entries.push({
      name: nameMatch?.[1]?.trim() || 'Unknown',
      logo: logoMatch?.[1] || '',
      group: groupMatch?.[1] || '',
      tvgId: idMatch?.[1] || '',
      url: urlLine,
      user_agent: userAgent,
      referrer: referrer,
    });
  }
  return entries;
}

function extractCountryCode(group: string, tvgId: string): string {
  const idMatch = tvgId.match(/\.([a-zA-Z]{2})(?:@[A-Za-z]+)?$/);
  if (idMatch) return idMatch[1].toUpperCase();
  for (const [code, info] of Object.entries(COUNTRY_MAP)) {
    if (group.toLowerCase().includes(info.name.toLowerCase())) return code;
  }
  return '';
}

function inferQuality(name: string, group: string): string {
  const combined = (name + ' ' + group).toLowerCase();
  if (combined.includes('4k') || combined.includes('uhd')) return '4K';
  if (combined.includes('1080') || combined.includes('fhd')) return '1080p';
  if (combined.includes('720') || combined.includes('hd')) return '720p';
  return '';
}

function cleanChannelName(name: string): string {
  return name
    .replace(/\s*\((4k|uhd|1080p?|720p?|480p?|360p?)\)\s*/gi, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function enrichEntries(raw: RawM3uEntry[]): TvChannel[] {
  const seen = new Set<string>();
  return raw
    .filter((e) => {
      if (e.url.startsWith('http://')) return false;
      // Browsers forbid custom User-Agent/Referer headers, so these can never play.
      if (e.user_agent || e.referrer) return false;
      if (/not 24\/7|geo-?blocked|restricted|offline|unknown/i.test(e.name)) return false;
      const key = `${e.name}|${e.group}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((e) => {
      const countryCode = extractCountryCode(e.group, e.tvgId);
      const country = COUNTRY_MAP[countryCode];
      return {
        id: e.tvgId || `${e.name}-${e.group}`,
        name: cleanChannelName(e.name), logo: e.logo, group: e.group, stream_url: e.url,
        country_code: countryCode, country_flag: country?.flag || '',
        category: e.group, quality: inferQuality(e.name, e.group),
        user_agent: e.user_agent, referrer: e.referrer,
      };
    });
}

function getFromLocalStorage(): TvChannel[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedData = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.channels;
  } catch { return null; }
}

function saveToLocalStorage(channels: TvChannel[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ channels, timestamp: Date.now() }));
  } catch { /* quota exceeded */ }
}

async function fetchM3uChannels(): Promise<TvChannel[]> {
  const results = await Promise.allSettled(
    M3U_SOURCES.map(async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        return enrichEntries(parseM3u(text));
      } finally {
        clearTimeout(timeoutId);
      }
    })
  );

  const merged: TvChannel[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const channel of result.value) {
      const key = `${channel.name}|${channel.group}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(channel);
    }
  }

  if (merged.length === 0) throw new Error('All channel sources failed');
  return merged;
}

// A channel "works" in the browser only if its master playlist answers with CORS
// + m3u8 content. Anything needing a spoofed User-Agent/Referer can never play
// here (those headers are forbidden in browsers), so it is dropped.
async function probeChannel(channel: TvChannel): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
  try {
    const res = await fetch(channel.stream_url, { signal: controller.signal });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (/mpegurl|m3u8|vnd\.apple/i.test(type)) return true;
    const text = await res.text();
    return text.trimStart().startsWith('#EXTM3U');
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Probe a bounded set with a concurrency pool so refresh stays fast and polite.
async function filterLiveChannels(channels: TvChannel[]): Promise<TvChannel[]> {
  const results = new Array(channels.length).fill(false);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(POOL_SIZE, channels.length) },
    async () => {
      while (cursor < channels.length) {
        const index = cursor++;
        results[index] = await probeChannel(channels[index]);
      }
    }
  );
  await Promise.all(workers);
  return channels.filter((_, i) => results[i]);
}

// Prefer the countries this app is built for, then probe the most promising.
function groupScore(channel: TvChannel): number {
  const group = channel.group.toLowerCase();
  if (group.includes('georg')) return 3;
  if (group.includes('turk')) return 2;
  return 1;
}

async function fetchLiveChannels(): Promise<TvChannel[]> {
  const fetched = await fetchM3uChannels();
  const prioritized = [...fetched].sort((a, b) => groupScore(b) - groupScore(a));
  const candidates = prioritized.slice(0, MAX_ENRICH);
  const live = await filterLiveChannels(candidates);
  if (live.length === 0) throw new Error('No live channels found right now');
  return live;
}

export function useTvChannels() {
  const [allChannels, setAllChannels] = useState<TvChannel[]>(() => {
    const cached = getFromLocalStorage();
    return cached ? composeCatalog(cached) : VERIFIED_CHANNELS;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'cache' | 'default' | 'live'>(getFromLocalStorage() ? 'cache' : 'default');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = getFromLocalStorage();
    if (cached) {
      setAllChannels(composeCatalog(cached));
      setDataSource('cache');
      setLoading(false);
      // Still try background refresh if cache is > 6 hours old
      if (Date.now() - JSON.parse(localStorage.getItem(CACHE_KEY) || '{}').timestamp > 6 * 60 * 60 * 1000) {
        fetchLiveChannels().then(channels => {
          setAllChannels(composeCatalog(channels));
          saveToLocalStorage(channels);
          setDataSource('live');
        }).catch(() => {});
      }
      return;
    }

    // No cache — show defaults instantly, fetch live in background
    setDataSource('default');
    setLoading(true);
    fetchLiveChannels()
      .then((channels) => {
        setAllChannels(composeCatalog(channels));
        saveToLocalStorage(channels);
        setDataSource('live');
      })
      .catch(() => {
        // Keep defaults, just show a subtle notice
        setDataSource('default');
      })
      .finally(() => setLoading(false));
  }, []);

  const availableCountries = useMemo(() => {
    const map = new Map<string, { code: string; name: string; flag: string; count: number }>();
    allChannels.forEach((ch) => {
      if (!ch.country_code) return;
      const existing = map.get(ch.country_code);
      if (existing) { existing.count++; }
      else {
        const info = COUNTRY_MAP[ch.country_code];
        map.set(ch.country_code, { code: ch.country_code, name: info?.name || ch.country_code, flag: info?.flag || '', count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allChannels]);

  const availableCategories = useMemo(() => {
    const map = new Map<string, number>();
    allChannels.forEach((ch) => {
      if (!ch.category) return;
      map.set(ch.category, (map.get(ch.category) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }, [allChannels]);

  const filteredChannels = useMemo(() => {
    let result = allChannels;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((ch) => ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q));
    }
    if (selectedCountry) result = result.filter((ch) => ch.country_code === selectedCountry);
    if (selectedCategory) result = result.filter((ch) => ch.category === selectedCategory);
    return result;
  }, [allChannels, searchQuery, selectedCountry, selectedCategory]);

  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [searchQuery, selectedCountry, selectedCategory]);

  const displayedChannels = useMemo(() => filteredChannels.slice(0, displayCount), [filteredChannels, displayCount]);
  const hasMore = displayCount < filteredChannels.length;

  const loadMore = useCallback(() => { setDisplayCount((prev) => prev + PAGE_SIZE); }, []);
  const clearFilters = useCallback(() => { setSearchQuery(''); setSelectedCountry(''); setSelectedCategory(''); }, []);

  const refreshChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const channels = await fetchLiveChannels();
      setAllChannels(composeCatalog(channels));
      saveToLocalStorage(channels);
      setDataSource('live');
    } catch (e: any) {
      setError(e.message || 'Failed to refresh channels');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    channels: displayedChannels,
    totalCount: allChannels.length,
    filteredCount: filteredChannels.length,
    hasMore, loadMore, refreshChannels,
    countries: availableCountries,
    categories: availableCategories,
    loading, error, dataSource,
    searchQuery, setSearchQuery,
    selectedCountry, setSelectedCountry,
    selectedCategory, setSelectedCategory,
    clearFilters,
    hasFilters: !!(searchQuery || selectedCountry || selectedCategory),
  };
}
