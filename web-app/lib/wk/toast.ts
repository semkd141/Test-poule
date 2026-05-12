"use client";

import { toast as sonnerToast } from "sonner";

/** Error / validation feedback (replaces `alert` for failures). */
export function toastError(message: string, options?: { description?: string }) {
  sonnerToast.error(message, {
    duration: 6500,
    description: options?.description,
  });
}

/** Success feedback. */
export function toastSuccess(message: string, options?: { description?: string }) {
  sonnerToast.success(message, {
    duration: 4000,
    description: options?.description,
  });
}

/** Warnings and copy-this-link style messages. */
export function toastWarning(message: string, options?: { description?: string; duration?: number }) {
  sonnerToast.warning(message, {
    duration: options?.duration ?? 9000,
    description: options?.description,
  });
}
