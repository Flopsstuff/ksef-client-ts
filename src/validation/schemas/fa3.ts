// @ts-nocheck
// Generated from KSeF XSD schema — do not edit manually
// Run: yarn generate-schemas
import { z } from 'zod';

const TKodFormularza = z.literal("FA");

const TDataCzas = z.string();

const TZnakowy = z.string().min(1).max(256);

const TNaglowek = z.object({
  "KodFormularza": z.object({ '#text': TKodFormularza, "@kodSystemowy": z.literal("FA (3)"), "@wersjaSchemy": z.literal("1-0E") }),
  "WariantFormularza": z.literal("3"),
  "DataWytworzeniaFa": z.string(),
  "SystemInfo": TZnakowy.optional()
});

const TKodyKrajowUE = z.enum(["AT", "BE", "BG", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "EL", "HR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "XI"]);

const TNrNIP = z.string().regex(/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/);

const TZnakowy512 = z.string().min(1).max(512);

const TPodmiot1 = z.object({
  "NIP": TNrNIP,
  "Nazwa": TZnakowy512
});

const TKodKraju = z.enum(["AF", "AX", "AL", "DZ", "AD", "AO", "AI", "AQ", "AG", "AN", "SA", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BE", "BZ", "BJ", "BM", "BT", "BY", "BO", "BQ", "BA", "BW", "BR", "BN", "IO", "BG", "BF", "BI", "XC", "CL", "CN", "HR", "CW", "CY", "TD", "ME", "DK", "DM", "DO", "DJ", "EG", "EC", "ER", "EE", "ET", "FK", "FJ", "PH", "FI", "FR", "TF", "GA", "GM", "GH", "GI", "GR", "GD", "GL", "GE", "GU", "GG", "GY", "GF", "GP", "GT", "GN", "GQ", "GW", "HT", "ES", "HN", "HK", "IN", "ID", "IQ", "IR", "IE", "IS", "IL", "JM", "JP", "YE", "JE", "JO", "KY", "KH", "CM", "CA", "QA", "KZ", "KE", "KG", "KI", "CO", "KM", "CG", "CD", "KP", "XK", "CR", "CU", "KW", "LA", "LS", "LB", "LR", "LY", "LI", "LT", "LV", "LU", "MK", "MG", "YT", "MO", "MW", "MV", "MY", "ML", "MT", "MP", "MA", "MQ", "MR", "MU", "MX", "XL", "FM", "UM", "MD", "MC", "MN", "MS", "MZ", "MM", "NA", "NR", "NP", "NL", "DE", "NE", "NG", "NI", "NU", "NF", "NO", "NC", "NZ", "PS", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PN", "PF", "PL", "GS", "PT", "PR", "CF", "CZ", "KR", "ZA", "RE", "RU", "RO", "RW", "EH", "BL", "KN", "LC", "MF", "VC", "SV", "WS", "AS", "SM", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SO", "LK", "PM", "US", "SZ", "SD", "SS", "SR", "SJ", "SH", "SY", "CH", "SE", "TJ", "TH", "TW", "TZ", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TV", "UG", "UA", "UY", "UZ", "VU", "WF", "VA", "HU", "VE", "GB", "VN", "IT", "TL", "CI", "BV", "CX", "IM", "SX", "CK", "VI", "VG", "HM", "CC", "MH", "FO", "SB", "ST", "TC", "ZM", "CV", "ZW", "AE", "XI"]);

const TGLN = z.string().min(1).max(13);

const TAdres = z.object({
  "KodKraju": TKodKraju,
  "AdresL1": TZnakowy512,
  "AdresL2": TZnakowy512.optional(),
  "GLN": TGLN.optional()
});

const TAdresEmail = z.string().min(3).max(255).regex(/^(.)+@(.)+$/);

const TNumerTelefonu = z.string().min(1).max(16);

const TStatusInfoPodatnika = z.enum(["1", "2", "3", "4"]);

const TNrVatUE = z.string().regex(/^(\d|[A-Z]|\+|\*){1,12}$/);

const TNrIdentyfikacjiPodatkowej = z.string().min(1).max(50);

const TWybor1 = z.literal("1");

const TPodmiot2 = z.object({
  "NIP": TNrNIP.optional(),
  "KodUE": TKodyKrajowUE.optional(),
  "NrVatUE": TNrVatUE.optional(),
  "KodKraju": TKodKraju.optional(),
  "NrID": z.string().min(1).max(50).optional(),
  "BrakID": TWybor1.optional(),
  "Nazwa": TZnakowy512.optional()
});

const TZnakowy50 = z.string().min(1).max(50);

const TZnakowy20 = z.string().min(1).max(20);

const TNIPIdWew = z.string().min(1).max(20).regex(/^[1-9]((\d[1-9])|([1-9]\d))\d{7}-\d{5}$/);

const TPodmiot3 = z.object({
  "NIP": TNrNIP.optional(),
  "IDWew": TNIPIdWew.optional(),
  "KodUE": TKodyKrajowUE.optional(),
  "NrVatUE": TNrVatUE.optional(),
  "KodKraju": TKodKraju.optional(),
  "NrID": z.string().min(1).max(50).optional(),
  "BrakID": TWybor1.optional(),
  "Nazwa": TZnakowy512.optional()
});

const TRolaPodmiotu3 = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);

const TProcentowy = z.coerce.number().min(0).max(100);

const TRolaPodmiotuUpowaznionego = z.enum(["1", "2", "3"]);

const TKodWaluty = z.enum(["AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BOV", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF", "CHW", "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLL", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYI", "UYU", "UYW", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XAG", "XAU", "XBA", "XBB", "XBC", "XBD", "XCD", "XCG", "XDR", "XOF", "XPD", "XPF", "XPT", "XSU", "XUA", "XXX", "YER", "ZAR", "ZMW", "ZWL"]);

const TData = z.string();

const TDataT = z.string();

const TKwotowy = z.string().regex(/^-?([1-9]\d{0,15}|0)(\.\d{1,2})?$/);

const TIlosci = z.string().regex(/^-?([1-9]\d{0,15}|0)(\.\d{1,6})?$/);

const TWybor1_2 = z.enum(["1", "2"]);

const TNaturalny = z.string();

const TRodzajFaktury = z.enum(["VAT", "KOR", "ZAL", "ROZ", "UPR", "KOR_ZAL", "KOR_ROZ"]);

const TTypKorekty = z.enum(["1", "2", "3"]);

const TNumerKSeF = z.string().regex(/^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})-?([0-9A-F]{6})-([0-9A-F]{2})$/);

const TKluczWartosc = z.object({
  "NrWiersza": TNaturalny.optional(),
  "Klucz": TZnakowy,
  "Wartosc": TZnakowy
});

const TKwotowy2 = z.string().regex(/^-?([1-9]\d{0,13}|0)(\.\d{1,8})?$/);

const TStawkaPodatku = z.enum(["23", "22", "8", "7", "5", "4", "3", "0 KR", "0 WDT", "0 EX", "zw", "oo", "np I", "np II"]);

const TGTU = z.enum(["GTU_01", "GTU_02", "GTU_03", "GTU_04", "GTU_05", "GTU_06", "GTU_07", "GTU_08", "GTU_09", "GTU_10", "GTU_11", "GTU_12", "GTU_13"]);

const TOznaczenieProcedury = z.enum(["WSTO_EE", "IED", "TT_D", "I_42", "I_63", "B_SPV", "B_SPV_DOSTAWA", "B_MPV_PROWIZJA"]);

const TFormaPlatnosci = z.enum(["1", "2", "3", "4", "5", "6", "7"]);

const TNrRB = z.string().min(10).max(34);

const SWIFT_Type = z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3}){0,1}$/);

