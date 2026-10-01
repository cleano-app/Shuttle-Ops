import type { Direction } from "./request";

/** One departure as the public booking page sees it — nothing more. */
export interface PublicDay {
  id: string;
  direction: Direction;
  routeName: string;
  departAt: string;
  seatsLeft: number;
  /** "Sunday" */
  weekday: string;
  /** "4 Oct" */
  date: string;
  /** "07:00" UK time */
  time: string;
  /** "22 Tishrei 5787" */
  hebrew: string;
  /** "Succos", "Erev Yom Kippur", "Shabbos" … */
  holiday: string | null;
}
