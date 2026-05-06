import type { Request, Response } from "express";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { z } from "zod";

const emailQuerySchema = z.object({
  email: z.string().min(1, "email query required"),
});

const idParamSchema = z.object({
  id: z.string().min(1, "id required"),
});

const patchPlayersSchema = z.object({
  spelers: z.unknown(),
});

export type ParticipantsHandlers = {
  listParticipants: ReturnType<typeof asyncHandler>;
  findParticipantByEmail: ReturnType<typeof asyncHandler>;
  listPlayers: ReturnType<typeof asyncHandler>;
  createParticipant: ReturnType<typeof asyncHandler>;
  patchParticipantPlayers: ReturnType<typeof asyncHandler>;
  patchParticipant: ReturnType<typeof asyncHandler>;
  deleteParticipant: ReturnType<typeof asyncHandler>;
};

export function createParticipantsHandlers(gateway: SupabaseGateway): ParticipantsHandlers {
  return {
    listParticipants: asyncHandler(async (_req: Request, res: Response) => {
      const data = await gateway.listParticipants();
      res.json(data);
    }),

    findParticipantByEmail: asyncHandler(async (req: Request, res: Response) => {
      const parsed = emailQuerySchema.safeParse({ email: req.query.email });
      if (!parsed.success) throw new HttpError(400, "email query parameter required");
      const data = await gateway.findParticipantByEmail(parsed.data.email);
      res.json(data);
    }),

    listPlayers: asyncHandler(async (_req: Request, res: Response) => {
      const data = await gateway.listWkSpelers();
      res.json(data);
    }),

    createParticipant: asyncHandler(async (req: Request, res: Response) => {
      const data = await gateway.createParticipant(req.body);
      res.json(data);
    }),

    patchParticipantPlayers: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const body = patchPlayersSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "spelers field required");

      const data = await gateway.patchParticipantPlayers(params.data.id, body.data.spelers);
      res.json(data);
    }),

    patchParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const data = await gateway.patchParticipant(params.data.id, req.body);
      res.json(data);
    }),

    deleteParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      await gateway.deleteParticipant(params.data.id);
      res.status(204).send();
    }),
  };
}
