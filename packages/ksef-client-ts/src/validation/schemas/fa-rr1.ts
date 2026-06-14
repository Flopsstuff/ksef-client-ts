// @ts-nocheck
// Generated from KSeF XSD schema — do not edit manually
// Run: yarn generate-schemas
import { z } from 'zod';

const TKodFormularza = z.literal("FA_RR");

const TDataCzas = z.string();

const TZnakowy = z.string().min(1).max(256);

const TNaglowek = z.object({
  "KodFormularza": z.object({ '#text': TKodFormularza, "@kodSystemowy": z.literal("FA_RR (1)"), "@wersjaSchemy": z.literal("1-1E") }).strict(),
  "WariantFormularza": z.literal("1"),
  "DataWytworzeniaFa": z.string(),
  "SystemInfo": TZnakowy.optional()
}).strict();

const TNrNIP = z.string().regex(/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/);

const TZnakowy512 = z.string().min(1).max(512);

const TPodmiot1 = z.object({
  "NIP": TNrNIP,
  "Nazwa": TZnakowy512
}).strict();

const TKodKraju = z.enum(["AF", "AX", "AL", "DZ", "AD", "AO", "AI", "AQ", "AG", "AN", "SA", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BE", "BZ", "BJ", "BM", "BT", "BY", "BO", "BQ", "BA", "BW", "BR", "BN", "IO", "BG", "BF", "BI", "XC", "CL", "CN", "HR", "CW", "CY", "TD", "ME", "DK", "DM", "DO", "DJ", "EG", "EC", "ER", "EE", "ET", "FK", "FJ", "PH", "FI", "FR", "TF", "GA", "GM", "GH", "GI", "GR", "GD", "GL", "GE", "GU", "GG", "GY", "GF", "GP", "GT", "GN", "GQ", "GW", "HT", "ES", "HN", "HK", "IN", "ID", "IQ", "IR", "IE", "IS", "IL", "JM", "JP", "YE", "JE", "JO", "KY", "KH", "CM", "CA", "QA", "KZ", "KE", "KG", "KI", "CO", "KM", "CG", "CD", "KP", "XK", "CR", "CU", "KW", "LA", "LS", "LB", "LR", "LY", "LI", "LT", "LV", "LU", "MK", "MG", "YT", "MO", "MW", "MV", "MY", "ML", "MT", "MP", "MA", "MQ", "MR", "MU", "MX", "XL", "FM", "UM", "MD", "MC", "MN", "MS", "MZ", "MM", "NA", "NR", "NP", "NL", "DE", "NE", "NG", "NI", "NU", "NF", "NO", "NC", "NZ", "PS", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PN", "PF", "PL", "GS", "PT", "PR", "CF", "CZ", "KR", "ZA", "RE", "RU", "RO", "RW", "EH", "BL", "KN", "LC", "MF", "VC", "SV", "WS", "AS", "SM", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SO", "LK", "PM", "US", "SZ", "SD", "SS", "SR", "SJ", "SH", "SY", "CH", "SE", "TJ", "TH", "TW", "TZ", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TV", "UG", "UA", "UY", "UZ", "VU", "WF", "VA", "HU", "VE", "GB", "VN", "IT", "TL", "CI", "BV", "CX", "IM", "SX", "CK", "VI", "VG", "HM", "CC", "MH", "FO", "SB", "ST", "TC", "ZM", "CV", "ZW", "AE", "XI"]);

const TGLN = z.string().min(1).max(13);

const TAdres = z.object({
  "KodKraju": TKodKraju,
  "AdresL1": TZnakowy512,
  "AdresL2": TZnakowy512.optional(),
  "GLN": TGLN.optional()
}).strict();

const TAdresEmail = z.string().min(3).max(255).regex(/^(.)+@(.)+$/);

const TNumerTelefonu = z.string().min(1).max(16);

const TStatusInfoPodatnika = z.enum(["1", "2", "3", "4"]);

const TZnakowy20 = z.string().min(1).max(20);

