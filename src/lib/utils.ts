/**
 * Small utility to merge conditional class names.
 * Thin wrapper over clsx + tailwind-merge.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
