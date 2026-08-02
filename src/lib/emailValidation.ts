// List of common disposable/fake email domains
const DISPOSABLE_DOMAINS = [
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'tempmail.net',
  'temp-mail.org', 'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net',
  'guerrillamail.biz', 'sharklasers.com', 'grr.la', 'guerrillamail.de',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'maildrop.cc', 'getairmail.com', 'getnada.com', 'yopmail.com', 'yopmail.fr',
  'throwaway.email', 'throwawaymail.com', 'fakeinbox.com', 'fakemailgenerator.com',
  'mohmal.com', 'dispostable.com', 'mintemail.com', 'tempinbox.com',
  'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashmail.me',
  'mailnesia.com', 'mailnator.com', 'spamgourmet.com', 'sneakemail.com',
  'mailcatch.com', 'mytrashmail.com', 'mt2015.com', 'thankyou2010.com',
  'trash2009.com', 'mt2009.com', 'trashymail.com', 'antispam.de',
  'spamfree24.org', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree.eu', 'kasmail.com', 'spamherelots.com',
  'devnullmail.com', 'spammotel.com', 'spamspot.com', 'spam.la',
  'spamslicer.com', 'superrito.com', 'teleworm.us', 'tempail.com',
  'tempalias.com', 'tempe-mail.com', 'tempemail.biz', 'tempemail.com',
  'tempinbox.co.uk', 'tempmaildemo.com', 'tempomail.fr', 'temporaryemail.net',
  'temporaryemail.us', 'tempr.email', 'tempsky.com', 'tempthe.net',
  'thanksnospam.info', 'thankyou2010.com', 'thisisnotmyrealemail.com',
  'throwam.com', 'tilien.com', 'tmail.ws', 'tmailinator.com',
  'topranklist.de', 'tradermail.info', 'trash-amil.com', 'trash-mail.at',
  'trash-mail.com', 'trash-mail.de', 'trash2010.com', 'trash2011.com',
  'trashbox.eu', 'trashdevil.com', 'trashdevil.de', 'trashmail.at',
  'trashmail.ws', 'trashmailer.com', 'trbvm.com', 'trbvn.com',
  'trickmail.net', 'trollbox.us', 'turoid.com', 'twinmail.de',
  'tyldd.com', 'uggsrock.com', 'uk2.net', 'upliftnow.com',
  'uplipht.com', 'uroid.com', 'valemail.net', 'venompen.com',
  'veryrealemail.com', 'viditag.com', 'viewcastmedia.com', 'viewcastmedia.net',
  'viewcastmedia.org', 'viralplays.com', 'vkcode.ru', 'vmani.com',
  'vmpanda.com', 'vomoto.com', 'vpn.st', 'vsimcard.com',
  'vubby.com', 'walala.org', 'walkmail.net', 'webemail.me',
  'webm4il.info', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'wetrainbayarea.com', 'wetrainbayarea.org', 'wfgdfhj.tk', 'wg0.com',
  'whopy.com', 'whtjddn.33mail.com', 'whyspam.me', 'wilemail.com',
  'willhackforfood.biz', 'willselfdestruct.com', 'winemaven.info',
  'wolfsmail.tk', 'wollan.info', 'worldspace.link', 'wronghead.com',
  'wuzup.net', 'wuzupmail.net', 'wwwnew.eu', 'wxnw.net',
  'x.ip6.li', 'xagloo.co', 'xagloo.com', 'xemaps.com',
  'xents.com', 'xmaily.com', 'xoxy.net', 'xtenstil.com',
  'yapped.net', 'ycare.de', 'yesey.net', 'ymail.com',
  'yoked.net', 'yomail.info', 'yopmail.co', 'yopmail.pp.ua',
  'yourdomain.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com', 'z1p.biz',
  'za.com', 'zehnminuten.de', 'zehnminutenmail.de', 'zetmail.com',
  'zippymail.info', 'zoaxe.com', 'zoemail.net', 'zoemail.org',
  'zomg.info', 'zxcv.com', 'zxcvbnm.com', 'zzz.com',
  'protonmail.com', // Often used for throwaway purposes
  'tutanota.com', // Often used for throwaway purposes
  'cock.li', 'airmail.cc', '420blaze.it', 'tfwno.gf',
  'mailsac.com', 'inboxkitten.com', 'emailondeck.com', 'burnermail.io',
  'temp-mail.io', 'tempmailaddress.com', 'emailfake.com', 'crazymailing.com',
  'discard.email', 'discardmail.com', 'discardmail.de', 'disposable.com',
  'dropmail.me', 'emlpro.com', 'emailtemporar.ro', 'eyepaste.com',
  'fakemail.net', 'filzmail.com', 'fixmail.tk', 'flu.cc',
  'flurred.com', 'flyinggeek.net', 'freemail.tweakly.net', 'fux0ringduh.com'
];

// Check if email domain is a known disposable email provider
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.includes(domain);
}

// Validate email format and check for disposable emails
export function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim().toLowerCase();
  
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  // Check domain has proper structure
  const domain = trimmed.split('@')[1];
  if (!domain || domain.split('.').length < 2) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  // Check for disposable email
  if (isDisposableEmail(trimmed)) {
    return { valid: false, error: 'Temporary or disposable emails are not allowed. Please use a real email address.' };
  }
  
  // Check for suspicious patterns
  const localPart = trimmed.split('@')[0];
  if (localPart.length < 2) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  // Block obviously fake emails with test/fake patterns
  const fakePatterns = /^(test|fake|temp|disposable|throwaway|spam|noemail|noreply|no-reply)\d*@/i;
  if (fakePatterns.test(trimmed)) {
    return { valid: false, error: 'Please use a real email address' };
  }
  
  return { valid: true };
}
