/* eslint-disable @typescript-eslint/no-unused-vars */
import type { User } from '@server/entity/User';
import type { NextFunction, Request, Response } from 'express';
import 'express-session';

declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

declare global {
  namespace Express {
    export interface Request {
      user?: User;
      locale?: string;
      metadataLocale?: string;
      rawBody?: Buffer;
    }
  }

  export type Middleware = <TParams, TResBody, TReqBody>(
    req: Request,
    res: Response,
    next: NextFunction
  ) => Promise<void | NextFunction> | void | NextFunction;
}