const TNIPIdWew = z.string().min(1).max(20).regex(/^[1-9]((\d[1-9])|([1-9]\d))\d{7}-\d{5}$/);

const TWybor1 = z.literal("1");

const TPodmiot3 = z.object({
  "NIP": TNrNIP.optional(),
  "IDWew": TNIPIdWew.optional(),
  "BrakID": TWybor1.optional(),
  "Nazwa": TZnakowy512
}).strict();

const TRolaPodmiotu3 = z.enum(["1", "2", "3", "5", "6", "7", "8", "9", "10", "11"]);

const TKodWaluty = z.enum(["AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BOV", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF", "CHW", "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLL", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYI", "UYU", "UYW", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XAG", "XAU", "XBA", "XBB", "XBC", "XBD", "XCD", "XCG", "XDR", "XOF", "XPD", "XPF", "XPT", "XSU", "XUA", "XXX", "YER", "ZAR", "ZMW", "ZWL"]);

const TData = z.string();

const TDataT = z.string();

const TKwotowy = z.string().regex(/^-?([1-9]\d{0,15}|0)(\.\d{1,2})?$/);

const TRodzajFaktury = z.enum(["VAT_RR", "KOR_VAT_RR"]);

const TTypKorekty = z.enum(["1", "2", "3", "4"]);

const TNumerKSeF = z.string().regex(/^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})-?([0-9A-F]{6})-([0-9A-F]{2})$/);

const TNaturalny = z.string();

const TKluczWartosc = z.object({
  "NrWiersza": TNaturalny.optional(),
  "Klucz": TZnakowy,
  "Wartosc": TZnakowy
}).strict();

const TZnakowy50 = z.string().min(1).max(50);

const TIlosci = z.string().regex(/^-?([1-9]\d{0,15}|0)(\.\d{1,6})?$/);

const TKwotowy2 = z.string().regex(/^-?([1-9]\d{0,13}|0)(\.\d{1,8})?$/);

const TProcentowy = z.coerce.number().min(0).max(100);

const TStawkaPodatku = z.enum(["6.5", "7"]);

const TFormaPlatnosci = z.literal("1");

const TNrRB = z.string().min(10).max(34);

const SWIFT_Type = z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3}){0,1}$/);

const TRachunekBankowy = z.object({
  "NrRB": TNrRB,
  "SWIFT": SWIFT_Type.optional(),
  "NazwaBanku": TZnakowy.optional(),
  "OpisRachunku": TZnakowy.optional()
}).strict();

const TTekstowy = z.string().min(1).max(3500);

const TNrKRS = z.string().regex(/^\d{10}$/);

const TNrREGON = z.union([z.string().regex(/^\d{9}$/), z.string().regex(/^\d{14}$/)]);


