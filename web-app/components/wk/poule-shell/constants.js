import { buildPhotos, getSupabasePublicUrl } from "@/lib/wk/config";

export const PHOTOS = buildPhotos(getSupabasePublicUrl());
