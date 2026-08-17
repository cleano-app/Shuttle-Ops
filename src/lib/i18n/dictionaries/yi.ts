import type { DictionaryKey } from "./en";

// Yiddish (RTL). IMPORTANT: this is a good-faith starting point, not a
// verified translation — Yiddish has real community/dialect variation
// (spelling conventions in particular differ between YIVO-standardized
// and much Hasidic-community usage), and given this app's actual likely
// user base, getting this right matters more than most localization
// work. Have a native speaker from the target community review every
// string here before this ships to real users.
const yi: Record<DictionaryKey, string> = {
  app_name: "שאָטל אָפּס",
  nav_dashboard: "הויפט זייט",
  nav_book: "באשטעלן אַ נסיעה",
  nav_bookings: "מײַנע באַשטעלונגען",
  nav_addresses: "אָפּגעהיטענע אַדרעסן",
  nav_parcels: "פּעקלעך",
  nav_profile: "פּראָפיל",
  nav_sign_out: "אַרויסגיין",
  nav_referred: "רעקאָמענדירטע פּאַסאַזשירן",
  nav_sponsored: "געשטיצטע באַשטעלונגען",
  nav_refer: "רעקאָמענדירן אַ פּאַסאַזשיר",

  auth_sign_in: "אַרײַנלאָגן",
  auth_sign_up: "רעגיסטרירן",
  auth_email: "בליצפאָסט",
  auth_password: "פּאַראָל",
  auth_full_name: "פולער נאָמען",
  auth_phone: "טעלעפאָן",
  auth_forgot_password: "פאַרגעסן דעם פּאַראָל?",
  auth_no_account: "נישט קיין קאָנטע נאָך?",
  auth_have_account: "שוין דאָ אַ קאָנטע?",
  auth_check_email: "באַשטעטיקט אײַער קאָנטע דורך דער בליצפאָסט, דערנאָך לאָגט אײַן.",
  auth_preferred_language: "בעסטע שפּראַך",
  auth_reset_title: "איבערשטעלן פּאַראָל",
  auth_reset_instructions: "גיט אַרײַן אײַער בליצפאָסט און מיר וועלן שיקן אַ לינק.",
  auth_reset_send: "שיקט דעם לינק",
  auth_reset_sent: "אויב דאָס בליצפאָסט האָט אַ קאָנטע, איז אַ לינק שוין אונטערוועגס.",
  auth_new_password_title: "שטעלן אַ נײַעם פּאַראָל",
  auth_new_password: "נײַער פּאַראָל",
  auth_new_password_save: "אָפּהיטן פּאַראָל",

  dashboard_welcome: "ברוך הבא צוריק",
  dashboard_upcoming: "קומענדיקע אָפּפאָרן",
  bookings_none: "איר האָט נאָך קיין באַשטעלונגען.",
  bookings_reference: "נומער",
  bookings_status: "סטאַטוס",
  bookings_request_cancel: "בעטן אָפּזאָגן",
  bookings_cancel_reason: "פֿאַרוואָס זאָגט איר אָפּ?",
  bookings_cancel_submit: "שיקן די בקשה",

  book_departure: "אָפּפאָר",
  book_outbound: "אַהין",
  book_return: "צוריק (נישט נייטיק)",
  book_seats_available: "פרייע זיצן",
  book_hold_available: "פרייע פּלאַץ פֿאַר באַגאַזש",
  book_wheelchair_available: "פרייע פּלאַץ פֿאַר ראָד־שטול",
  book_category: "טיפ פּאַסאַזשיר",
  book_pickup: "אַדרעס פֿון אױפֿנעמען",
  book_dropoff: "אַדרעס פֿון אַראָפּלאָזן",
  book_luggage_large: "גרויסע זעק",
  book_luggage_small: "קליינע זעק",
  book_luggage_hand: "האַנט־באַגאַזש",
  book_luggage_oversize: "זייער גרויסע זאַכן",
  book_wheelchair_needed: "נייטיק אַ פּלאַץ פֿאַר ראָד־שטול",
  book_notes: "באַמערקונגען פֿאַרן אָפיס",
  book_submit: "רעזערווירן",
  book_deposit_notice:
    "אײַער פּלאַץ איז נאָר צײַטווײַליק ביז מ'באַקומט אַ פֿאָרויסצאָלונג. דער אָפיס וועט זיך פֿאַרבינדן וועגן צאָלן — צאָלן אָנליין איז נאָך נישט פֿאַראַן.",

  addresses_none: "נאָך קיין אָפּגעהיטענע אַדרעסן.",
  addresses_add: "צוגעבן אַן אַדרעס",
  addresses_search: "זוכן פֿאַראַנענע אַדרעסן",
  addresses_new: "אָדער אַרײַנשרײַבן אַ נײַעם אַדרעס",
  addresses_label: "צייכן (למשל, היים)",
  addresses_line1: "אַדרעס שורה 1",
  addresses_line2: "אַדרעס שורה 2",
  addresses_city: "שטאָט",
  addresses_postcode: "פּאָסט־נומער",
  addresses_save: "אָפּהיטן אַדרעס",
  addresses_delete: "אַרויסנעמען",

  parcels_none: "נאָך קיין פּעקלעך באַשטעלט.",
  parcels_book: "באַשטעלן אַ פּעקל",
  parcels_recipient_name: "נאָמען פֿונעם אָנקומער",
  parcels_recipient_phone: "טעלעפאָן פֿונעם אָנקומער",
  parcels_size: "גרייס פֿונעם פּעקל",
  parcels_description: "באַשרײַבונג",
  parcels_prohibited_declared: "איך באַשטעטיק אַז דאָס פּעקל האָט נישט קיין פֿאַרבאָטענע זאַכן",
  parcels_submit: "באַשטעלן דאָס פּעקל",

  profile_title: "מײַן פּראָפיל",
  profile_save: "אָפּהיטן ענדערונגען",
  profile_mobility_needs: "באַדערפֿענישן פֿון באַוועגונג",
  profile_emergency_contact_name: "נאָמען פֿאַר נויטפאַל",
  profile_emergency_contact_phone: "טעלעפאָן פֿאַר נויטפאַל",

  referrer_dashboard_title: "הויפט זייט פֿאַר רעקאָמענדירער",
  referrer_refer_title: "רעקאָמענדירן אַ נײַעם פּאַסאַזשיר",
  referrer_sponsor_title: "געשטיצטע באַשטעלונגען",
  referrer_no_referred: "נאָך קיין פּאַסאַזשירן רעקאָמענדירט.",
  referrer_no_sponsored: "נאָך קיין געשטיצטע באַשטעלונגען.",

  common_save: "אָפּהיטן",
  common_cancel: "אָפּזאָגן",
  common_loading: "לאָדט…",
  common_error_generic: "עפּעס איז נישט גוט געגאַנגען. פּרוּווט נאָך אַ מאָל.",
  common_required: "נייטיק",
};

export default yi;