export const FA_RR1Schema = z.object({
  "Naglowek": TNaglowek,
  "Podmiot1": z.object({
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres,
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
}).strict()).min(0).max(3)).optional(),
  "NrKontrahenta": TZnakowy.optional()
}).strict(),
  "Podmiot2": z.object({
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres,
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
}).strict()).min(0).max(3)).optional(),
  "StatusInfoPodatnika": TStatusInfoPodatnika.optional()
}).strict(),
  "Podmiot3": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DaneIdentyfikacyjne": TPodmiot3,
  "Adres": TAdres.optional(),
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
}).strict()).min(0).max(3)).optional(),
  "Rola": TRolaPodmiotu3.optional(),
  "RolaInna": TWybor1.optional(),
  "OpisRoli": TZnakowy.optional()
}).strict()).min(0).max(100)).optional(),
  "FakturaRR": z.object({
  "KodWaluty": TKodWaluty,
  "P_1M": TZnakowy.optional(),
  "P_4A": TDataT.optional(),
  "P_4B": TDataT,
  "P_4C": TZnakowy,
  "P_11_1": TKwotowy,
  "P_11_1W": TKwotowy.optional(),
  "P_11_2": TKwotowy,
  "P_11_2W": TKwotowy.optional(),
  "P_12_1": TKwotowy,
  "P_12_1W": TKwotowy.optional(),
  "P_12_2": TZnakowy,
  "RodzajFaktury": TRodzajFaktury,
  "PrzyczynaKorekty": TZnakowy.optional(),
  "TypKorekty": TTypKorekty.optional(),
  "DaneFaKorygowanej": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DataWystFaKorygowanej": TDataT,
  "NrFaKorygowanej": TZnakowy,
  "NrKSeF": TWybor1.optional(),
  "NrKSeFFaKorygowanej": TNumerKSeF.optional(),
  "NrKSeFN": TWybor1.optional()
}).strict()).min(1).max(50000)).optional(),
  "NrFaKorygowany": TZnakowy.optional(),
  "Podmiot1K": z.object({
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres
}).strict().optional(),
  "Podmiot2K": z.object({
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres
}).strict().optional(),
  "DokumentZaplaty": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "NrDokumentu": TZnakowy,
  "DataDokumentu": TData.optional()
}).strict()).min(0).max(50)).optional(),
  "DodatkowyOpis": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TKluczWartosc).min(0).max(10000)).optional(),
  "FakturaRRWiersz": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "NrWierszaFa": TNaturalny,
  "UU_ID": TZnakowy50.optional(),
  "P_4AA": TDataT.optional(),
  "P_5": TZnakowy,
  "GTIN": TZnakowy20.optional(),
  "PKWiU": TZnakowy50.optional(),
  "CN": TZnakowy50.optional(),
  "P_6A": TZnakowy,
  "P_6B": TIlosci,
  "P_6C": TZnakowy,
  "P_7": TKwotowy2,
  "P_8": TKwotowy,
  "P_9": TStawkaPodatku,
  "P_10": TKwotowy,
  "P_11": TKwotowy,
  "StanPrzed": TWybor1.optional(),
  "KursWaluty": TIlosci.optional()
}).strict()).min(0).max(10000)).optional(),
  "Rozliczenie": z.object({
  "Obciazenia": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Kwota": TKwotowy,
  "Powod": TZnakowy
}).strict()).min(0).max(100)).optional(),
  "SumaObciazen": TKwotowy.optional(),
  "Odliczenia": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Kwota": TKwotowy,
  "Powod": TZnakowy
}).strict()).min(0).max(100)).optional(),
  "SumaOdliczen": TKwotowy.optional(),
  "DoZaplaty": TKwotowy.optional(),
  "DoRozliczenia": TKwotowy.optional()
}).strict().optional(),
  "Platnosc": z.object({
  "FormaPlatnosci": TFormaPlatnosci.optional(),
  "PlatnoscInna": TWybor1.optional(),
  "OpisPlatnosci": TZnakowy.optional(),
  "RachunekBankowy1": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TRachunekBankowy).min(0).max(3)).optional(),
  "RachunekBankowy2": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TRachunekBankowy).min(0).max(3)).optional(),
  "IPKSeF": z.string().min(1).max(13).regex(/^[0-9]{3}[a-zA-Z0-9]{10}$/).optional(),
  "LinkDoPlatnosci": z.string().min(1).max(512).regex(/^(https?):\/\/([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(:[0-9]{1,5})?(\/[^\s?#]*)?\?([^#\s]*&)?IPKSeF=[0-9]{3}[a-zA-Z0-9]{10}(&[^#\s]*)?(#.*)?$/).optional()
}).strict().optional()
}).strict(),
  "Stopka": z.object({
  "Informacje": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "StopkaFaktury": TTekstowy.optional()
}).strict()).min(0).max(3)).optional(),
  "Rejestry": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "PelnaNazwa": TZnakowy.optional(),
  "KRS": TNrKRS.optional(),
  "REGON": TNrREGON.optional(),
  "BDO": z.string().min(1).max(9).optional()
}).strict()).min(0).max(100)).optional()
}).strict().optional()
}).strict();

export type FA_RR1 = z.infer<typeof FA_RR1Schema>;
