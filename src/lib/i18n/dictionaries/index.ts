import type { Locale } from "../locales";
import en, { type DictionaryKey } from "./en";
import yi from "./yi";
import he from "./he";
import nl from "./nl";

export type Dictionary = Record<DictionaryKey, string>;

export const DICTIONARIES: Record<Locale, Dictionary> = { en, yi, he, nl };

export type { DictionaryKey };