const TRachunekWlasnyBanku = z.enum(["1", "2", "3"]);

const TRachunekBankowy = z.object({
  "NrRB": TNrRB,
  "SWIFT": SWIFT_Type.optional(),
  "RachunekWlasnyBanku": TRachunekWlasnyBanku.optional(),
  "NazwaBanku": TZnakowy.optional(),
  "OpisRachunku": TZnakowy.optional()
});

const TDataU = z.string();

const TRodzajTransportu = z.enum(["1", "2", "3", "4", "5", "7", "8"]);

const TLadunek = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]);

const TOznaczenieProceduryZ = z.enum(["WSTO_EE", "IED", "TT_D", "B_SPV", "B_SPV_DOSTAWA", "B_MPV_PROWIZJA"]);

const TTekstowy = z.string().min(1).max(3500);

const TNrKRS = z.string().regex(/^\d{10}$/);

const TNrREGON = z.union([z.string().regex(/^\d{9}$/), z.string().regex(/^\d{14}$/)]);

const TZnakowy2 = z.string().min(0).max(256);


export const FA3Schema = z.object({
  "Naglowek": TNaglowek,
  "Podmiot1": z.object({
  "PrefiksPodatnika": z.literal("PL").optional(),
  "NrEORI": TZnakowy.optional(),
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres,
  "AdresKoresp": z.object({
  "KodKraju": TKodKraju,
  "AdresL1": TZnakowy512,
  "AdresL2": TZnakowy512.optional(),
  "GLN": TGLN.optional()
}).optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
})).min(0).max(3)).optional(),
  "StatusInfoPodatnika": TStatusInfoPodatnika.optional()
}),
  "Podmiot2": z.object({
  "NrEORI": TZnakowy.optional(),
  "DaneIdentyfikacyjne": TPodmiot2,
  "Adres": TAdres.optional(),
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
})).min(0).max(3)).optional(),
  "NrKlienta": TZnakowy.optional(),
  "IDNabywcy": z.string().min(1).max(32).optional(),
  "JST": z.enum(["1", "2"]),
  "GV": z.enum(["1", "2"])
}),
  "Podmiot3": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "IDNabywcy": z.string().min(1).max(32).optional(),
  "NrEORI": TZnakowy.optional(),
  "DaneIdentyfikacyjne": TPodmiot3,
  "Adres": TAdres.optional(),
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Email": TAdresEmail.optional(),
  "Telefon": TNumerTelefonu.optional()
})).min(0).max(3)).optional(),
  "Rola": TRolaPodmiotu3.optional(),
  "RolaInna": TWybor1.optional(),
  "OpisRoli": TZnakowy.optional(),
  "Udzial": TProcentowy.optional(),
  "NrKlienta": TZnakowy.optional()
})).min(0).max(100)).optional(),
  "PodmiotUpowazniony": z.object({
  "NrEORI": TZnakowy.optional(),
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres,
  "AdresKoresp": TAdres.optional(),
  "DaneKontaktowe": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "EmailPU": TAdresEmail.optional(),
  "TelefonPU": TNumerTelefonu.optional()
})).min(0).max(3)).optional(),
  "RolaPU": TRolaPodmiotuUpowaznionego
}).optional(),
  "Fa": z.object({
  "KodWaluty": TKodWaluty,
  "P_1": TDataT,
  "P_1M": TZnakowy.optional(),
  "P_2": TZnakowy,
  "WZ": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TZnakowy).min(0).max(1000)).optional(),
  "P_6": TDataT.optional(),
  "OkresFa": z.object({
  "P_6_Od": TDataT,
  "P_6_Do": TDataT
}).optional(),
  "P_13_1": TKwotowy.optional(),
  "P_14_1": TKwotowy.optional(),
  "P_14_1W": TKwotowy.optional(),
  "P_13_2": TKwotowy.optional(),
  "P_14_2": TKwotowy.optional(),
  "P_14_2W": TKwotowy.optional(),
  "P_13_3": TKwotowy.optional(),
  "P_14_3": TKwotowy.optional(),
  "P_14_3W": TKwotowy.optional(),
  "P_13_4": TKwotowy.optional(),
  "P_14_4": TKwotowy.optional(),
  "P_14_4W": TKwotowy.optional(),
  "P_13_5": TKwotowy.optional(),
  "P_14_5": TKwotowy.optional(),
  "P_13_6_1": TKwotowy.optional(),
  "P_13_6_2": TKwotowy.optional(),
  "P_13_6_3": TKwotowy.optional(),
  "P_13_7": TKwotowy.optional(),
  "P_13_8": TKwotowy.optional(),
  "P_13_9": TKwotowy.optional(),
  "P_13_10": TKwotowy.optional(),
  "P_13_11": TKwotowy.optional(),
  "P_15": TKwotowy,
  "KursWalutyZ": TIlosci.optional(),
  "Adnotacje": z.object({
  "P_16": TWybor1_2,
  "P_17": TWybor1_2,
  "P_18": TWybor1_2,
  "P_18A": TWybor1_2,
  "Zwolnienie": z.union([z.object({ "P_19": TWybor1, "P_19A": TZnakowy.optional(), "P_19B": TZnakowy.optional(), "P_19C": TZnakowy.optional() }), z.object({ "P_19N": TWybor1 })]),
  "NoweSrodkiTransportu": z.union([z.object({ "P_22": TWybor1, "P_42_5": TWybor1_2, "NowySrodekTransportu": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "P_22A": TDataT,
  "P_NrWierszaNST": TNaturalny,
  "P_22BMK": TZnakowy.optional(),
  "P_22BMD": TZnakowy.optional(),
  "P_22BK": TZnakowy.optional(),
  "P_22BNR": TZnakowy.optional(),
  "P_22BRP": TZnakowy.optional(),
  "P_22B": TZnakowy.optional(),
  "P_22B1": TZnakowy.optional(),
  "P_22B2": TZnakowy.optional(),
  "P_22B3": TZnakowy.optional(),
  "P_22B4": TZnakowy.optional(),
  "P_22BT": TZnakowy.optional(),
  "P_22C": TZnakowy.optional(),
  "P_22C1": TZnakowy.optional(),
  "P_22D": TZnakowy.optional(),
  "P_22D1": TZnakowy.optional()
})).min(1).max(10000)) }), z.object({ "P_22N": TWybor1 })]),
  "P_23": TWybor1_2,
  "PMarzy": z.union([z.object({ "P_PMarzy": TWybor1, "P_PMarzy_2": TWybor1.optional(), "P_PMarzy_3_1": TWybor1.optional(), "P_PMarzy_3_2": TWybor1.optional(), "P_PMarzy_3_3": TWybor1.optional() }), z.object({ "P_PMarzyN": TWybor1 })])
}),
  "RodzajFaktury": TRodzajFaktury,
  "PrzyczynaKorekty": TZnakowy.optional(),
  "TypKorekty": TTypKorekty.optional(),
  "DaneFaKorygowanej": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DataWystFaKorygowanej": TDataT,
  "NrFaKorygowanej": TZnakowy,
  "NrKSeF": TWybor1.optional(),
  "NrKSeFFaKorygowanej": TNumerKSeF.optional(),
  "NrKSeFN": TWybor1.optional()
})).min(1).max(50000)).optional(),
  "OkresFaKorygowanej": TZnakowy.optional(),
  "NrFaKorygowany": TZnakowy.optional(),
  "Podmiot1K": z.object({
  "PrefiksPodatnika": TKodyKrajowUE.optional(),
  "DaneIdentyfikacyjne": TPodmiot1,
  "Adres": TAdres
}).optional(),
  "Podmiot2K": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DaneIdentyfikacyjne": TPodmiot2,
  "Adres": TAdres.optional(),
  "IDNabywcy": z.string().min(1).max(32).optional()
})).min(0).max(101)).optional(),
  "P_15ZK": TKwotowy.optional(),
  "KursWalutyZK": TIlosci.optional(),
  "ZaliczkaCzesciowa": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "P_6Z": TDataT,
  "P_15Z": TKwotowy,
  "KursWalutyZW": TIlosci.optional()
})).min(0).max(31)).optional(),
  "FP": TWybor1.optional(),
  "TP": TWybor1.optional(),
  "DodatkowyOpis": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TKluczWartosc).min(0).max(10000)).optional(),
  "FakturaZaliczkowa": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.union([z.object({ "NrKSeFZN": TWybor1, "NrFaZaliczkowej": TZnakowy }), z.object({ "NrKSeFFaZaliczkowej": TNumerKSeF })])).min(0).max(100)).optional(),
  "ZwrotAkcyzy": TWybor1.optional(),
  "FaWiersz": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "NrWierszaFa": TNaturalny,
  "UU_ID": TZnakowy50.optional(),
  "P_6A": TDataT.optional(),
  "P_7": TZnakowy512.optional(),
  "Indeks": TZnakowy50.optional(),
  "GTIN": TZnakowy20.optional(),
  "PKWiU": TZnakowy50.optional(),
  "CN": TZnakowy50.optional(),
  "PKOB": TZnakowy50.optional(),
  "P_8A": TZnakowy.optional(),
  "P_8B": TIlosci.optional(),
  "P_9A": TKwotowy2.optional(),
  "P_9B": TKwotowy2.optional(),
  "P_10": TKwotowy2.optional(),
  "P_11": TKwotowy.optional(),
  "P_11A": TKwotowy.optional(),
  "P_11Vat": TKwotowy.optional(),
  "P_12": TStawkaPodatku.optional(),
  "P_12_XII": TProcentowy.optional(),
  "P_12_Zal_15": TWybor1.optional(),
  "KwotaAkcyzy": TKwotowy.optional(),
  "GTU": TGTU.optional(),
  "Procedura": TOznaczenieProcedury.optional(),
  "KursWaluty": TIlosci.optional(),
  "StanPrzed": TWybor1.optional()
})).min(0).max(10000)).optional(),
  "Rozliczenie": z.object({
  "Obciazenia": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Kwota": TKwotowy,
  "Powod": TZnakowy
})).min(0).max(100)).optional(),
  "SumaObciazen": TKwotowy.optional(),
  "Odliczenia": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Kwota": TKwotowy,
  "Powod": TZnakowy
})).min(0).max(100)).optional(),
  "SumaOdliczen": TKwotowy.optional(),
  "DoZaplaty": TKwotowy.optional(),
  "DoRozliczenia": TKwotowy.optional()
}).optional(),
  "Platnosc": z.object({
  "Zaplacono": TWybor1.optional(),
  "DataZaplaty": TData.optional(),
  "ZnacznikZaplatyCzesciowej": TWybor1_2.optional(),
  "ZaplataCzesciowa": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "KwotaZaplatyCzesciowej": TKwotowy,
  "DataZaplatyCzesciowej": TData,
  "FormaPlatnosci": TFormaPlatnosci.optional(),
  "PlatnoscInna": TWybor1.optional(),
  "OpisPlatnosci": TZnakowy.optional()
})).min(1).max(100)).optional(),
  "TerminPlatnosci": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "Termin": TData.optional(),
  "TerminOpis": z.object({
  "Ilosc": z.coerce.number().int(),
  "Jednostka": TZnakowy50,
  "ZdarzeniePoczatkowe": TZnakowy
}).optional()
})).min(0).max(100)).optional(),
  "FormaPlatnosci": TFormaPlatnosci.optional(),
  "PlatnoscInna": TWybor1.optional(),
  "OpisPlatnosci": TZnakowy.optional(),
  "RachunekBankowy": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TRachunekBankowy).min(0).max(100)).optional(),
  "RachunekBankowyFaktora": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TRachunekBankowy).min(0).max(20)).optional(),
  "Skonto": z.object({
  "WarunkiSkonta": TZnakowy,
  "WysokoscSkonta": TZnakowy
}).optional(),
  "LinkDoPlatnosci": z.string().min(1).max(512).regex(/^(https?):\/\/([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(:[0-9]{1,5})?(\/[^\s?#]*)?\?([^#\s]*&)?IPKSeF=[0-9]{3}[a-zA-Z0-9]{10}(&[^#\s]*)?(#.*)?$/).optional(),
  "IPKSeF": z.string().min(1).max(13).regex(/^[0-9]{3}[a-zA-Z0-9]{10}$/).optional()
}).optional(),
  "WarunkiTransakcji": z.object({
  "Umowy": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DataUmowy": TDataU.optional(),
  "NrUmowy": TZnakowy.optional()
})).min(0).max(100)).optional(),
  "Zamowienia": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "DataZamowienia": TDataU.optional(),
  "NrZamowienia": TZnakowy.optional()
})).min(0).max(100)).optional(),
  "NrPartiiTowaru": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TZnakowy).min(0).max(1000)).optional(),
  "WarunkiDostawy": TZnakowy.optional(),
  "KursUmowny": TIlosci.optional(),
  "WalutaUmowna": TKodWaluty.optional(),
  "Transport": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "RodzajTransportu": TRodzajTransportu.optional(),
  "TransportInny": TWybor1.optional(),
  "OpisInnegoTransportu": TZnakowy50.optional(),
  "Przewoznik": z.object({
  "DaneIdentyfikacyjne": TPodmiot2,
  "AdresPrzewoznika": TAdres
}).optional(),
  "NrZleceniaTransportu": TZnakowy.optional(),
  "OpisLadunku": TLadunek.optional(),
  "LadunekInny": TWybor1.optional(),
  "OpisInnegoLadunku": TZnakowy50.optional(),
  "JednostkaOpakowania": TZnakowy.optional(),
  "DataGodzRozpTransportu": TDataCzas.optional(),
  "DataGodzZakTransportu": TDataCzas.optional(),
  "WysylkaZ": TAdres.optional(),
  "WysylkaPrzez": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(TAdres).min(0).max(20)).optional(),
  "WysylkaDo": TAdres.optional()
})).min(0).max(20)).optional(),
  "PodmiotPosredniczacy": TWybor1.optional()
}).optional(),
  "Zamowienie": z.object({
  "WartoscZamowienia": TKwotowy,
  "ZamowienieWiersz": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "NrWierszaZam": TNaturalny,
  "UU_IDZ": TZnakowy50.optional(),
  "P_7Z": TZnakowy512.optional(),
  "IndeksZ": TZnakowy50.optional(),
  "GTINZ": TZnakowy20.optional(),
  "PKWiUZ": TZnakowy50.optional(),
  "CNZ": TZnakowy50.optional(),
  "PKOBZ": TZnakowy50.optional(),
  "P_8AZ": TZnakowy.optional(),
  "P_8BZ": TIlosci.optional(),
  "P_9AZ": TKwotowy2.optional(),
  "P_11NettoZ": TKwotowy.optional(),
  "P_11VatZ": TKwotowy.optional(),
  "P_12Z": TStawkaPodatku.optional(),
  "P_12Z_XII": TProcentowy.optional(),
  "P_12Z_Zal_15": TWybor1.optional(),
  "GTUZ": TGTU.optional(),
  "ProceduraZ": TOznaczenieProceduryZ.optional(),
  "KwotaAkcyzyZ": TKwotowy.optional(),
  "StanPrzedZ": TWybor1.optional()
})).min(1).max(10000))
}).optional()
}),
  "Stopka": z.object({
  "Informacje": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "StopkaFaktury": TTekstowy.optional()
})).min(0).max(3)).optional(),
  "Rejestry": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.object({
  "PelnaNazwa": TZnakowy.optional(),
  "KRS": TNrKRS.optional(),
  "REGON": TNrREGON.optional(),
  "BDO": z.string().min(1).max(9).optional()
})).min(0).max(100)).optional()
}).optional(),
  "Zalacznik": z.object({
  "BlokDanych": z.preprocess(v => Array.isArray(v) ? v : v == null ? [] : [v], z.array(z.any()).min(1).max(1000))
}).optional()
});

export type FA3 = z.infer<typeof FA3Schema>;
