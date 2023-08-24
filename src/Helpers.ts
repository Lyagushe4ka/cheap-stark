import { TG_CHAT_ID, TG_TOKEN } from "../DEPENDENCIES";
import axios from "axios";


type TimeSeparated = {
  seconds?: number;
  minutes?: number;
  hours?: number;
};

export const sleep = async (from: TimeSeparated, to?: TimeSeparated): Promise<void> => {
  const seconds = from.seconds || 0;
  const minutes = from.minutes || 0;
  const hours = from.hours || 0;
  const msFrom = seconds * 1000 + minutes * 60 * 1000 + hours * 60 * 60 * 1000;
  if (to) {
    const seconds = to.seconds || 0;
    const minutes = to.minutes || 0;
    const hours = to.hours || 0;
    const msTo = seconds * 1000 + minutes * 60 * 1000 + hours * 60 * 60 * 1000;
    const ms = Math.floor(Math.random() * (msTo - msFrom + 1) + msFrom);
    console.log(`Sleeping for ${(ms / (1000 * 60)).toFixed(1)} minutes`);
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  return new Promise(resolve => setTimeout(resolve, msFrom));
};

export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  timeoutInSec = 6,
  logger?: (text: string) => Promise<any>,
): Promise<T> {
  let response: T;
  while (attempts--) {
    if (attempts === Number.MAX_SAFE_INTEGER - 1) {
      attempts = Number.MAX_SAFE_INTEGER;
    }
    try {
      response = await fn();
      break;
    } catch (e: unknown) {
      if (e instanceof Error) {
        const text = `[RETRY] Error while executing function. Message: ${e.message}. Attempts left: ${attempts === Number.MAX_SAFE_INTEGER ? 'infinity' : attempts}`;
        console.log(text);
        if (logger) {
          await logger(text);
        }
      } else {
        const text = `[RETRY] An unexpected error occurred. Attempts left: ${attempts === Number.MAX_SAFE_INTEGER ? 'infinity' : attempts}`;
        console.log(text);
        if (logger) {
          await logger(text);
        }
      }
      if (attempts === 0) {
        throw e;
      }
      await sleep({ seconds: timeoutInSec });
    }
  }
  return response!;
}

export function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function sendTelegramMessage(message: string) {

  if (TG_CHAT_ID === 0 || TG_TOKEN === '') {
    return;
  }

  // Escape markdown special characters
  const escapedMessage = message.replace(/([*_[\]()~`>#+\-={}.!])/g, '\\$1');

  // Truncate the message if it's too long
  const maxLength = 4096;
  const truncatedMessage = escapedMessage.slice(0, maxLength);

  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text: truncatedMessage,
      parse_mode: 'MarkdownV2',  // Or 'HTML' if you're using HTML tags
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.log(error);
  }
}

export const randomBetween = (min: number, max: number, roundTo?: number): number => {
  const random = Math.random() * (max - min) + min;
  return roundTo !== undefined ? Math.round(random * 10 ** roundTo) / 10 ** roundTo : random;
};
